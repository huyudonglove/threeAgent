export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export interface WorkspaceSummary {
  id: string
  name: string
  description: string
  lastActive: string
  activeRun: string
}

export interface ConversationSummary {
  id: string
  title: string
  taskType: string
  status: 'active' | 'paused' | 'review'
  updatedAt: string
}

export interface TaskSummary {
  id: string
  title: string
  owner: string
  currentNode: string
  status: 'running' | 'blocked' | 'done'
}

export interface MetricCard {
  label: string
  value: string
  tone: StatusTone
  helper: string
}

export interface StageSummary {
  id: string
  name: string
  state: 'done' | 'current' | 'upcoming'
}

export interface WorkflowNode {
  id: string
  name: string
  role: string
  status: 'done' | 'running' | 'blocked' | 'queued'
  summary: string
  reason: string
  outputs: string[]
  confirmations: string[]
  tools: string[]
}

export interface TimelineEvent {
  id: string
  time: string
  title: string
  detail: string
  tone: StatusTone
}

export interface ArtifactSummary {
  id: string
  title: string
  type: string
  node: string
  status: 'draft' | 'ready' | 'updated'
  updatedAt: string
}

export interface MemorySummary {
  id: string
  title: string
  detail: string
  source: string
}

export interface RiskSummary {
  id: string
  title: string
  detail: string
  level: 'low' | 'medium' | 'high'
}

export const workspaces: WorkspaceSummary[] = [
  {
    id: 'ws-agent-alpha',
    name: 'Agent Alpha',
    description: 'Personal agent workbench for workflow validation and UI review.',
    lastActive: 'Today 10:24',
    activeRun: 'run_2026_0524_01',
  },
  {
    id: 'ws-research-lab',
    name: 'Research Lab',
    description: 'Research-oriented workspace for source review and synthesis.',
    lastActive: 'Yesterday 18:10',
    activeRun: 'run_2026_0523_04',
  },
]

export const conversations: ConversationSummary[] = [
  {
    id: 'conv_451',
    title: 'Agent workbench information architecture',
    taskType: 'App workflow design',
    status: 'active',
    updatedAt: '2 min ago',
  },
  {
    id: 'conv_446',
    title: 'Storage layout review',
    taskType: 'Technical review',
    status: 'review',
    updatedAt: '46 min ago',
  },
  {
    id: 'conv_438',
    title: 'Memory gate fallback policy',
    taskType: 'System design',
    status: 'paused',
    updatedAt: 'Yesterday',
  },
]

export const tasks: TaskSummary[] = [
  {
    id: 'task_108',
    title: 'Deliver Vue workbench shell',
    owner: 'code',
    currentNode: 'GUIInformationArchitecture',
    status: 'running',
  },
  {
    id: 'task_102',
    title: 'Freeze storage contracts',
    owner: 'tech_lead',
    currentNode: 'StorageLayout',
    status: 'blocked',
  },
  {
    id: 'task_097',
    title: 'Summarize product value criteria',
    owner: 'product_manager',
    currentNode: 'ProductGoal',
    status: 'done',
  },
]

export const metrics: MetricCard[] = [
  {
    label: 'Run status',
    value: 'Running',
    tone: 'success',
    helper: 'Execution continues with low interruption mode.',
  },
  {
    label: 'Current node',
    value: 'GUIInformationArchitecture',
    tone: 'info',
    helper: 'Renderer shell is being aligned with the workbench model.',
  },
  {
    label: 'Artifacts',
    value: '12',
    tone: 'neutral',
    helper: 'Three artifacts were updated during this run.',
  },
  {
    label: 'Risk flags',
    value: '2',
    tone: 'warning',
    helper: 'One contract freeze decision still needs a human check.',
  },
]

export const stages: StageSummary[] = [
  { id: 'startup', name: 'Workspace startup', state: 'done' },
  { id: 'understanding', name: 'Input understanding', state: 'done' },
  { id: 'planning', name: 'Planning', state: 'done' },
  { id: 'execution', name: 'Execution loop', state: 'current' },
  { id: 'persistence', name: 'Result persistence', state: 'upcoming' },
]

