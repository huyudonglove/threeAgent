// src-main/storage/path-resolver.ts
// 根据工作区根目录解析各子路径

import path from 'node:path'

export const WORKSPACE_DIR_NAME = '.agent-workspace'

export class PathResolver {
  constructor(private rootPath: string) {}

  get workspaceDir(): string {
    return path.join(this.rootPath, WORKSPACE_DIR_NAME)
  }

  get manifestPath(): string {
    return path.join(this.workspaceDir, 'workspace-manifest.json')
  }

  get conversationsDir(): string {
    return path.join(this.workspaceDir, 'conversations')
  }

  get artifactsDir(): string {
    return path.join(this.workspaceDir, 'artifacts')
  }

  get displayTraceDir(): string {
    return path.join(this.workspaceDir, 'display-trace')
  }

  get agentMemoryDir(): string {
    return path.join(this.workspaceDir, 'agent-memory')
  }

  get domainsDir(): string {
    return path.join(this.workspaceDir, 'domains')
  }

  get rolesDir(): string {
    return path.join(this.workspaceDir, 'roles')
  }

  get skillsDir(): string {
    return path.join(this.workspaceDir, 'skills')
  }

  get logsDir(): string {
    return path.join(this.workspaceDir, 'logs')
  }

  get modelConfigDir(): string {
    return path.join(this.workspaceDir, 'model-config')
  }

  get secretsPath(): string {
    return path.join(this.workspaceDir, 'secrets.json')
  }

  conversationPath(conversationId: string): string {
    return path.join(this.conversationsDir, `${conversationId}.json`)
  }

  taskRuntimePath(taskId: string): string {
    return path.join(this.conversationsDir, 'tasks', `${taskId}.json`)
  }

  artifactIndexPath(): string {
    return path.join(this.artifactsDir, 'index.json')
  }

  artifactContentPath(artifactId: string): string {
    return path.join(this.artifactsDir, 'content', `${artifactId}.json`)
  }

  traceSegmentPath(conversationId: string, segment: number): string {
    return path.join(this.displayTraceDir, conversationId, `segment-${segment}.jsonl`)
  }

  domainWorkflowPath(domainId: string): string {
    return path.join(this.domainsDir, `${domainId}.json`)
  }

  workflowContextPath(taskId: string): string {
    return path.join(this.workspaceDir, 'workflows', taskId, 'context.json')
  }

  // ─── AgentMemory 路径 ───

  memorySystemManifestPath(): string {
    return path.join(this.agentMemoryDir, 'system', 'manifest.json')
  }

  memoryConversationDir(conversationId: string): string {
    return path.join(this.agentMemoryDir, 'conversations', conversationId)
  }

  memoryConversationManifestPath(conversationId: string): string {
    return path.join(this.memoryConversationDir(conversationId), 'manifest.json')
  }

  memorySharedPath(conversationId: string): string {
    return path.join(this.memoryConversationDir(conversationId), 'shared.json')
  }

  memoryRolePath(conversationId: string, agentRole: string): string {
    return path.join(this.memoryConversationDir(conversationId), 'roles', `${agentRole}.json`)
  }

  memoryRecordsPath(conversationId: string): string {
    return path.join(this.memoryConversationDir(conversationId), 'records.jsonl')
  }

  /**
   * 列出工作区内所有子目录（用于初始化和恢复）
   */
  get allDirs(): string[] {
    return [
      this.workspaceDir,
      this.conversationsDir,
      path.join(this.conversationsDir, 'tasks'),
      this.artifactsDir,
      path.join(this.artifactsDir, 'content'),
      this.displayTraceDir,
      this.agentMemoryDir,
      this.domainsDir,
      this.rolesDir,
      this.skillsDir,
      this.logsDir,
      this.modelConfigDir,
    ]
  }
}
