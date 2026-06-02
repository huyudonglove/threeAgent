# Desktop Agent Rules

These rules optimize Codex desktop sessions for accurate, low-risk collaboration. The default posture is: first make the situation clear, then wait for explicit permission before changing code.

## Default Mode

- Do not modify code, configuration, or project documentation unless the user clearly asks to execute, modify, record, or continue an already accepted task.
- When the user reports a problem, start with read-only investigation and give a concrete diagnosis.
- When the user discusses a requirement, clarify the goal, scope, risks, and likely implementation path before editing.
- When the user says to record something, update the relevant project documents only; do not change runtime code.
- When the user explicitly authorizes execution in plain language, treat that as approval for the scoped change.

## Pre-Work Brief

Before meaningful edits, provide a short brief and wait for confirmation unless the user has already authorized execution:

- Goal: what this change is meant to achieve.
- Plan: the intended steps.
- Affected files: likely files or modules.
- Validation: checks to run, or why validation is not needed.
- Risks: compatibility, data, API, UX, or environment risks.

## Investigation Style

- Prefer evidence over guessing. Read the relevant code path, docs, logs, and tests before proposing a fix.
- Separate product issues, architecture gaps, UI friction, runtime bugs, environment issues, and external service requirements.
- Call out when a visible UI feature is only a mock, preview, or placeholder.
- Avoid broad repo scans when the entry point is known.

## Task Handoff

- Use `docs/tasks.md` for requirements that may be handed to another agent.
- Give each non-trivial task a stable task ID.
- A task should include goal, background, expected handling, references, and acceptance criteria.
- If the user provides a task ID, read `docs/tasks.md` first and treat that task as the source of truth.
- Keep task text simple enough that the user can hand another agent only the task ID or file path.

## Documentation

- Store project-critical knowledge in `docs/`.
- Use `docs/project-status.md` for current status and handoff notes.
- Use `docs/change-log.md` for meaningful behavior, architecture, environment, or workflow decisions.
- Avoid documentation churn for tiny local fixes unless the user asks.
- Use `D:\obsidian\agent` for personal cross-project notes, not as the project source of truth.

## Editing

- Keep edits narrow and aligned with existing architecture.
- Do not refactor unrelated code while solving a specific issue.
- Preserve user and other-agent work in the dirty worktree.
- If existing changes touch the same files, inspect them and work with them instead of overwriting them.
- Use `apply_patch` for manual text edits.

## Validation

- Match validation to risk.
- For documentation-only changes, no tests are required.
- For TypeScript or Vue contracts, run `corepack pnpm typecheck`.
- For localized logic, run the nearest targeted test through `corepack pnpm test:one path/to/test.test.ts`.
- Run `corepack pnpm test` for broad, shared, or risky code changes.
- Run `corepack pnpm build` only for packaging, Electron startup, frontend build behavior, shared runtime wiring, release output, or explicit user request.
- Run `corepack pnpm run doctor` only for environment, dependency, Electron startup, or machine setup issues.

## Communication

- Keep updates short and concrete.
- Prefer conclusion, evidence, and next step over long explanation.
- When there are options, recommend one path and name the main tradeoff.
- Do not paste code or diffs unless the user asks.
- In final responses, mention what changed, where, and what validation was or was not run.

## Relationship To CLI Rules

- Desktop sessions use these rules by default.
- CLI sessions may use `docs/cli-agent-rules.md`, which favors faster direct execution.
- If the active environment is ambiguous, prefer the desktop rules because they are safer for collaborative planning.
