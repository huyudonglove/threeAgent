# AgentThee Codex Notes

## Local Commands

- Use `corepack pnpm ...` in PowerShell. Bare `pnpm` may not be available on this machine, and bare `npm` can hit PowerShell script policy through `npm.ps1`.
- Do not run `corepack pnpm run doctor` for every task. Run it only when environment, dependency, Electron startup, or machine setup looks relevant.
- For a broader local toolchain check, run `corepack pnpm run doctor:machine`.
- Prefer targeted validation first. Use `corepack pnpm typecheck` for TypeScript/Vue contract changes and targeted `vitest` files when possible. Run `corepack pnpm test` before finishing broad or risky code changes.
- Build the installer with `corepack pnpm build` only for packaging, Electron startup, shared runtime wiring, release output, or when the user asks.
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

- Follow `docs/desktop-agent-rules.md` by default in Codex desktop sessions.
- In desktop sessions, default to read-only investigation and a short plan before code/config/docs edits. Wait for user confirmation unless the user has explicitly authorized execution.
- Treat user requests to record or note something as documentation-only approval, not runtime-code approval.
- In all sessions, minimize code output. Do not paste code or diffs unless the user explicitly asks; summarize changed files and behavior instead.

- Follow `docs/cli-agent-rules.md` for CLI sessions.
- Prefer speed and direct execution in CLI sessions: keep explanations short, avoid extra background, and only expand when there is risk, a blocker, a failed command, or a required user decision.
- For "continue" or "follow docs" requests, use targeted search for the next task status first; avoid reading full docs or large files unless necessary.
- In CLI sessions, minimize code output. Do not paste code or diffs unless the user explicitly asks; summarize changed files and behavior instead.
- Treat user requests to "改", "处理", "继续", "修复", "增加", or similar as approval to execute. Do not stop for a plan unless the change is destructive, ambiguous, high-risk, or affects secrets.
- For small tasks, read only the directly relevant files. Do not read all project docs by default.
- If the user references a task ID, read only `docs/tasks.md` plus files listed by that task.
- Start new handoffs by reading `AGENTS.md`; read `docs/project-status.md` or `docs/change-log.md` only when project history matters.
- Update `docs/project-status.md` and/or `docs/change-log.md` only for meaningful behavior, architecture, environment, or workflow changes. Skip docs churn for tiny fixes unless requested.
- Store project-critical documentation in `docs/` so it travels with the code and can be updated in the same change.
- Use `D:\obsidian\agent` as the personal Obsidian vault for Agent-related reading, linking, and cross-project notes. Do not treat `D:\Program Files\Obsidian\Obsidian.exe` or its install directory as a note storage location.
- Follow `docs/knowledge-management.md` when deciding whether a note belongs in the repository or in a personal vault.
