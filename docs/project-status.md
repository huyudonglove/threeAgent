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
corepack pnpm run doctor
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

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
- MiMo text presets added:
  - `mimo-v2.5-pro`
  - `mimo-v2.5`
  - `mimo-v2.5-flash`
- Model provider presets are now loaded by the renderer through `window.agentAPI.listPresets()`.
- `ModelConfigPage.vue` no longer treats its hardcoded provider/model list as the normal source of truth; it is only a fallback.
- The data layer supports one provider with multiple models.
- A regression test confirms one MiMo provider can own multiple models and bind different scenarios to different models.

## In Progress

- Model configuration UX is being reshaped from “data table management” into “provider connection + model selection + scenario routing.”
- Provider preset architecture is documented in `docs/model-provider-preset-architecture.md`.

## Pending

- Existing provider secondary configuration needs a better UI:
  - For an already configured provider, users should be able to add recommended models from a selectable list.
  - Users should not need to use the custom model form for common preset models.
  - Provider cards/sections should show configured models and available recommended models.
- User clarification: this is not primarily a custom-model problem. The intended UX is that an already configured provider can be configured again and can add/select more built-in models without manual model-name or ID entry.
- `ModelConfigPage.vue` still contains fallback provider/model lists. They are acceptable as fallback, but future cleanup may move fallback data into a smaller shared helper.
- Some historical docs and source comments display encoding artifacts in PowerShell output. Avoid broad rewrite unless explicitly scoped.
- Git global `user.name` is not set on this machine.
- Docker daemon may need Docker Desktop running before Docker-dependent tasks.

## Decisions

- Before code/config/docs edits, Codex should explain the goal, plan, affected files, and validation approach, then wait for user confirmation.
- Project-critical knowledge belongs in `docs/`.
- Obsidian personal Agent vault is `D:\obsidian\agent`.
- `src-main/model-config/provider-presets.ts` is the source of truth for built-in provider/model presets.
- One provider represents connection and authentication. Multiple models can sit under the same provider.
- Scenario bindings should choose models, not duplicate providers.
- Use `corepack pnpm ...` in Codex sessions.

## Known Issues

- Existing provider “add another preset model” UX is still too manual.
- Existing service provider cards do not yet provide a clear “add another recommended model” action.
- The model config page is large and should be refactored carefully, preferably after a confirmed UI plan.
- `record-version-index.md` exists but is noisy/garbled in current terminal output; use this document for current status handoff.

## Handoff Notes For Agents

Read these first:

1. `AGENTS.md`
2. `docs/project-status.md`
3. `docs/change-log.md`
4. `docs/model-provider-preset-architecture.md`
5. `docs/mimo-provider-notes.md`

Do not start implementation immediately after a user reports a concern. First confirm a concrete plan unless the user explicitly asks you to execute.
