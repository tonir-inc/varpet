---
id: "20260926T210845Z-designer-saved-designer-threads-break-for-good-after-a-de-dd964bd8e4274f21869d79a1d36ba0cc"
lane: "designer"
severity: "major"
status: "open"
title: "Saved designer threads break for good after a designer-service restart, and Retry keeps resending the dead conversationId"
reported_by: "bughunt-designer-service"
created: "2026-09-26T21:08:45.112739Z"
---

**Steps**

1) Chat with the designer in the editor (conversationId is saved to localStorage history). 2) Restart designer_service.py (conversations are in memory only). 3) Reload the editor and send a message in the same thread. 4) Click Retry.

**Expected**

The editor notices the unknown conversation, drops the old conversationId and starts a new server conversation, or offers a one-click 'start new conversation'. Retry works.

**Actual**

Every request returns {type:error, message:'Unknown conversationId; start a new conversation after restarting the service'} (harness/designer_service.py:227-231). The error record has no conversationId, and apps/editor/src/ui/designer-panel.ts:260 only updates state.conversationId on non-error results. The error sets retryRequest, so Retry resends the same stale id and fails every time. Every thread restored from localStorage (designer-panel.ts:141) is dead after any service restart. Repro: curl -X POST http://127.0.0.1:8787/designer/propose -H 'Origin: http://localhost:5173' -d '{"scene":{"format":"varpet.editor"},"revision":0,"request":"move the sofa","conversationId":"deadbeef"}' -> progress, then that error.

**Evidence**



**Notes**
