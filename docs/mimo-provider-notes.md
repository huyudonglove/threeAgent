# MiMo Provider Notes

Last updated: 2026-06-01

Sources:

- https://platform.xiaomimimo.com/docs/zh-CN/quick-start/first-api-call
- https://platform.xiaomimimo.com/docs/zh-CN/quick-start/model

## API Compatibility

MiMo provides two compatible API styles:

- OpenAI-compatible API
- Anthropic-compatible API

For this project, prefer the OpenAI-compatible path first because the current provider preset and runtime already support OpenAI-compatible chat completions.

## OpenAI-Compatible Configuration

- Base URL: `https://token-plan-cn.xiaomimimo.com/v1`
- Chat completions path: `/chat/completions`
- Models path: `/models`
- Auth header: `Authorization: Bearer <MIMO_API_KEY>`
- Recommended secret environment variable: `MIMO_API_KEY`

Example request shape:

```bash
curl "https://token-plan-cn.xiaomimimo.com/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MIMO_API_KEY" \
  -d '{
    "model": "mimo-v2.5-pro",
    "messages": [
      { "role": "user", "content": "Hello, MiMo" }
    ]
  }'
```

## Anthropic-Compatible Configuration

- Base URL: `https://token-plan-cn.xiaomimimo.com/anthropic`
- Auth header: use the Anthropic-compatible key header expected by MiMo docs
- Use only after the runtime's Anthropic-compatible request path is verified for MiMo.

## Text Model Presets

Recommended text/chat models to expose in AgentThee:

| Model | Use | Context |
| --- | --- | --- |
| `mimo-v2.5-pro` | Higher quality general reasoning and agent work | 1M |
| `mimo-v2.5` | General text/chat model | 1M |
| `mimo-v2.5-flash` | Lower latency chat and lightweight tasks | 256K |

## Other MiMo Model Families

The MiMo model page also lists multimodal, speech, embedding, rerank, and image/video generation model families. Do not add these to the default chat model preset until the app has explicit runtime support for those call types.

For now:

- Chat/task execution: use OpenAI-compatible chat completions.
- Future multimodal or media features should add separate capabilities and request adapters instead of pretending every MiMo model is a chat model.

## AgentThee Integration Rule

The source of truth for built-in provider and model presets is `src-main/model-config/provider-presets.ts`.

The renderer should load presets through `window.agentAPI.listPresets()` and should not maintain a separate hardcoded MiMo/OpenAI/Anthropic/DeepSeek model list. A renderer fallback list is acceptable only as an offline/error fallback.
