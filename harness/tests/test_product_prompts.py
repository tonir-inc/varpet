"""Product prompt discovery must not depend on coding-agent workflow discovery."""

from pathlib import Path
from types import SimpleNamespace
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import designer
import designer_profiles
from varpet_harness import architect, codex_runner
from varpet_harness.graph import Job
from varpet_harness.product_prompts import product_prompt_names, resolve_product_prompt


ROOT = Path(__file__).resolve().parents[2]
MOVED = ("flat-furnish", "flat-shell", "furnish-from-plan", "interior-design-rules", "part-dsl-draft", "plan-to-scene",
         "scene-visual-check")
DOMAINS = sorted(MOVED)


@pytest.fixture
def isolated_repo(tmp_path):
    for name in DOMAINS:
        path = tmp_path / "harness/prompts" / f"{name}.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f"---\nname: {name}\n---\n\nProduct instructions: {name}\n")
    return tmp_path


def test_discovery_is_only_product_domains_regardless_of_coding_tooling(isolated_repo):
    assert product_prompt_names(isolated_repo) == DOMAINS
    workflow = isolated_repo / ".agents/skills/designer-build/SKILL.md"
    workflow.parent.mkdir(parents=True)
    workflow.write_text("Coding workflow, never a product instruction")
    (isolated_repo / "harness/prompts/product-ui.md").write_text("Not a registered product prompt")
    assert product_prompt_names(isolated_repo) == DOMAINS
    with pytest.raises(FileNotFoundError, match="designer-build"):
        resolve_product_prompt("designer-build", isolated_repo)


def test_moved_prompts_resolve_without_old_coding_skill_paths(isolated_repo):
    for name in MOVED:
        assert not (isolated_repo / ".agents/skills" / name).exists()
        assert resolve_product_prompt(name, isolated_repo) == isolated_repo / "harness/prompts" / f"{name}.md"
    (isolated_repo / "harness/prompts/plan-to-scene.md").unlink()
    with pytest.raises(FileNotFoundError, match="plan-to-scene"):
        resolve_product_prompt("plan-to-scene", isolated_repo)
    with pytest.raises(FileNotFoundError):
        resolve_product_prompt("../../AGENTS.md", isolated_repo)


def test_builder_inlines_registered_domain_text_and_rejects_coding_workflows(isolated_repo, monkeypatch):
    monkeypatch.setattr(codex_runner, "thread_config", lambda: {})
    runner = codex_runner.CodexRunner(object(), isolated_repo)
    job = Job(id="shell", kind="shell", brief="Read the plan", skills=["plan-to-scene", "flat-shell"])
    text = runner._first_input(job, isolated_repo / "shell.json", {})[0].text
    assert "Product instructions: plan-to-scene\n" in text
    assert "Product instructions: flat-shell\n" in text
    assert "name: flat-shell" not in text  # Existing frontmatter stripping is unchanged.
    job.skills = ["designer-build"]
    with pytest.raises(FileNotFoundError, match="designer-build"):
        runner._first_input(job, isolated_repo / "shell.json", {})


async def test_architect_advertises_product_registry_only(isolated_repo, monkeypatch):
    captured = []
    workflow = isolated_repo / ".agents/skills/designer-build/SKILL.md"
    workflow.parent.mkdir(parents=True)
    workflow.write_text("Coding workflow")

    class Thread:
        id = "offline-thread"

        async def run(self, items, **kwargs):
            captured.append(items[0].text)
            return SimpleNamespace(final_response='{"flat":"flat","jobs":[{"id":"shell","kind":"shell","brief":"Read plan"}]}')

    class Codex:
        async def thread_start(self, **kwargs):
            return Thread()

        async def thread_archive(self, thread_id):
            assert thread_id == "offline-thread"

    monkeypatch.setattr(architect, "thread_config", lambda: {})
    await architect.plan(Codex(), isolated_repo, "flat", "plan.txt", [], [])
    assert "Give each job only the skills it needs from: " + ", ".join(DOMAINS) + "." in captured[0]
    assert "designer-build" not in captured[0]


def test_relocated_prompt_assets_retain_discoverable_identity_and_instructions():
    for name in MOVED:
        path = resolve_product_prompt(name, ROOT)
        assert path == ROOT / "harness/prompts" / f"{name}.md"
        text = path.read_text()
        assert text.startswith("---\n")
        metadata, body = text[4:].split("\n---\n", 1)
        assert f"name: {name}" in metadata.splitlines()
        assert body.strip(), "A registered product prompt must contain instructions"


def test_designer_full_and_compact_prefixes_include_the_complete_moved_asset():
    assert designer.SKILL == ROOT / "harness/prompts/interior-design-rules.md"
    instructions = designer.SKILL.read_text()
    introduction = (ROOT / "harness/designer_prompt.md").read_text()
    full = designer.static_prefix()
    assert full == introduction + "\n\n" + instructions
    for context in ("compact", "compact-base"):
        compact = designer_profiles.prompt("without-place", context, full)
        assert compact.endswith(instructions)
        assert compact.count(instructions) == 1
        assert "do not read files, list resources or fetch skills" in compact
