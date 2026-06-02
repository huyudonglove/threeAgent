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
- Added `docs/desktop-agent-rules.md` for Codex desktop collaboration.
- Updated `AGENTS.md` to prefer desktop diagnosis/plan/confirmation before code edits, while keeping separate CLI execution rules.

### MiMo Provider

- Recorded MiMo OpenAI-compatible endpoint:
  - `https://token-plan-cn.xiaomimimo.com/v1`
- Recorded MiMo Anthropic-compatible endpoint:
  - `https://token-plan-cn.xiaomimimo.com/anthropic`
- Updated MiMo preset base URL.
- Added/updated recommended MiMo token-plan-cn chat models:
  - `mimo-v2.5-pro`
  - `mimo-v2.5`
- Recorded token-plan-cn availability clarification:
  - Confirmed support includes `mimo-v2.5-pro`, `mimo-v2.5`, `mimo-v2.5-tts-voiceclone`, `mimo-v2.5-tts-voicedesign`, `mimo-v2.5-tts`, plus V2 series models.
  - `mimo-v2.5-flash` returned a 400 unsupported-model error and was removed from normal chat recommendations for token-plan-cn.
- Kept MiMo TTS models documented but excluded from ordinary chat presets until a TTS runtime path exists.

### Model Provider Architecture

- Renderer now loads provider presets through `window.agentAPI.listPresets()`.
- Renderer maps backend preset metadata into provider cards and recommended model cards.
- Frontend hardcoded provider/model data is retained only as fallback.
- Model provider source of truth is `src-main/model-config/provider-presets.ts`.

### Model Configuration UX

- Confirmed one provider can own multiple models.
- Improved model ID generation so custom/additional models can be added under the same provider without manually typing IDs.
- Added test coverage for one MiMo provider with multiple models and separate scenario bindings.
- Existing provider cards now show the models already configured under that provider.
- Existing provider cards now show missing preset recommended models with a one-click add action.
- Recommended model addition reuses backend-loaded preset metadata and does not require manual `modelName` or `modelId` entry.

### Model Output Lab

- Introduced explicit `promptSlots` for model lab prompt assembly.
- Converted Expected Output JSON into an editable `output_schema` slot.
- Disabled prompt slots are excluded from model messages.
- Request preview now shows prompt slots, assembled prompt text, final messages, and final request JSON.
- Model lab templates now persist prompt slots instead of separate system/user prompt fields.
- Prompt slots now carry an explicit message channel.
- JSON output / `output_schema` now defaults to the system channel, while task instructions stay in the user channel.
- Model Output Lab request preview now labels prompt slot channels and groups final messages by channel.
- Added a `web_search` model-lab mock tool schema with default Wuhan/Hubei/China approximate location parameters.
- Recorded MiMo native web search follow-up as `TASK-MIMO-SEARCH-001`.
- Clarified that MiMo native search must use provider-native `{ "type": "web_search", ... }` tools, not a generic function tool named `web_search`.
- Documented MiMo search response metadata expectations: `message.annotations` and `usage.web_search_usage`.
- Added MiMo native `web_search` support for OpenAI-compatible requests while preserving function-tool serialization.

### Pending After This Date

- Consider splitting `ModelConfigPage.vue` after UX stabilizes.
- Implement `TASK-MIMO-SEARCH-001` so MiMo web search is sent through the OpenAI-compatible adapter as a native provider tool.
