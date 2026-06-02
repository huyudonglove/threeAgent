# Tasks

This file is the lightweight task board for AgentThee. Users can refer to a task by ID instead of rewriting the full requirement.

## Rules For Agents

- Read `AGENTS.md` and follow `docs/cli-agent-rules.md`. Read `docs/project-status.md` or `docs/change-log.md` only when history or current status is needed.
- When the user references a task ID, read that task and its references before changing code.
- In CLI mode, prefer execution over proposal. Treat explicit user requests to modify/fix/add/continue as approval to proceed.
- Ask for confirmation only for destructive actions, secrets, broad rewrites, unclear requirements, or high-risk changes.
- After completing a task, update this file's task status.
- Also update `docs/project-status.md` and `docs/change-log.md` only when the task changes behavior, architecture, environment, or workflow.
- Run relevant verification. Prefer the smallest useful check first:

```powershell
corepack pnpm typecheck
corepack pnpm vitest run path/to/test.test.ts
```

Run `corepack pnpm test` for broad or risky changes. Run `corepack pnpm build` only when the change affects packaging, Electron startup, frontend build behavior, shared runtime wiring, or release output.

## Status Values

- `todo`: not started
- `planned`: plan accepted, not implemented yet
- `in-progress`: actively being implemented
- `blocked`: cannot continue without user input or external change
- `done`: implemented and verified
- `superseded`: replaced by another task

## TASK-MODEL-001 - Existing Provider Add Recommended Models

Status: done  
Priority: high  
Area: model-config  
Created: 2026-06-01
Completed: 2026-06-01

### Goal

After a provider is already configured, the user should still be able to add/select more recommended models from that same provider.

### Problem

Currently, after a provider is configured, adding another known model can feel like a custom-model workflow. This increases operation cost because the user may need to manually enter `modelName` or `modelId`.

This is not primarily a custom-model problem. It is an existing-provider secondary configuration problem.

### Expected UX

- Existing provider shows configured models.
- Existing provider shows recommended models that have not been added yet.
- User can add a recommended model with one clear action.
- User does not manually type `modelName`.
- User does not manually type `modelId`.
- User does not create a duplicate provider for the same service.
- Custom model remains available only as an advanced fallback.

### Do Not

- Do not duplicate providers just to use multiple models.
- Do not make known preset models go through the custom model form.
- Do not create another frontend-only model list as the source of truth.
- Do not bypass `src-main/model-config/provider-presets.ts`.

### References

- `docs/project-status.md`
- `docs/change-log.md`
- `docs/model-provider-preset-architecture.md`
- `src-main/model-config/provider-presets.ts`
- `src/pages/ModelConfigPage.vue`
- `tests/model-config/app-model-config.test.ts`

### Acceptance

- An existing MiMo provider can add any missing supported recommended chat model. Note: `mimo-v2.5-flash` is not confirmed for token-plan-cn and returned an unsupported-model error.
- Adding a recommended model does not require manual model name or ID entry.
- One provider can still own multiple models.
- Scenario bindings can select those different models.
- Existing custom model workflow still works.
- `corepack pnpm typecheck` passes.
- `corepack pnpm test` passes.
- `corepack pnpm build` passes if frontend or shared runtime build behavior changes.

### Completion Notes

- Existing provider cards now show configured models for that provider.
- Existing provider cards now show missing preset recommended models and provide one-click add.
- The add action uses the same backend-loaded preset model metadata as the setup wizard.
- Custom model creation remains in advanced settings.

## TASK-MODEL-002 - Correct MiMo Token Plan Model Availability

Status: done  
Priority: high  
Area: model-config  
Created: 2026-06-01
Completed: 2026-06-01

### Goal

Correct MiMo token-plan-cn model recommendations so unsupported models are not offered as normal selectable chat models.

### Background

`mimo-v2.5-flash` returned:

```text
MODEL_INVOKE_FAILED: OpenAI API error 400
Param Incorrect
Not supported model mimo-v2.5-flash
```

User-confirmed token-plan-cn support includes:

- `mimo-v2.5-pro`
- `mimo-v2.5`
- `mimo-v2.5-tts-voiceclone`
- `mimo-v2.5-tts-voicedesign`
- `mimo-v2.5-tts`
- V2 series models, 8 models total

### Expected Handling

- Do not recommend `mimo-v2.5-flash` as a confirmed token-plan-cn chat model.
- Prefer `/models` response or user-confirmed model availability.
- Keep TTS models out of normal chat presets until the app has a TTS runtime path.

### References

- `docs/mimo-provider-notes.md`
- `src-main/model-config/provider-presets.ts`
- `src/pages/ModelConfigPage.vue`

### Acceptance

