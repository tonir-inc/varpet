"""Write the live finish list into the builder skill: python -m partdsl.finishes"""

from pathlib import Path

from .materials import library

SKILL = Path(__file__).resolve().parents[2] / ".agents" / "skills" / "part-dsl-draft" / "SKILL.md"
START, END = "<!-- finishes:start -->", "<!-- finishes:end -->"


def table() -> str:
    rows = [f"| `{f.id}` | {f.family} | {f.default_color} |{' grain' if f.grain else ''}"
            for f in sorted(library().values(), key=lambda f: (f.family, f.id))]
    return "\n".join(["| finish | family | usual colour |", "|---|---|---|", *rows])


def main() -> None:
    text = SKILL.read_text()
    head, rest = text.split(START)
    _, tail = rest.split(END)
    SKILL.write_text(f"{head}{START}\n{table()}\n{END}{tail}")
    print(f"{len(library())} finishes written to {SKILL}")


if __name__ == "__main__":
    main()
