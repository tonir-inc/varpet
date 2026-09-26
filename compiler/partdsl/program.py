"""Part program: the draft DSL a builder writes for one piece.

Draft until the c105 `part-dsl` skill lands. Ideas from ShapeAssembly
(Jones et al. 2020): parts are placed by attaching unit points to earlier
parts, so contact is built in; `between` stretches a part (legs); `mirror`
and `repeat` make identical copies.

Frame: metres, Z-up, origin at the floor centre of the piece's footprint.
The piece box spans x in [-w/2, w/2], y in [-d/2, d/2], z in [0, h].
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Vec3 = tuple[float, float, float]
Unit3 = tuple[float, float, float]
Axis = Literal["x", "y", "z"]


class Sample(BaseModel):
    """Where in a photo this material shows: code measures its colour there."""

    model_config = ConfigDict(extra="forbid")
    photo: str = Field(description="photo path as given in the brief")
    box: tuple[float, float, float, float] = Field(description="[x0, y0, x1, y1] as fractions of width and height")

    @model_validator(mode="after")
    def _box(self) -> Sample:
        x0, y0, x1, y1 = self.box
        if not (0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1):
            raise ValueError("sample box is [x0, y0, x1, y1] with 0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1")
        return self


class Material(BaseModel):
    """`finish` is a catalog/materials id; `color` tints it; `sample` measures the tint from a photo."""

    model_config = ConfigDict(extra="forbid")
    finish: str | None = None
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    sample: Sample | None = None
    roughness: float | None = Field(default=None, ge=0, le=1)
    kind: Literal["plain", "metal", "mirror", "glass", "fabric"] = "plain"

    @model_validator(mode="after")
    def _known_finish(self) -> Material:
        from .materials import library

        if self.finish is not None and self.finish not in library():
            known = ", ".join(sorted(library())) or "none installed"
            raise ValueError(f"unknown finish {self.finish}; known: {known}")
        return self


class Attach(BaseModel):
    """Put `self` (unit point in this part's box) on `at` (unit point in `to`'s box).

    Unit points run 0..1 on each axis: [0.5, 0.5, 0] is the bottom centre,
    [0, 0.5, 0.5] the middle of the -x face. `to` is an earlier part or "piece".
    """

    model_config = ConfigDict(extra="forbid")
    to: str
    at: Unit3
    self_: Unit3 = Field(alias="self")
    offset: Vec3 = (0.0, 0.0, 0.0)


class Between(BaseModel):
    """Stretch along z from the top of `bottom` (a part or "floor") to the bottom of `top`.

    `at` is the unit x, y point in `top`'s box where the part's centre goes, so
    legs sit under a seat. The part's z size is ignored.
    """

    model_config = ConfigDict(extra="forbid")
    bottom: str
    top: str
    at: tuple[float, float]


class Repeat(BaseModel):
    model_config = ConfigDict(extra="forbid")
    axis: Axis
    count: int = Field(ge=2, le=50)
    step: float


class Part(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]*$")
    shape: Literal["box", "rounded_box", "cylinder"] = "box"
    size: Vec3 = Field(description="[x, y, z] extent in metres; a cylinder's diameter is min(x, y)")
    radius: float = Field(default=0.0, ge=0, description="rounded_box corner radius")
    material: str = "default"
    attach: Attach | None = None
    between: Between | None = None
    rotate: Vec3 = Field(default=(0.0, 0.0, 0.0), description="degrees about the part centre, x then y then z")
    mirror: list[Axis] = Field(default=[], description="add copies reflected through the centre of the box it is placed on")
    repeat: Repeat | None = None
    grain: Axis | None = Field(default=None, description="axis the texture grain runs along")

    @model_validator(mode="after")
    def _one_placement(self) -> Part:
        if (self.attach is None) == (self.between is None):
            raise ValueError(f"{self.id}: give exactly one of attach or between")
        fixed = self.size[:2] if self.between else self.size  # between sets z
        if any(s <= 0 for s in fixed):
            raise ValueError(f"{self.id}: sizes must be positive")
        if self.shape == "rounded_box" and self.radius * 2 > min(self.size) + 1e-9:
            raise ValueError(f"{self.id}: radius too big for the smallest side")
        return self


class Program(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    size: Vec3 = Field(description="true piece size [w, d, h] in metres")
    materials: dict[str, Material] = {}
    parts: list[Part] = Field(min_length=1)

    @model_validator(mode="after")
    def _refs(self) -> Program:
        seen: set[str] = set()
        for p in self.parts:
            if p.id in seen:
                raise ValueError(f"duplicate part id {p.id}")
            refs = [p.attach.to] if p.attach else [p.between.bottom, p.between.top]
            for r in refs:
                if r not in seen and r not in ("piece", "floor"):
                    raise ValueError(f"{p.id}: refers to {r}, which is not an earlier part")
            if p.material != "default" and p.material not in self.materials:
                raise ValueError(f"{p.id}: unknown material {p.material}")
            seen.add(p.id)
        return self