- MiMo token-plan-cn recommended chat model list does not include unsupported `mimo-v2.5-flash`.
- TTS models are documented but not exposed as ordinary chat models unless runtime support exists.
- `corepack pnpm typecheck` passes.
- `corepack pnpm test` passes.

### Completion Notes

- Removed `mimo-v2.5-flash` from backend MiMo recommended chat presets.
- Removed `mimo-v2.5-flash` from the renderer fallback MiMo model list.
- Kept TTS model names documented in `docs/mimo-provider-notes.md` but did not expose them as ordinary chat models.
- Added a regression test that MiMo recommended chat presets are exactly `mimo-v2.5-pro` and `mimo-v2.5`.

## TASK-PROMPT-001 - Modular Prompt Slot System

Status: done  
Priority: high  
Area: model-lab / prompt-runtime  
Created: 2026-06-01
Completed: 2026-06-01

### Goal

Introduce a modular prompt slot system so prompt parts can be edited independently and assembled into the final model request.

### Background

User clarification: “Expected output JSON” should not be a passive display-only field, and should not be hardcoded into the prompt as a hidden string. It should behave like a module/slot that can be edited outside the final prompt while staying synchronized with the assembled prompt sent to the model.

The same mechanism should later support more slots, such as skills, agents, tools, constraints, examples, and memory.

### First-Class Slot Examples

- Task/instruction slot
- Expected output JSON / output schema slot
- Skill slot
- Agent role slot
- Tool description slot
- Constraint/rule slot
- Example slot
- Memory/context slot
- Custom slot

### Draft Shape

```ts
type PromptSlot = {
  id: string
  type:
    | 'task'
    | 'output_schema'
    | 'skill'
    | 'agent'
    | 'tool'
    | 'constraint'
    | 'example'
    | 'memory'
    | 'custom'
  title: string
  enabled: boolean
  order: number
  content: string
  source: 'manual' | 'built_in' | 'saved_template' | 'generated'
  channel: 'system' | 'user' | 'assistant' | 'tool'
}
```

Source meanings:

- `manual`: user-written content.
- `built_in`: system-provided fixed content, such as safety or formatting rules.
- `saved_template`: reusable template content saved by the user or project.
- `generated`: runtime-generated content, such as current workspace context, tool list, model capability notes, memory summaries, or agent state.

Earlier wording considered `user | system | template | runtime`; the clearer preferred wording is `manual | built_in | saved_template | generated`.

### Expected UX

- Each slot can be edited independently.
- Editing a slot updates the final assembled prompt preview.
- Disabled slots are not sent to the model.
- Slot order controls assembly order.
- The final request preview must show all content that enters the model.
- No hidden prompt injection for expected JSON or future slots.

### Expected Output JSON Behavior

- “Expected output JSON” becomes an `output_schema` slot.
- `output_schema` is an output-format constraint and should default to the `system` channel, not the user task body.
- It should be visible in the final prompt/message preview when enabled.
- It can still be used for local output validation.
- It should not be only a passive display field.

### References

- `src/pages/ModelOutputLabPage.vue`
- `src-main/model-lab/model-lab-service.ts`
- `tests/model-lab/model-lab-service.test.ts`
- `docs/model-output-lab-panel-requirements-2026-05-26.md`
- `docs/model-output-lab-development-plan-2026-05-26.md`

### Acceptance

- Prompt assembly has explicit slot data.
- Expected output JSON is represented as an `output_schema` slot.
- Changing slot content changes final prompt preview.
- Model invocation uses the assembled prompt/messages.
- Preview shows every prompt part sent to the model.
- Existing model output lab behavior is not broken.
- `corepack pnpm typecheck` passes.
- `corepack pnpm test` passes.

### Completion Notes

- Model Lab request input now uses explicit `promptSlots`.
- `Expected Output JSON` is represented as an editable `output_schema` slot.
- Enabled slots are assembled by `order`; disabled slots are excluded from model messages.
- The final request preview shows enabled slots, assembled prompt text, messages, and final request JSON.
- The local validation contract is still derived from the output schema slot.
- Follow-up correction recorded: JSON output / `output_schema` should be assembled into the `system` channel because it is an output-format constraint.

## TASK-PROMPT-002 - Put Output Schema Slot In System Channel

Status: done  
Priority: high  
Area: model-lab / prompt-runtime  
Created: 2026-06-01
Completed: 2026-06-01

### Goal

Ensure JSON output / `output_schema` prompt slots are assembled into the system prompt/channel, not mixed into the user task message.

### Background

User correction after TASK-PROMPT-001: JSON output is an output-format constraint. It belongs in the system-level prompt/message. The earlier slot model lacked an explicit `channel`, which can make agents place all slots into a single prompt body.

