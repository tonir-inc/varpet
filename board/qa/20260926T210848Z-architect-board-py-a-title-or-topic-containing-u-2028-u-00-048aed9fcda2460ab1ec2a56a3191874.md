---
id: "20260926T210848Z-architect-board-py-a-title-or-topic-containing-u-2028-u-00-048aed9fcda2460ab1ec2a56a3191874"
lane: "architect"
severity: "minor"
status: "open"
title: "board.py: a title or topic containing U+2028/U+0085 makes every board command fail for all lanes"
reported_by: "bughunt-tooling"
created: "2026-09-26T21:08:48.489080Z"
---

**Steps**

bash /tmp/bughunt-tooling/linesep.sh (qa add with a title containing U+2028, e.g. text pasted from a web page or PDF; post with the same topic)

**Expected**

The title is rejected as multi-line, or stored so that it can be read back

**Actual**

single_line (tools/board.py:36-37) rejects only \r, \n and \x00, but readers split with str.splitlines() (lines 49 and 175), which also breaks on U+2028, U+2029 and U+0085. Message topics are written raw, so \x0b, \x0c and \x1c-\x1e also break them. QA titles pass through json.dumps(ensure_ascii=False), which escapes chars below 0x20 but not U+2028/U+0085. Result: 'qa add' exits 1 with 'invalid QA issue (Unterminated string...)' but leaves the bad file STAGED. 'post' exits 0. After that, 'qa list', 'qa summary', 'list' and 'unread' all exit 1 ('invalid front matter'), because qa_issues/messages parse every file and raise on the first bad one. Once committed, the board is unusable for every lane that pulls until someone edits the file by hand.

**Evidence**



**Notes**
