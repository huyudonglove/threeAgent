# AgentThee Codex Notes

## Local Commands

- Use `corepack pnpm ...` in PowerShell. Bare `pnpm` may not be available on this machine, and bare `npm` can hit PowerShell script policy through `npm.ps1`.
- First check the workspace with `corepack pnpm run doctor`.
- For a broader local toolchain check, run `corepack pnpm run doctor:machine`.
- Run tests with `corepack pnpm test`.
- Build the installer with `corepack pnpm build`.
- Start development with `corepack pnpm dev`; a long-running process is expected.

## Runtime Paths

- Electron development uses `.runtime/` for app data and crash dumps so Windows permission issues in the default Electron paths do not stop startup.
- Electron downloads are cached in `.cache/electron/`.
- Generated output lives in `dist/`, `dist-electron/`, and `release/`.

## Environment Notes

- The project is pinned with `packageManager: pnpm@10.33.0`.
- Project npm registry settings live in `.npmrc` and prefer mirrors reachable from this machine.
- Do not remove `.cache/` unless you are ready for the next dev/build command to restore the Electron binary.

## Project Knowledge

- Before changing code, configuration, or documentation, first explain the goal, plan, affected files, and validation approach, then wait for user confirmation unless the user explicitly asks you to execute.
- If the user references a task ID, read `docs/tasks.md` and use that task as the requirement source.
- Start new handoffs by reading `docs/project-status.md` and `docs/change-log.md`.
- After meaningful changes, update `docs/project-status.md` and/or `docs/change-log.md` so future agents know what is done and what remains.
- Store project-critical documentation in `docs/` so it travels with the code and can be updated in the same change.
- Use `D:\obsidian\agent` as the personal Obsidian vault for Agent-related reading, linking, and cross-project notes. Do not treat `D:\Program Files\Obsidian\Obsidian.exe` or its install directory as a note storage location.
- Follow `docs/knowledge-management.md` when deciding whether a note belongs in the repository or in a personal vault.
