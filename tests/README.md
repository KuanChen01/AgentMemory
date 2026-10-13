# Running the tests

```
npx tsc
node --test --test-concurrency=1 tests/*.test.cjs
```

- **Windows** (the primary platform): every test runs.
- **Linux/macOS**: use **Node 24**. The prebuilt better-sqlite3 binary segfaults under Node 20/22 on Linux.
  Tests that need PowerShell/cmd or Windows drive-letter project paths (`E:/...`) are reported as
  *skipped* with that reason (see `tests/helpers/platform.cjs`); everything else must pass (0 failures).
- Worker fixtures pick a fresh free port per worker (`tests/helpers/task-worker.cjs` `freePort`), so files never share a fixed port.
- All fixtures use temp directories and a local LLM stub; no real API calls.
