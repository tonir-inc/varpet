# harness

Python `openai-codex` SDK driver: one thread per job (a piece, a designer request) in parallel, `ApprovalMode.deny_all`. Watchdog on no output, launch with `< /dev/null`, stop the batch on rate or usage limit on stderr. See Notion: Engineering / Codex harness.