export const workflowNodes: WorkflowNode[] = [
  {
    id: 'node_01',
    name: 'InputUnderstandingResult',
    role: 'orchestrator',
    status: 'done',
    summary: 'Classified this request as product-to-implementation translation.',
    reason: 'The input referenced a specific project and asked for continued execution.',
    outputs: ['task domain match', 'UI implementation path'],
    confirmations: [],
    tools: ['filesystem scan', 'document review'],
  },
  {
    id: 'node_02',
    name: 'ProductGoal',
    role: 'product_manager',
    status: 'done',
    summary: 'Confirmed the workbench is not a generic chat product.',
    reason: 'User value prioritizes continuity, visibility, and controllability.',
    outputs: ['product positioning summary', 'value hierarchy'],
    confirmations: [],
    tools: ['document synthesis'],
  },
  {
    id: 'node_03',
    name: 'StorageLayout',
    role: 'tech_lead',
    status: 'blocked',
    summary: 'File-first persistence is selected, but IPC boundaries still need freezing.',
    reason: 'Renderer should not receive unrestricted filesystem access.',
    outputs: ['storage directory draft', 'preload API constraints'],
    confirmations: ['Confirm the initial workspace root strategy before wiring writes.'],
    tools: ['schema review'],
  },
  {
    id: 'node_04',
    name: 'GUIInformationArchitecture',
    role: 'code',
    status: 'running',
    summary: 'Building the first three-column workbench shell in Vue and Electron.',
    reason: 'A visible shell is needed before replacing mock data with runtime reads.',
    outputs: ['layout shell', 'visual token baseline'],
    confirmations: [],
    tools: ['Vue SFC', 'CSS tokens'],
  },
  {
    id: 'node_05',
    name: 'ResultPersistence',
    role: 'orchestrator',
    status: 'queued',
    summary: 'Will serialize guidelines and UI decisions into reusable project assets.',
    reason: 'Persistence happens after validation of the shell.',
    outputs: ['project guideline doc', 'artifact update record'],
    confirmations: [],
    tools: ['artifact index'],
  },
]

export const timeline: TimelineEvent[] = [
  {
    id: 'event_01',
    time: '10:08',
    title: 'Workspace documents scanned',
    detail: 'Loaded product, GUI, storage, confirmation, and technical review documents.',
    tone: 'neutral',
  },
  {
    id: 'event_02',
    time: '10:16',
    title: 'Framework target confirmed',
    detail: 'The renderer will use Vue 3 with Electron instead of React.',
    tone: 'info',
  },
  {
    id: 'event_03',
    time: '10:24',
    title: 'Workbench shell started',
    detail: 'Three-column layout and Apple-inspired visual tokens are being applied.',
    tone: 'success',
  },
]

export const artifacts: ArtifactSummary[] = [
  {
    id: 'artifact_01',
    title: 'Agent workbench guidelines',
    type: 'Markdown',
    node: 'ResultPersistence',
    status: 'updated',
    updatedAt: 'Just now',
  },
  {
    id: 'artifact_02',
    title: 'Vue workbench shell',
    type: 'Vue SFC',
    node: 'GUIInformationArchitecture',
    status: 'draft',
    updatedAt: 'Just now',
  },
  {
    id: 'artifact_03',
    title: 'Storage adapter contract notes',
    type: 'Technical draft',
    node: 'StorageLayout',
    status: 'ready',
    updatedAt: '14 min ago',
  },
]

export const memories: MemorySummary[] = [
  {
    id: 'memory_01',
    title: 'User prefers Apple-like product quality',
    detail: 'Visual design should follow mainstream patterns with Apple-style restraint and clarity.',
    source: 'conversation preference',
  },
  {
    id: 'memory_02',
    title: 'Framework constraint',
    detail: 'Do not use React. Continue with the existing Vue and Electron project.',
    source: 'direct instruction',
  },
  {
    id: 'memory_03',
    title: 'Primary UX value',
    detail: 'Visibility of task progress matters more than decorative feature breadth.',
    source: 'product goal synthesis',
  },
]

export const risks: RiskSummary[] = [
  {
    id: 'risk_01',
    title: 'IPC surface too broad',
    detail: 'Renderer must receive narrow workspace APIs instead of unrestricted file methods.',
    level: 'high',
  },
  {
    id: 'risk_02',
    title: 'Mock data divergence',
    detail: 'UI labels should mirror future runtime contracts to reduce refactor churn.',
    level: 'medium',
  },
  {
    id: 'risk_03',
    title: 'Overexposed internal fields',
    detail: 'Raw memory and trace structures should stay behind summary views in the first release.',
    level: 'low',
  },
]
