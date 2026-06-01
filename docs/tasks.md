# Tasks

This file is the lightweight task board for AgentThee. Users can refer to a task by ID instead of rewriting the full requirement.

## Rules For Agents

- Read `AGENTS.md`, `docs/project-status.md`, and `docs/change-log.md` first.
- When the user references a task ID, read that task before proposing changes.
- Before changing code, configuration, or documentation, provide a short plan and wait for user confirmation.
- After completing a task, update this file's task status.
- Also update `docs/project-status.md` and `docs/change-log.md` when the task changes project behavior or architecture.
- Run relevant verification. For code changes, prefer:

```powershell
corepack pnpm typecheck
corepack pnpm test
```

Run `corepack pnpm build` when the change affects packaging, Electron startup, frontend build behavior, or shared runtime wiring.

## Status Values

- `todo`: not started
- `planned`: plan accepted, not implemented yet
- `in-progress`: actively being implemented
- `blocked`: cannot continue without user input or external change
- `done`: implemented and verified
- `superseded`: replaced by another task

## TASK-MODEL-001 - Existing Provider Add Recommended Models

Status: todo  
Priority: high  
Area: model-config  
Created: 2026-06-01

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

- An existing MiMo provider can add any missing recommended model among `mimo-v2.5-pro`, `mimo-v2.5`, and `mimo-v2.5-flash`.
- Adding a recommended model does not require manual model name or ID entry.
- One provider can still own multiple models.
- Scenario bindings can select those different models.
- Existing custom model workflow still works.
- `corepack pnpm typecheck` passes.
- `corepack pnpm test` passes.
- `corepack pnpm build` passes if frontend or shared runtime build behavior changes.
