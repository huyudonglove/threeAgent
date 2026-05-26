# Backend Storage Model

_Last updated: 2026-05-25_

This project currently uses local files as the backend source of truth. There is no database layer. Most runtime data is stored under each workspace, while app-level configuration is stored under Electron `userData`.

## Storage Principles

- Workspace data lives under `<workspace>/.agent-workspace/`.
- App-level settings live under `<electron userData>/agent-config/`.
- Structured state is stored as JSON.
- Append-only event streams are stored as JSONL.
- Agent model output must be JSON-only by default. Free-form text/Markdown is a display concern, not a backend runtime contract.
- JSON writes use a temporary file followed by rename to reduce the chance of partially written files.
- UI code should avoid binding directly to raw backend shapes. Prefer a frontend ViewModel/adapter layer in `useWorkbenchData.ts`.

## Workspace Storage

Each workspace has this hidden directory:

```text
<workspace>/.agent-workspace/
```

Main layout:

```text
.agent-workspace/
├── workspace-manifest.json
├── conversations/
│   ├── conv_xxx.json
│   └── tasks/
│       └── task_xxx.json
├── workflows/
│   └── <taskId>/context.json
├── artifacts/
│   ├── index.json
│   └── content/
│       └── artifact_xxx.json
├── display-trace/
│   └── <conversationId>/segment-0.jsonl
├── agent-memory/
│   └── conversations/<conversationId>/
│       ├── manifest.json
│       ├── shared.json
│       ├── roles/<role>.json
│       └── records.jsonl
├── domains/
├── roles/
├── skills/
├── logs/
└── model-config/
```

Path definitions are centralized in:

- `src-main/storage/path-resolver.ts`

Important mappings:

| Data | File path |
| --- | --- |
| Workspace manifest | `.agent-workspace/workspace-manifest.json` |
| Conversation runtime | `.agent-workspace/conversations/<conversationId>.json` |
| Task runtime | `.agent-workspace/conversations/tasks/<taskId>.json` |
| Workflow context | `.agent-workspace/workflows/<taskId>/context.json` |
| Artifact index | `.agent-workspace/artifacts/index.json` |
| Artifact content | `.agent-workspace/artifacts/content/<artifactId>.json` |
| Display trace segment | `.agent-workspace/display-trace/<conversationId>/segment-<n>.jsonl` |
| Memory manifest | `.agent-workspace/agent-memory/conversations/<conversationId>/manifest.json` |
| Shared memory | `.agent-workspace/agent-memory/conversations/<conversationId>/shared.json` |
| Role memory | `.agent-workspace/agent-memory/conversations/<conversationId>/roles/<role>.json` |
| Memory records | `.agent-workspace/agent-memory/conversations/<conversationId>/records.jsonl` |

## App-Level Storage

App-level configuration is not tied to a workspace. It is stored under:

```text
<electron userData>/agent-config/
```

Main layout:

```text
agent-config/
├── model-config.json
├── secrets.json
├── plugin-registry.json
└── preferences.json
```

Path definitions are centralized in:

- `src-main/storage/app-path-resolver.ts`

## Read/Write Helpers

JSON state uses:

- `src-main/storage/json-store.ts`

`JsonStore.write()` writes to `<target>.tmp` first, then renames the temporary file to the target path.

JSONL streams use:

- `src-main/storage/jsonl-store.ts`

`JsonlStore.append()` appends one JSON object per line. It is used for trace-style and record-style logs.

## Main Runtime Objects

The main stable backend objects are defined in:

- `src-main/contracts/types.ts`

Important objects:

- `WorkspaceManifest`
- `ConversationRuntime`
- `TaskRuntime`
- `ArtifactIndexEntry`
- `DomainWorkflowDefinition`
- `WorkflowExecutionContext`
- `NodeStateRecord`
- `TraceEvent`
- memory records and manifests

## Model Output Structure

The backend must treat model output as machine data first.

Default rule:

- `ModelInvokeService.invoke()` defaults to `responseFormat: "json_object"`.
- OpenAI-compatible requests include `response_format: { "type": "json_object" }` unless the caller explicitly opts into `legacy_text`.
- The model receives a system instruction requiring exactly one JSON object and no Markdown, prose wrapper, or code fences.
- Blocking calls parse the returned content with `JSON.parse`.
- If parsing fails, the call returns `MODEL_OUTPUT_PARSE_FAILED` with `recoverable: true`.
- Field-level structure is described by the app-level JSON Schema used in the model output lab and future agent nodes. That schema is not a model API field; it is prompt context plus local validation.

Allowed exception:

- `responseFormat: "legacy_text"` is only for compatibility with old/manual paths.
- New agent task execution, node output, and artifact generation should not use it.

Maintenance implication:

- Runtime state and artifacts should store structured JSON.
- The GUI should render JSON into human-readable cards, tables, Markdown previews, or summaries.
- Do not make downstream logic depend on free-form model text.

## GUI Maintenance Notes

The backend model is stable enough for a GUI redesign, but the GUI should not consume all backend shapes directly.

Recommended frontend layering:

1. Keep `src-main` as the backend source of truth.
2. Keep IPC channel names stable where possible.
3. Use `electron/preload.ts` as the narrow renderer API surface.
4. Use `src/composables/useWorkbenchData.ts` as the adapter from backend data to page ViewModels.
5. Let Vue pages consume ViewModels instead of raw backend objects.

One important example:

```text
WorkflowExecutionContext = workflow + nodeStates
```

The workflow definition contains the node metadata, while `nodeStates` contains the runtime state. GUI code must merge these two sources before rendering progress. Do not assume the backend returns a flat `nodes` array.

## Deletion Policy

For now, conversations are closed rather than physically deleted.

Closing a conversation:

- sets `ConversationRuntime.status` to `closed`
- hides it from the active GUI list
- preserves tasks, artifacts, trace, and memory on disk

This keeps the system recoverable and avoids accidental loss of task history. A future hard-delete feature should explicitly define what happens to related task runtime files, workflow contexts, artifacts, trace segments, and memory records.
