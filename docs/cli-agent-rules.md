# CLI Agent Rules

These rules optimize Codex work in CLI sessions for speed and low-noise collaboration.

## Default Mode

- Execute directly when the user asks to modify, fix, add, continue, or handle something.
- Do not stop for a plan unless the action is destructive, broad, ambiguous, high-risk, or touches secrets.
- Keep updates short. Report only what is being changed, blockers, failed commands, and validation results.
- Do not paste code or diffs by default. Summarize changed files and behavior.

## Context Gathering

- Read only the files needed for the current task.
- Read `AGENTS.md` first.
- Read `docs/tasks.md` only when the user references a task or task-like document work.
- For "continue" / "follow docs" requests, first use targeted search to find the next `todo` / `in-progress` task. Do not read the whole task board unless needed.
- Prefer `Select-String` / focused snippets over full-file reads for large files.
- Read `docs/project-status.md`, `docs/change-log.md`, and architecture docs only when history, architecture, or status is relevant.
- Avoid broad repo scans unless the entry point is unknown.

## Editing

- Prefer small, targeted edits.
- Avoid unrelated refactors and formatting churn.
- Preserve user changes and existing dirty worktree state.
- Use `apply_patch` for manual edits.
- Be careful with file encoding; avoid PowerShell write rewrites for source files unless encoding is explicit and necessary.

## Validation

- Use the smallest useful validation first.
- For TypeScript/Vue contract changes, run `corepack pnpm typecheck`.
- For localized behavior changes, run `corepack pnpm test:one path/to/test.test.ts`.
- Run `corepack pnpm test` only for broad, risky, shared, or cross-module changes.
- Run `corepack pnpm build` only for packaging, Electron startup, frontend build behavior, shared runtime wiring, release output, or explicit user request.
- Run `corepack pnpm run doctor` only for environment, dependency, Electron startup, or machine setup issues.

## Final Response

- Keep it short.
- Include changed files, behavior change, and validation result.
- Mention failures or skipped validation directly.
- Do not include code unless requested.

## Extra Speed Rules

- When the user says "继续" or "按照文档", locate the next task by status first, then read only that task section and directly referenced code snippets.
- Avoid repeated progress narration for short tasks.
- Do not update broad project docs for tiny implementation details unless a task explicitly requires it.
- Use full-file reads only when the file is small or snippets are insufficient.
