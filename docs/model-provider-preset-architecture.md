# Model Provider Preset Architecture

Last updated: 2026-06-01

## Goal

Adding a new model provider should usually be a configuration-list change, not a scattered frontend/backend rewrite.

## Source Of Truth

Built-in provider and model presets live in:

```text
src-main/model-config/provider-presets.ts
```

This file defines:

- Provider ID and display name
- Provider protocol, such as OpenAI-compatible or Anthropic-compatible
- Base URL and endpoint paths
- Auth mode and API key environment variable name
- Recommended model list
- Model capability metadata

## Renderer Usage

The renderer loads presets through:

```text
window.agentAPI.listPresets()
window.agentAPI.listModelCandidates(providerId)
```

`ModelConfigPage.vue` may keep a minimal fallback list for IPC failure, but the normal path must use the backend preset list.

## Provider And Model Relationship

One provider can own multiple models.

Examples:

- One MiMo provider with one API key can expose `mimo-v2.5-pro` and `mimo-v2.5`.
- One OpenAI-compatible provider can expose both a high-quality model and a fast/cheap model.
- Scenario bindings can point different roles to different models under the same provider.

Do not require users to create duplicate providers just to use multiple models from the same service. Provider configuration represents connection/authentication. Model configuration represents selectable capabilities under that connection.

## UX Requirement For Existing Providers

After a provider has already been configured, users must still be able to add more known models from that provider through selection, not manual entry.

The intended normal path is:

```text
Existing provider -> available recommended models -> add/select model
```

The custom model form is only an advanced fallback for models that are not in presets.

## Adding Providers

For an OpenAI-compatible or Anthropic-compatible provider:

1. Add the provider to `provider-presets.ts`.
2. Add recommended text/chat models.
3. Verify the model configuration page lists the provider through `listPresets()`.
4. Run `corepack pnpm typecheck` and `corepack pnpm test`.

For a provider with a new protocol:

1. Add the preset metadata.
2. Add or extend a runtime adapter for request/response mapping.
3. Add model invocation tests before exposing it as a normal preset.
