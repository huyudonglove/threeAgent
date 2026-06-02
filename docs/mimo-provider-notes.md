# MiMo Provider Notes

Last updated: 2026-06-01

Sources:

- https://platform.xiaomimimo.com/docs/zh-CN/quick-start/first-api-call
- https://platform.xiaomimimo.com/docs/zh-CN/quick-start/model
- https://platform.xiaomimimo.com/docs/zh-CN/api/chat/openai-api
- https://platform.xiaomimimo.com/docs/zh-CN/usage-guide/tool-calling/web-search

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

## Token Plan CN Supported Models

User-confirmed token-plan-cn support includes:

- `mimo-v2.5-pro`
- `mimo-v2.5`
- `mimo-v2.5-tts-voiceclone`
- `mimo-v2.5-tts-voicedesign`
- `mimo-v2.5-tts`
- V2 series models, 8 models total

`mimo-v2.5-flash` returned:

```text
MODEL_INVOKE_FAILED: OpenAI API error 400
Param Incorrect
Not supported model mimo-v2.5-flash
```

Therefore `mimo-v2.5-flash` should not be treated as a confirmed default chat recommendation for the token-plan-cn endpoint. Prefer the `/models` response or user-confirmed availability over generic model-list assumptions.

The token-plan-cn endpoint uses a token conversion/quota mechanism, so visible model availability may differ from general MiMo model documentation.

## Other MiMo Model Families

The MiMo model page also lists multimodal, speech, embedding, rerank, and image/video generation model families. Do not add these to the default chat model preset until the app has explicit runtime support for those call types.

For now:

- Chat/task execution: use OpenAI-compatible chat completions.
- Future multimodal or media features should add separate capabilities and request adapters instead of pretending every MiMo model is a chat model.

## Web Search Tool Notes

MiMo web search is a provider-native OpenAI-compatible chat completions tool. It should be sent as a direct `tools` entry:

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

Do not serialize native MiMo search as a generic function tool named `web_search`.

Current AgentThee state:

- Model Output Lab has a mock/function-tool `web_search` entry for observing tool-call arguments.
- That mock entry does not execute network search.
- The OpenAI-compatible adapter currently serializes all tools as function tools.
- Real MiMo web search support is tracked by `TASK-MIMO-SEARCH-001` in `docs/tasks.md`.

Operational notes from MiMo docs:

- The web search plugin/service must be enabled in the MiMo console.
- Plugin enablement may have a short cache delay.
- Use `force_search: true` when the request must search.
- Search result citations may appear in `message.annotations`.
- Search usage may appear in `usage.web_search_usage`.
- Treat this as OpenAI-compatible support first; do not assume the Anthropic-compatible path supports it.

## AgentThee Integration Rule

The source of truth for built-in provider and model presets is `src-main/model-config/provider-presets.ts`.

The renderer should load presets through `window.agentAPI.listPresets()` and should not maintain a separate hardcoded MiMo/OpenAI/Anthropic/DeepSeek model list. A renderer fallback list is acceptable only as an offline/error fallback.
