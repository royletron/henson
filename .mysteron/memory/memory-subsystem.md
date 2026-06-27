---
name: memory-subsystem
description: How project memory works and who owns the memory subsystem
metadata:
  type: project
---

Shared project memory lives in `.mysteron/memory/` and is owned by `src/core/memory.ts` (exposed to agents through the `list_memories` / `read_memory` / `write_memory` MCP tools in `src/mcp/server.ts`).

**How to use it**

- Memory is **shared context**, committed with the repo so it travels to every clone.
- Names **mirror the `src/` tree** — use nested names like `core/board` or `server/api`. `write_memory` creates parent dirs and `list_memories` recurses, so the layout maps onto the code it describes. (Nested names go live once ticket 87bx14f4 is merged and the MCP server restarts.)
- It is **not one fact per file** — a memory file may hold as many related facts about its area as make sense.
- Record what you learn **as you work**: when you read a file to find out whether you own something and discover you do, write that down here and commit it alongside your code.

This entry is the worked example: it documents the `core/` memory subsystem. Once nested names are live it belongs at `core/memory`.
