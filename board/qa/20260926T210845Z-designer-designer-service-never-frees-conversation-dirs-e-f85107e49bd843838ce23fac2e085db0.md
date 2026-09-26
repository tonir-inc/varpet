---
id: "20260926T210845Z-designer-designer-service-never-frees-conversation-dirs-e-f85107e49bd843838ce23fac2e085db0"
lane: "designer"
severity: "minor"
status: "open"
title: "Designer service never frees conversation dirs: editor never calls DELETE, aborted first turns are orphaned, SIGTERM skips cleanup"
reported_by: "bughunt-designer-service"
created: "2026-09-26T21:08:45.230464Z"
---

**Steps**

Use the designer for a while (several threads, stop one first turn), then check $TMPDIR/varpet-designer-service-*. Restart the service with kill/SIGTERM instead of Ctrl-C.

**Expected**

Conversations the client can no longer reach (aborted or failed first turn, closed thread) are deleted or expire. Service shutdown removes its temp dir.

**Actual**

The live service dir varpet-designer-service-qjy0qh_y holds 8 conversations of 6-11 MB each, all kept until process exit. endDesignerConversation (apps/editor/src/adapters/designer-http.ts:374) has no caller in apps/editor/src, so DELETE /designer/conversations/<id> is never used. Conversation f887ad5b is an aborted first turn: error and abort records carry no conversationId (designer_service.py:583-585), so the client can never delete it. There is no idle expiry. main() only catches KeyboardInterrupt (designer_service.py:632-637), so other shutdowns skip service.close(). Dirs from earlier service instances (20:05-21:55 on 26 Sep, 4-23 MB each, with runtime/ and a leftover turn-lqw75wod) are still in $TMPDIR.

**Evidence**



**Notes**
