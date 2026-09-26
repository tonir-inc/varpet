"""Product instructions are explicit assets, independent of coding-agent discovery."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
_PROMPTS = {
    "interior-design-rules": "harness/prompts/interior-design-rules.md",
    "plan-to-scene": "harness/prompts/plan-to-scene.md",
    "furnish-from-plan": "harness/prompts/furnish-from-plan.md",
    "scene-visual-check": "harness/prompts/scene-visual-check.md",
    # Shared product skills remain owned and maintained by their existing lanes.
    "flat-shell": ".agents/skills/flat-shell/SKILL.md",
    "flat-furnish": ".agents/skills/flat-furnish/SKILL.md",
    "part-dsl-draft": ".agents/skills/part-dsl-draft/SKILL.md",
}


def product_prompt_names(repo: Path = ROOT) -> list[str]:
    """Advertise only registered product prompts actually available in this checkout."""
    return sorted(name for name, relative in _PROMPTS.items() if (repo / relative).is_file())


def resolve_product_prompt(name: str, repo: Path = ROOT) -> Path:
    relative = _PROMPTS.get(name)
    if relative is None:
        raise FileNotFoundError(f"Unsupported product prompt: {name}")
    path = repo / relative
    if not path.is_file():
        raise FileNotFoundError(f"Product prompt {name} not found: {path}")
    return path
