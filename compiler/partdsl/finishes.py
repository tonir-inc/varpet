"""Write the live finish list into the builder skill: python -m partdsl.finishes"""

from pathlib import Path

from .materials import library

SKILL = Path(__file__).resolve().parents[2] / "harness" / "prompts" / "part-dsl-draft.md"
START, END = "<!-- finishes:start -->", "<!-- finishes:end -->"


def table() -> str:
    rows = [f"| `{f.id}` | {f.family} | {f.default_color} | {'yes' if f.grain else ''} |" for f in finishes()]
    return "\n".join(["| finish | family | usual colour | grain |", "|---|---|---|---|", *rows])


def finishes():
    """Plain ids only: `-gen` and `-alt` sets are candidates; the winner takes the plain id."""
    return [f for f in sorted(library().values(), key=lambda f: (f.family, f.id))
            if not f.id.endswith(("-gen", "-alt"))]


def main() -> None:
    text = SKILL.read_text()
    head, rest = text.split(START)
    _, tail = rest.split(END)
    SKILL.write_text(f"{head}{START}\n{table()}\n{END}{tail}")
    print(f"{len(finishes())} finishes written to {SKILL}")


if __name__ == "__main__":
    main()