### Expected Handling

- Prompt slots should carry an explicit `channel`.
- `output_schema` defaults to `system`.
- `constraint`, `skill`, and `agent` slots usually default to `system`.
- `task` slots default to `user`.
- Final request preview should group or clearly label system/user/assistant/tool messages.

### References

- `docs/tasks.md#TASK-PROMPT-001---Modular-Prompt-Slot-System`
- `src/pages/ModelOutputLabPage.vue`
- `src-main/model-lab/model-lab-service.ts`
- `tests/model-lab/model-lab-service.test.ts`

### Acceptance

- `output_schema` appears in the system message when enabled.
- User task content remains in the user message.
- Final preview makes message channels visible.
- Existing prompt slot editing still works.
- `corepack pnpm typecheck` passes.
- `corepack pnpm test` passes.

### Completion Notes

- Added explicit `channel` to prompt slots.
- Default Model Output Lab slots now route `agent` and `output_schema` to `system`, and `task` to `user`.
- Prompt message assembly now groups enabled slots by `channel`, preserving slot order inside each message.
- Final request preview and constraint source labels show each slot's message channel.
- Slot cards expose a channel selector so the user can move a slot between system/user/assistant/tool.
- Added regression coverage that `output_schema` appears in the system message while task content remains in the user message.

## TASK-MIMO-SEARCH-001 - Support MiMo Native Web Search Tool

Status: done  
Priority: high  
Area: model-lab / model-runtime / mimo-provider  
Created: 2026-06-01
Completed: 2026-06-01

### Goal

Make MiMo web search actually invoke MiMo's native web search capability instead of treating `web_search` as a mock function tool.

### Background

Current investigation found that AgentThee's `web_search` option is only a Model Output Lab mock/function-tool schema:

- `src-main/model-lab/model-lab-service.ts` defines `web_search` as a built-in mock tool.
- `src/pages/ModelOutputLabPage.vue` previews `web_search` as `{ type: "function", function: ... }`.
- `src-main/model-runtime/provider-adapters/openai-compatible-adapter.ts` maps every tool to `{ type, function }`.

MiMo's official web search API expects provider-native tool entries such as:

```json
{
  "type": "web_search",
  "max_keyword": 3,
  "force_search": true,
  "limit": 1,
  "user_location": {
    "type": "approximate",
    "country": "China",
    "region": "Hubei",
    "city": "Wuhan"
  }
}
```

This means the current request shape can appear to include a search tool while not activating MiMo's real search plugin.

### Expected Handling

- Keep generic function tools and provider-native tools distinct.
- For MiMo OpenAI-compatible requests, send native web search as `{ type: "web_search", ... }`, not as a function named `web_search`.
- Do not expose native MiMo web search on the Anthropic-compatible path unless MiMo confirms support.
- Clearly label mock search/function-tool experiments separately from native MiMo web search.
- Capture and display search-related response metadata when available:
  - `message.annotations`
  - `usage.web_search_usage`
- Preserve existing mock tool behavior for non-network experiments.

### External Requirements

- MiMo console must have the web search plugin/service enabled.
- MiMo documentation notes plugin enablement may have a short cache delay.
- If `force_search` is false or absent, the model may decide not to search.
- Some models or endpoints may not support web search; prefer provider/model capability metadata and clear UI warnings.

### References

- `docs/mimo-provider-notes.md`
- `src-main/model-runtime/contracts.ts`
- `src-main/model-runtime/provider-adapters/openai-compatible-adapter.ts`
- `src-main/model-lab/model-lab-service.ts`
- `src/pages/ModelOutputLabPage.vue`
- `tests/model-lab/model-lab-service.test.ts`

### Acceptance

- Request preview for MiMo native search shows `tools: [{ "type": "web_search", ... }]`.
- Actual OpenAI-compatible adapter body preserves native `web_search` tool shape.
- Function tools still serialize as `{ type: "function", function: ... }`.
- UI distinguishes native MiMo search from mock/function `web_search`.
- MiMo search annotations and web-search usage are surfaced when present.
- `corepack pnpm typecheck` passes.
- Relevant model-lab/model-runtime tests pass.

### Completion Notes

- Added provider-native `web_search` tool definition alongside existing function tools.
- OpenAI-compatible adapter now preserves native tool objects instead of forcing every tool into function shape.
- Model Output Lab can enable MiMo native web search separately from mock/function tools.
- Request preview shows native MiMo search as `{ "type": "web_search", ... }`.
- Function tools still serialize as `{ "type": "function", "function": ... }`.
- Search annotations and `usage.web_search_usage` are not yet surfaced because the runtime output contract does not carry provider-specific response metadata.
