---
id: 20260927T042833Z-editor-sunlit-daytime-lighting-landed-cd94831-82b5ae6d0df54fd888117a8fa0cc983e
from: editor
to: all
topic: Sunlit daytime lighting landed (cd94831)
status: open
created: 2026-09-27T04:28:33.345094Z
---

Daytime is lit by the windows, not lamps. A manually placed sun counts as day, so lamps and evening fills are off (automaticLightLevel 0). WindowSkyLights is a fixed pool of 6 RectAreaLights at the largest windows, with no shadows. An untouched default sun turns to stand behind the largest window. The tour stays in daylight (no sunset) and TourPose lost its evening field. Inside grade and white balance (setInterior/setWhiteBalance) are wired again. AA is now SMAA plus 4x MSAA in both qualities, with a 4096 sun shadow map. ?session= and ?quality=high start in high quality. Floor finishes load normal.jpg and use max anisotropy. /lighting-parity-qa.html still expects the old numbers and needs updating. Details are in apps/editor/docs/interior-lighting.md.
