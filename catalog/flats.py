"""Saved-flat HTTP boundary and isolated PostgreSQL repository.

Only the bounded body read runs on the event loop. Parsing, validation, SQL and
serialization run in a worker. Never include request bodies or SQL errors in logs.
"""
import base64
import binascii
import json
from datetime import datetime
from typing import Protocol
from uuid import UUID, uuid4

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from starlette.concurrency import run_in_threadpool
from starlette.responses import Response

MAX_BODY = 25 * 1024 * 1024
MAX_THUMBNAIL = 300 * 1024
KEEP_VERSIONS = 50
META = """id, name, kind, designed, summary, revision, created_at, updated_at,
          updated_by, thumbnail IS NOT NULL AS has_thumbnail"""
LIST_SQL = f"""SELECT {META} FROM flats.flat
               WHERE (%s OR deleted_at IS NULL) ORDER BY updated_at DESC, id"""
PRUNE_SQL = """DELETE FROM flats.flat_version WHERE flat_id = %s AND revision IN
    (SELECT revision FROM flats.flat_version WHERE flat_id = %s
     ORDER BY revision DESC OFFSET %s)"""


class FlatError(Exception):
    def __init__(self, status, code, message, **details):
        super().__init__(message)
        self.status = status
        self.error = {"code": code, "message": message, **details}


def bad(message):
    raise FlatError(400, "invalid_request", message)


def required(row):
    if row is None:
        raise FlatError(404, "not_found", "Flat or version not found")
    return row


def positive_int(value, label):
    if type(value) is not int or not 1 <= value <= 2147483647:
        bad(f"{label} must be a positive 32-bit integer")
    return value


