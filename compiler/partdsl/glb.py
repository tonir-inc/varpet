"""Rewrite a GLB's JSON chunk: one root node per piece with our metadata in extras.

Atlas's files carried no ids, so their viewer matched furniture by name. Ours carry
the piece's frame and size on the root, and part id, finish and tint on every part,
so the editor, the designer's ops and the scene JSON join on ids.
"""

from __future__ import annotations

import json
import struct

JSON_CHUNK, BIN_CHUNK = 0x4E4F534A, 0x004E4942

FRAME = {"units": "m", "up": "+Y", "front": "+Z",
         "origin": "floor centre of the footprint", "size_order": "[width x, depth z, height y]"}


def read(data: bytes) -> tuple[dict, bytes]:
    magic, _, _ = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67:
        raise ValueError("not a GLB")
    length, kind = struct.unpack_from("<II", data, 12)
    if kind != JSON_CHUNK:
        raise ValueError("first chunk is not JSON")
    doc = json.loads(data[20 : 20 + length])
    rest = data[20 + length :]
    binary = b""
    if rest:
        blen, bkind = struct.unpack_from("<II", rest, 0)
        if bkind == BIN_CHUNK:
            binary = rest[8 : 8 + blen]
    return doc, binary


def write(doc: dict, binary: bytes) -> bytes:
    text = json.dumps(doc, separators=(",", ":")).encode()
    text += b" " * (-len(text) % 4)
    binary += b"\0" * (-len(binary) % 4)
    chunks = struct.pack("<II", len(text), JSON_CHUNK) + text
    if binary:
        chunks += struct.pack("<II", len(binary), BIN_CHUNK) + binary
    return struct.pack("<III", 0x46546C67, 2, 12 + len(chunks)) + chunks


def tag(data: bytes, piece: dict, parts: dict[str, dict]) -> bytes:
    """Group all scene nodes under one named root carrying `piece`; tag part nodes."""
    doc, binary = read(data)
    for mesh in doc.get("meshes", []):
        mesh.pop("extras", None)  # trimesh's own shape metadata, not ours
    scene = doc["scenes"][doc.get("scene", 0)]
    for i in scene["nodes"]:
        node = doc["nodes"][i]
        node["extras"] = {"varpet": parts.get(node.get("name"), {})}
    root = {"name": piece["name"], "children": scene["nodes"],
            "extras": {"varpet": {"schema": "varpet.piece.v1", **piece, "frame": FRAME}}}
    doc["nodes"].append(root)
    scene["nodes"] = [len(doc["nodes"]) - 1]
    doc["asset"]["generator"] = "varpet partdsl (trimesh)"
    _clearcoat(doc)
    return write(doc, binary)


def _clearcoat(doc: dict) -> None:
    from .materials import library

    used = False
    for mat in doc.get("materials", []):
        name = mat.get("name", "")
        finish = library().get(name.removeprefix("finish:")) if name.startswith("finish:") else None
        if finish and finish.clearcoat > 0:
            mat.setdefault("extensions", {})["KHR_materials_clearcoat"] = {
                "clearcoatFactor": finish.clearcoat, "clearcoatRoughnessFactor": finish.clearcoat_roughness}
            used = True
    if used and "KHR_materials_clearcoat" not in doc.setdefault("extensionsUsed", []):
        doc["extensionsUsed"].append("KHR_materials_clearcoat")
