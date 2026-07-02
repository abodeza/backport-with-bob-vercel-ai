---
'ai': patch
---

Fix a race in chat request finalization that logged a TypeError when overlapping resume streams cleared the shared active response.