def validate(data, action):
    if not isinstance(data, dict):
        bad("Request body must be a JSON object")
    if action in ("create", "rename"):
        name = data.get("name")
        if not isinstance(name, str) or not 1 <= len(name) <= 120 or not name.strip():
            bad("name must contain 1 to 120 characters")
    if action in ("create", "save"):
        scene = data.get("scene")
        if not isinstance(scene, dict) or "version" not in scene or "rooms" not in scene:
            bad("scene must be an object containing version and rooms")
        if not isinstance(data.get("catalog"), list):
            bad("catalog must be an array")
        if "designed" in data and type(data["designed"]) is not bool:
            bad("designed must be a boolean")
        if "summary" in data and not isinstance(data["summary"], dict):
            bad("summary must be an object")
        if "updated_by" in data and data["updated_by"] is not None and not isinstance(data["updated_by"], str):
            bad("updated_by must be text or null")
        if "thumbnail" in data:
            value = data["thumbnail"]
            if not isinstance(value, str) or "," not in value:
                bad("thumbnail must be a base64 image/jpeg, image/png or image/webp data URL")
            header, encoded = value.split(",", 1)
            types = {f"data:{mime};base64": mime for mime in ("image/jpeg", "image/png", "image/webp")}
            if header not in types:
                bad("thumbnail must be a base64 image/jpeg, image/png or image/webp data URL")
            if len(encoded) > 4 * ((MAX_THUMBNAIL + 2) // 3):
                bad("thumbnail exceeds 300 KB")
            try:
                decoded = base64.b64decode(encoded, validate=True)
            except (ValueError, binascii.Error):
                bad("thumbnail contains invalid base64")
            if not decoded or len(decoded) > MAX_THUMBNAIL:
                bad("thumbnail must contain 1 to 300 KB of image data")
            data = {**data, "thumbnail": decoded, "thumbnail_type": types[header]}
    if action == "create" and data.get("kind", "other") not in ("template", "upload", "blank", "other"):
        bad("kind must be template, upload, blank or other")
    if action == "save":
        positive_int(data.get("base_revision"), "base_revision")
    if action == "restore":
        positive_int(data.get("revision"), "revision")
    return data


class Repository(Protocol):
    """Replace this boundary with an in-memory fake in HTTP tests."""
    def list(self, include_deleted: bool): ...
    def create(self, data: dict): ...
    def get(self, flat_id: str): ...
    def save(self, flat_id: str, data: dict): ...
    def rename(self, flat_id: str, data: dict): ...
    def delete(self, flat_id: str): ...
    def thumbnail(self, flat_id: str): ...
    def versions(self, flat_id: str): ...
    def version(self, flat_id: str, revision: int): ...
    def restore(self, flat_id: str, data: dict): ...


class PostgresRepository:
    def __init__(self, connect):
        self.connect = connect

    @staticmethod
    def _flat(c, flat_id, lock=False):
        return required(c.execute(
            f"SELECT {META} FROM flats.flat WHERE id = %s AND deleted_at IS NULL"
            + (" FOR UPDATE" if lock else ""), (flat_id,)).fetchone())

    @staticmethod
    def _insert_version(c, flat_id, revision, scene, catalog, updated_by):
        size = len(json.dumps({"scene": scene, "catalog": catalog}, ensure_ascii=False,
                              separators=(",", ":"), allow_nan=False).encode("utf-8"))
        c.execute("""INSERT INTO flats.flat_version
            (flat_id, revision, scene, catalog, bytes, updated_by)
            VALUES (%s, %s, %s, %s, %s, %s)""",
                  (flat_id, revision, Jsonb(scene), Jsonb(catalog), size, updated_by))
        c.execute(PRUNE_SQL, (flat_id, flat_id, KEEP_VERSIONS))

    def list(self, include_deleted=False):
        with self.connect() as conn, conn.cursor(row_factory=dict_row) as c:
            return c.execute(LIST_SQL, (include_deleted,)).fetchall()

    def create(self, data):
        flat_id = str(uuid4())
        with self.connect() as conn, conn.transaction(), conn.cursor(row_factory=dict_row) as c:
            row = c.execute(f"""INSERT INTO flats.flat
                (id, name, kind, designed, summary, thumbnail, thumbnail_type, updated_by)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING {META}""",
                (flat_id, data["name"], data.get("kind", "other"), data.get("designed", False),
                 Jsonb(data.get("summary", {})), data.get("thumbnail"), data.get("thumbnail_type"),
                 data.get("updated_by"))).fetchone()
            self._insert_version(c, flat_id, 1, data["scene"], data["catalog"], data.get("updated_by"))
            return row

    def get(self, flat_id):
        with self.connect() as conn, conn.cursor(row_factory=dict_row) as c:
            # One statement gives a coherent metadata + version snapshot during concurrent saves.
            return required(c.execute("""SELECT f.id, f.name, f.kind, f.designed, f.summary,
                f.revision, f.created_at, f.updated_at, f.updated_by,
                f.thumbnail IS NOT NULL AS has_thumbnail, v.scene, v.catalog
                FROM flats.flat f JOIN flats.flat_version v
                ON v.flat_id = f.id AND v.revision = f.revision
                WHERE f.id = %s AND f.deleted_at IS NULL""", (flat_id,)).fetchone())

    def save(self, flat_id, data):
        with self.connect() as conn, conn.transaction(), conn.cursor(row_factory=dict_row) as c:
            row = self._flat(c, flat_id, lock=True)
            if row["revision"] != data["base_revision"]:
                raise FlatError(409, "conflict", "Flat has a newer revision",
                                current_revision=row["revision"], updated_at=row["updated_at"],
                                updated_by=row["updated_by"])
            revision = row["revision"] + 1
            who = data.get("updated_by")
            self._insert_version(c, flat_id, revision, data["scene"], data["catalog"], who)
            return c.execute("""UPDATE flats.flat SET revision = %s, updated_at = clock_timestamp(),
                designed = %s, summary = %s, updated_by = %s,
                thumbnail = CASE WHEN %s THEN %s ELSE thumbnail END,
                thumbnail_type = CASE WHEN %s THEN %s ELSE thumbnail_type END
                WHERE id = %s RETURNING revision, updated_at""",
                (revision, data.get("designed", row["designed"]), Jsonb(data.get("summary", row["summary"])),
                 who, "thumbnail" in data, data.get("thumbnail"), "thumbnail" in data,
                 data.get("thumbnail_type"), flat_id)).fetchone()

    def rename(self, flat_id, data):
        with self.connect() as conn, conn.cursor(row_factory=dict_row) as c:
            return required(c.execute(f"""UPDATE flats.flat SET name = %s, updated_at = clock_timestamp()
                WHERE id = %s AND deleted_at IS NULL RETURNING {META}""", (data["name"], flat_id)).fetchone())

    def delete(self, flat_id):
        with self.connect() as conn, conn.cursor(row_factory=dict_row) as c:
            required(c.execute("""UPDATE flats.flat SET deleted_at = clock_timestamp(),
                updated_at = clock_timestamp() WHERE id = %s AND deleted_at IS NULL RETURNING id""",
                (flat_id,)).fetchone())

    def thumbnail(self, flat_id):
        with self.connect() as conn, conn.cursor(row_factory=dict_row) as c:
            row = required(c.execute("""SELECT thumbnail, thumbnail_type FROM flats.flat
                WHERE id = %s AND deleted_at IS NULL AND thumbnail IS NOT NULL""", (flat_id,)).fetchone())
            return bytes(row["thumbnail"]), row["thumbnail_type"]

    def versions(self, flat_id):
        with self.connect() as conn, conn.cursor(row_factory=dict_row) as c:
            self._flat(c, flat_id)
            return c.execute("""SELECT v.revision, v.saved_at, v.bytes, v.updated_by
                FROM flats.flat_version v JOIN flats.flat f ON f.id = v.flat_id
                WHERE f.id = %s AND f.deleted_at IS NULL ORDER BY v.revision DESC""", (flat_id,)).fetchall()

    def version(self, flat_id, revision):
        with self.connect() as conn, conn.cursor(row_factory=dict_row) as c:
            return required(c.execute("""SELECT v.revision, v.scene, v.catalog
                FROM flats.flat_version v JOIN flats.flat f ON f.id = v.flat_id
                WHERE f.id = %s AND f.deleted_at IS NULL AND v.revision = %s""",
                (flat_id, revision)).fetchone())

    def restore(self, flat_id, data):
        with self.connect() as conn, conn.transaction(), conn.cursor(row_factory=dict_row) as c:
            row = self._flat(c, flat_id, lock=True)
            source = required(c.execute("""SELECT scene, catalog FROM flats.flat_version
                WHERE flat_id = %s AND revision = %s""", (flat_id, data["revision"])).fetchone())
            revision = row["revision"] + 1
            # Restore has no author field in the contract; do not attribute it to an old author.
            self._insert_version(c, flat_id, revision, source["scene"], source["catalog"], None)
            c.execute("""UPDATE flats.flat SET revision = %s, updated_at = clock_timestamp(),
                updated_by = NULL WHERE id = %s""", (revision, flat_id))
            return {"revision": revision}


def json_default(value):
    if isinstance(value, (UUID, datetime)):
        return str(value) if isinstance(value, UUID) else value.isoformat()
    raise TypeError("Unsupported response value")


def json_response(value, status=200):
    return Response(json.dumps(value, default=json_default, allow_nan=False), status_code=status,
                    media_type="application/json", headers={"Cache-Control": "no-store"})


def dispatch(repo: Repository, action, request, body):
    """Synchronous route body, including validation and response serialization."""
    try:
        flat_id = request.path_params.get("flat_id")
        if flat_id is not None:
            try:
                flat_id = str(UUID(flat_id))
            except (ValueError, AttributeError):
                bad("id must be a UUID")
        if action == "list":
            flag = request.query_params.get("include_deleted", "0")
            if flag not in ("0", "1"):
                bad("include_deleted must be 0 or 1")
            return json_response({"flats": repo.list(flag == "1")})
        data = None
        if action in ("create", "save", "rename", "restore"):
            try:
                data = json.loads(body, parse_constant=lambda _: bad("Body must contain valid JSON"))
                # PostgreSQL jsonb cannot store NUL or unpaired Unicode surrogates.
                serialized = json.dumps(data, ensure_ascii=False, allow_nan=False)
                serialized.encode("utf-8")
                pending = [data]
                while pending:
                    value = pending.pop()
                    if isinstance(value, str) and "\x00" in value:
                        bad("Body must not contain NUL characters")
                    if isinstance(value, dict):
                        pending.extend(value.keys())
                        pending.extend(value.values())
                    elif isinstance(value, list):
                        pending.extend(value)
            except (ValueError, UnicodeError, RecursionError):
                bad("Body must contain valid JSON")
            data = validate(data, action)
        if action == "create":
            return json_response(repo.create(data), 201)
        if action == "thumbnail":
            content, mime = repo.thumbnail(flat_id)
            return Response(content, media_type=mime, headers={"Cache-Control": "no-store"})
        if action == "delete":
            repo.delete(flat_id)
            return Response(status_code=204, headers={"Cache-Control": "no-store"})
        if action == "version":
            try:
                revision = int(request.path_params["revision"])
            except ValueError:
                bad("revision must be a positive integer")
            result = repo.version(flat_id, positive_int(revision, "revision"))
        elif action == "versions":
            result = {"versions": repo.versions(flat_id)}
        elif action in ("save", "rename", "restore"):
            result = getattr(repo, action)(flat_id, data)
        else:
            result = repo.get(flat_id)
        return json_response(result)
    except FlatError as exc:
        return json_response({"error": exc.error}, exc.status)
    except psycopg.Error:
        # DB exception details can contain scene values. Do not log or echo them.
        return json_response({"error": {"code": "database_unavailable", "message": "Saved flats database unavailable"}}, 503)


def make_route(repo: Repository, actions, cors):
    async def route(request):
        if request.method == "OPTIONS":
            return cors(request, Response(status_code=204, headers={
                "Access-Control-Allow-Methods": ", ".join([*actions, "OPTIONS"]),
                "Access-Control-Allow-Headers": "Content-Type"}))
        try:
            length = request.headers.get("content-length")
            if length is not None:
                try:
                    size = int(length)
                except ValueError:
                    bad("Invalid Content-Length")
                if size < 0:
                    bad("Invalid Content-Length")
                if size > MAX_BODY:
                    raise FlatError(413, "body_too_large", "Request body exceeds 25 MB")
            body = bytearray()
            async for chunk in request.stream():
                if len(body) + len(chunk) > MAX_BODY:
                    raise FlatError(413, "body_too_large", "Request body exceeds 25 MB")
                body.extend(chunk)
            method = "GET" if request.method == "HEAD" else request.method
            response = await run_in_threadpool(dispatch, repo, actions[method], request, body)
        except FlatError as exc:
            response = json_response({"error": exc.error}, exc.status)
        return cors(request, response)
    return route
