---
name: Metro blockList
description: All Replit temp directories that must be in metro.config.js resolver.blockList to prevent FallbackWatcher ENOENT crashes
---

Metro FallbackWatcher crashes when Replit creates/deletes temp files inside directories it is watching. The fix is `config.resolver.blockList` in `metro.config.js`.

**Current block patterns (must all be present):**
- `/\.local[/\\]skills[/\\]/` — skill runner temp files
- `/\.local[/\\]secondary_skills[/\\]/` — secondary skills temp files (e.g. `.tmp-replit-migration-guardrails-*`)
- `/\.local[/\\]state[/\\]/` — workflow log files

**Why:** Replit agent tools create/delete temp files in these directories at runtime. Metro's file watcher watches the whole workspace; when those files vanish, it throws ENOENT and kills the dev server.

**How to apply:** Any time a new Replit internal directory causes a Metro crash with `ENOENT ... watch ...`, add a regex for it to the blockList array.
