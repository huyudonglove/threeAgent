// src/composables/useActiveWorkspace.ts
// 全局共享的活跃工作区状态
// 模块级 ref 确保所有组件共享同一实例

import { ref, computed } from 'vue'

const activeWorkspaceRootPath = ref<string>('')
const activeWorkspaceId = ref<string>('')
const activeWorkspaceName = ref<string>('')

export function useActiveWorkspace() {
  const hasActiveWorkspace = computed(() => activeWorkspaceRootPath.value !== '')

  function setActiveWorkspace(rootPath: string, id?: string, name?: string) {
    activeWorkspaceRootPath.value = rootPath
    if (id !== undefined) activeWorkspaceId.value = id
    if (name !== undefined) activeWorkspaceName.value = name
  }

  function clearActiveWorkspace() {
    activeWorkspaceRootPath.value = ''
    activeWorkspaceId.value = ''
    activeWorkspaceName.value = ''
  }

  /** 获取当前工作区 rootPath，若无则返回空字符串 */
  function requireRootPath(): string {
    return activeWorkspaceRootPath.value
  }

  return {
    activeWorkspaceRootPath,
    activeWorkspaceId,
    activeWorkspaceName,
    hasActiveWorkspace,
    setActiveWorkspace,
    clearActiveWorkspace,
    requireRootPath,
  }
}
