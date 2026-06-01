# Change Log

This is a human/agent-readable project log. It complements Git history and records why changes were made.

## 2026-06-01

### Environment

- Added project environment checks through `corepack pnpm run doctor`.
- Added broader machine checks through `corepack pnpm run doctor:machine`.
- Stabilized Electron dev startup around local `.runtime/` and `.cache/` paths.
- Added local machine baseline documentation.

### Documentation

- Added `AGENTS.md` for future Codex sessions.
- Added `docs/knowledge-management.md`.
- Recorded Obsidian personal Agent vault as `D:\obsidian\agent`.
- Added `docs/mimo-provider-notes.md`.
- Added `docs/model-provider-preset-architecture.md`.
- Added `docs/project-status.md`.
- Added `docs/change-log.md`.

### MiMo Provider

- Recorded MiMo OpenAI-compatible endpoint:
  - `https://token-plan-cn.xiaomimimo.com/v1`
- Recorded MiMo Anthropic-compatible endpoint:
  - `https://token-plan-cn.xiaomimimo.com/anthropic`
- Updated MiMo preset base URL.
- Added recommended MiMo text models:
  - `mimo-v2.5-pro`
  - `mimo-v2.5`
  - `mimo-v2.5-flash`

### Model Provider Architecture

- Renderer now loads provider presets through `window.agentAPI.listPresets()`.
- Renderer maps backend preset metadata into provider cards and recommended model cards.
- Frontend hardcoded provider/model data is retained only as fallback.
- Model provider source of truth is `src-main/model-config/provider-presets.ts`.

### Model Configuration UX

- Confirmed one provider can own multiple models.
- Improved model ID generation so custom/additional models can be added under the same provider without manually typing IDs.
- Added test coverage for one MiMo provider with multiple models and separate scenario bindings.

### Pending After This Date

- Add a first-class UI for adding recommended models to an already configured provider.
- Avoid forcing users into the custom model form when they just want another known model from the same service.
- User clarification recorded: the problem is not custom-model support; the missing piece is secondary configuration for an existing provider, where known models remain selectable instead of becoming manual input.
- Consider splitting `ModelConfigPage.vue` after UX stabilizes.
