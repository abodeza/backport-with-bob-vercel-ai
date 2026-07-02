---
'ai': patch
---

Improve streaming text and reasoning accumulation performance by appending deltas to lazy chunk-backed text parts instead of repeatedly concatenating cumulative strings.
