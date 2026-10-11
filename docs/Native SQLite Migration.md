# Native SQLite Migration

AgentMemory uses `better-sqlite3@13.0.3` and requires Node.js 22 or newer. Both known machines use Node 24 (24.13.0 and 24.14.0). The Windows x64 installation was verified locally; the other machine still needs its own native-module and service checks.

The repository `.npmrc` sets `ignore-scripts=true`, and bootstrap also passes it explicitly during install/link. The current dependencies need no install lifecycle scripts. This uses bundled SQLite binaries and avoids npm's implicit `node-gyp rebuild` for `better-sqlite3@13.0.3`, reproduced on a clean Windows install and tracked in [upstream issue #1516](https://github.com/WiseLibs/better-sqlite3/issues/1516). Explicit `npm run build` remains enabled. If copying files manually, preserve `.npmrc`; without it, use `npm ci --ignore-scripts` and `npm link --ignore-scripts`.

## Behavior

- Native SQLite manages file locks through the operating system. Ending a process releases its locks; uncommitted transactions roll back on recovery.
- File databases must actually enter WAL mode. Startup fails if SQLite cannot enable it.
- Each connection configures a 100 ms SQLite busy timeout; actual elapsed time also includes SQLite waiting and process scheduling. Write transactions and initialization retry `SQLITE_BUSY` at most four times, yielding between attempts. Sustained contention is reported as an error.
- Observation plus FTS writes, state history, skill lifecycle events, and feedback counters commit or roll back together. Network requests run outside transactions; external embedding requests have a 10-second timeout and fall back to local hashing.
- Schema version 1 is installed in one transaction. Subsequent opens read the version instead of running DDL on every MCP call. Unknown future schema versions fail without rewriting the database.
- `/admin/api/overview` includes a `database` object with the driver, SQLite version, actual journal mode, schema version, and lock-wait settings.

## Upgrade an Existing Installation

Do not let older WASM processes and native processes open the same database. Their locking mechanisms are different. Complete these steps on each machine separately.

1. Check `node --version` and `where.exe node`. Stop the Worker with `agentmem stop`, then close or disconnect every client running the old AgentMemory MCP server. Confirm those `dist/servers/mcp-server.js` and `dist/services/worker.js` processes have exited. A quiet MCP process still counts as an old process.
2. With all connections closed, back up `%USERPROFILE%\.agentmem\agentmemory.db` into a timestamped folder. Preserve any `-wal`, `-shm`, and `-journal` sidecars alongside it. Confirm no process holds the database file before handling a legacy lock.
3. If `agentmemory.db.lock` remains, verify it is an empty stale directory after stopping all old processes, and rename it to `agentmemory.db.stale-lock-<timestamp>`. The native adapter deliberately refuses to open a database while this legacy lock exists; it never deletes it automatically.
4. Update to the migrated source, run `npm ci`, then `npm run build`. A native load check is:

   ```powershell
   node -e "const D=require('better-sqlite3');const d=new D(':memory:');console.log(process.version,process.arch,d.prepare('select sqlite_version() as version').get());d.close()"
   ```

5. Start `node dist/bin/workbench.js --no-open`. Check `/admin` and `/admin/api/overview`: `database.driver` must be `better-sqlite3`, `journal_mode` must be `wal`, and `schema_version` must be `1`. Reconnect MCP clients so that they start the new server. Verify one search and one observation write, including the FTS row.
6. Run `node --test tests/*.test.cjs` to exercise independent writers, forced termination, bounded contention, rollback failures, and the existing Worker/MCP behavior.

An existing database keeps its tables and rows. Migration sets `user_version` and journal mode; it does not rebuild or clear memories. Stop and back up before updating dependencies or rebuilding a running old installation.

## Recovery and Rollback

For native startup failures, inspect the error and the Worker log rather than deleting database sidecars. A legacy `.lock` requires the stop-and-verify procedure above. A live `SQLITE_BUSY` requires inspecting the competing writer; finite retries do not repair a writer that never commits.

To restore the old version, stop all native Worker/MCP connections, preserve the current database and its sidecars, restore the complete pre-migration cold backup, and restore the old source/dependencies before restarting. Keep the native snapshot for reconciling any memories written after migration. Do not point the old WASM driver at an active WAL database.

Each machine must keep its own local database. Copy or synchronize a consistent backup, never an open SQLite database and a partial selection of its WAL files.
