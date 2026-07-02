---
'@ai-sdk/harness-codex': patch
---

Avoid passing large host tool schemas through the Codex command-line config by writing them to a bridge file and passing a schema file path to the host tool MCP server.
