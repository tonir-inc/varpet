"""Terminate only a worker's observed process tree, including detached MCP groups."""

from __future__ import annotations

from dataclasses import dataclass
import os
import signal
import subprocess


@dataclass(frozen=True)
class ProcessEntry:
    pid: int
    parent: int
    group: int
    state: str = ""


def _processes(*, states: bool = False) -> dict[int, ProcessEntry]:
    columns = "pid=,ppid=,pgid=,stat=" if states else "pid=,ppid=,pgid="
    result = subprocess.run(["ps", "-axo", columns], check=True, capture_output=True,
                            text=True, timeout=.2)
    entries = {}
    for line in result.stdout.splitlines():
        fields = line.split()
        if len(fields) < 3:
            continue
        pid, parent, group = map(int, fields[:3])
        entries[pid] = ProcessEntry(pid, parent, group, fields[3] if states else "")
    return entries


def _tree_depths(entries: dict[int, ProcessEntry], root: int) -> dict[int, int]:
    if root not in entries:
        return {}
    children: dict[int, list[int]] = {}
    for entry in entries.values():
        children.setdefault(entry.parent, []).append(entry.pid)
    depths = {root: 0}
    pending = [root]
    while pending:
        parent = pending.pop()
        for child in children.get(parent, []):
            if child not in depths:
                depths[child] = depths[parent] + 1
                pending.append(child)
    return depths


def _exited(target: int, *, group: bool) -> bool:
    """EPERM is benign only when a fresh process listing proves no live target."""
    entries = _processes(states=True)
    matching = [entry for entry in entries.values()
                if (entry.group if group else entry.pid) == target]
    return all(entry.state.startswith("Z") for entry in matching)


def terminate_tree(process: subprocess.Popen) -> None:
    """Kill an observed worker tree once, descendants first, then reap the worker.

    Call while the worker still exists: ancestry cannot be recovered after an
    exited worker's children are reparented. Never signal a group whose leader
    was outside this snapshot's owned tree. A previously reaped worker is a no-op.
    Live permission failures and inspection failures propagate to the caller.
    """
    if process.returncode is not None:
        return
    entries = _processes()
    depths = _tree_depths(entries, process.pid)
    groups = {entries[pid].group for pid in depths if entries[pid].group in depths}
    targets = [(depths[group], True, group) for group in groups]
    targets.extend((depth, False, pid) for pid, depth in depths.items()
                   if entries[pid].group not in groups)
    for _, is_group, target in sorted(targets, reverse=True):
        try:
            if is_group:
                os.killpg(target, signal.SIGKILL)
            else:
                os.kill(target, signal.SIGKILL)
        except ProcessLookupError:
            # The owned process/group exited between the snapshot and signal.
            pass
        except PermissionError:
            # macOS may return EPERM for a group containing only zombies.
            # Its leader being dead alone does not prove all members are dead.
            if not _exited(target, group=is_group):
                raise
    process.wait(timeout=.2)
