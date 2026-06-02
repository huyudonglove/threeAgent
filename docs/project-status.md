# Project Status

Last updated: 2026-06-01

This document is the current handoff ledger for AgentThee. Read it before starting implementation work.

## Current Snapshot

AgentThee is an Electron + Vue desktop app for a personal AI agent workbench.

The project currently has:

- App-level model provider/model/binding configuration
- Workspace, conversation, task, workflow, result, plugin, and memory modules
- A model output lab for prompt/model behavior experiments
- Project and machine environment doctor scripts
- MiMo provider notes and MiMo OpenAI-compatible preset metadata

The current reliable command path is:

```powershell
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

Use that full path for broad verification. For ordinary CLI tasks, prefer targeted checks and skip `doctor`/`build` unless relevant.

## Completed

- Dev environment stabilized for this Windows machine.
- Electron dev startup repaired with local `.runtime/` and `.cache/` paths.
- Project-level `.npmrc`, VS Code tasks/settings, `.gitattributes`, and `AGENTS.md` added.
- Machine baseline documented in `docs/local-machine-baseline.md`.
- Knowledge storage rule documented: project docs in `docs/`, personal Agent vault at `D:\obsidian\agent`.
- MiMo official docs recorded in `docs/mimo-provider-notes.md`.
- MiMo base URLs corrected:
  - OpenAI-compatible: `https://token-plan-cn.xiaomimimo.com/v1`
  - Anthropic-compatible: `https://token-plan-cn.xiaomimimo.com/anthropic`
- MiMo token-plan-cn chat presets:
  - `mimo-v2.5-pro`
  - `mimo-v2.5`
- MiMo token-plan-cn availability clarification recorded:
  - Confirmed support includes `mimo-v2.5-pro`, `mimo-v2.5`, `mimo-v2.5-tts-voiceclone`, `mimo-v2.5-tts-voicedesign`, `mimo-v2.5-tts`, plus V2 series models.
  - `mimo-v2.5-flash` returned a 400 unsupported-model error on token-plan-cn and was removed from normal chat recommendations.
- Model provider presets are now loaded by the renderer through `window.agentAPI.listPresets()`.
- `ModelConfigPage.vue` no longer treats its hardcoded provider/model list as the normal source of truth; it is only a fallback.
- The data layer supports one provider with multiple models.
- A regression test confirms one MiMo provider can own multiple models and bind different scenarios to different models.
- Existing provider cards now show configured models and missing recommended preset models.
- Existing providers can add additional recommended models without manual `modelName` or `modelId` entry.
- MiMo recommended chat presets no longer include unsupported `mimo-v2.5-flash`.
- Model Output Lab now uses explicit prompt slots for prompt assembly.
- `Expected Output JSON` is now an editable `output_schema` slot that appears in the final request preview and model messages when enabled.
- Prompt slots now carry explicit message channels.
- Model Output Lab now assembles `output_schema` into the system channel by default, while task content remains in the user channel.
- Model Output Lab includes a mock `web_search` tool schema for observing search tool-call arguments.
- MiMo native `web_search` can be sent as a provider-native OpenAI-compatible tool object instead of a function tool.
- Git global `user.name` is set to `huyudonglove`, and GitHub SSH authentication is configured for this machine.
- Desktop collaboration rules are documented in `docs/desktop-agent-rules.md`; desktop sessions default to diagnosis/plan/confirmation before code edits.

## In Progress

- Model configuration UX is being reshaped from “data table management” into “provider connection + model selection + scenario routing.”
- Provider preset architecture is documented in `docs/model-provider-preset-architecture.md`.

## Pending

- `ModelConfigPage.vue` still contains fallback provider/model lists. They are acceptable as fallback, but future cleanup may move fallback data into a smaller shared helper.
- MiMo search response metadata (`message.annotations`, `usage.web_search_usage`) is not surfaced yet.
- Some historical docs and source comments display encoding artifacts in PowerShell output. Avoid broad rewrite unless explicitly scoped.
- Docker daemon may need Docker Desktop running before Docker-dependent tasks.

## Decisions

- `docs/cli-agent-rules.md` is the local policy for Codex CLI behavior.
- `docs/desktop-agent-rules.md` is the local policy for Codex desktop behavior.
- Desktop-mode work should optimize for accuracy and low-risk collaboration: investigate first, summarize the plan, and wait for confirmation before meaningful code/config/docs edits unless execution was clearly authorized.
- CLI-mode work should optimize for speed: keep explanations brief, execute directly when the user asks for changes, and only add detail for risks, blockers, failed commands, validation results, or required user decisions.
- CLI-mode responses should avoid pasted code/diffs by default. Prefer concise summaries of changed files, behavior, and validation.
- CLI-mode context gathering should be narrow: read the files needed for the task, not the whole doc set by default.
- CLI-mode validation should be proportional: targeted tests first, full test/build only for broad or risky changes.
- Before code/config/docs edits, wait for confirmation only when the user has not clearly asked for execution or when the action is destructive, broad, ambiguous, or high-risk.
- Project-critical knowledge belongs in `docs/`.
- Obsidian personal Agent vault is `D:\obsidian\agent`.
- `src-main/model-config/provider-presets.ts` is the source of truth for built-in provider/model presets.
- One provider represents connection and authentication. Multiple models can sit under the same provider.
- Scenario bindings should choose models, not duplicate providers.
- Use `corepack pnpm ...` in Codex sessions.

## Known Issues

- The model config page is large and should be refactored carefully, preferably after a confirmed UI plan.
- `record-version-index.md` exists but is noisy/garbled in current terminal output; use this document for current status handoff.

## Handoff Notes For Agents

Read these first:

1. `AGENTS.md`
2. `docs/desktop-agent-rules.md` for desktop sessions, or `docs/cli-agent-rules.md` for CLI sessions
3. `docs/project-status.md` when status/history matters
4. `docs/change-log.md` when history matters
5. `docs/model-provider-preset-architecture.md` or `docs/mimo-provider-notes.md` only for related work

Do not start implementation immediately after a user reports a concern. First confirm a concrete plan unless the user explicitly asks you to execute.
