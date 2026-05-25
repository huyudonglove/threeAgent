<script setup lang="ts">
// App.vue - 应用入口，包含导航和路由出口
</script>

<template>
  <div id="app-root">
    <nav class="app-nav">
      <router-link to="/workspaces" class="nav-tab">工作区</router-link>
      <router-link to="/workbench" class="nav-tab">工作台</router-link>
      <router-link to="/model-config" class="nav-tab">模型配置</router-link>
      <router-link to="/results" class="nav-tab">结果沉淀</router-link>
      <router-link to="/plugins" class="nav-tab">插件管理</router-link>
    </nav>
    <router-view />
  </div>
</template>

<style scoped>
.app-nav {
  display: flex;
  gap: 4px;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.nav-tab {
  padding: 6px 16px;
  border-radius: 6px;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-secondary);
  text-decoration: none;
  transition: all 0.2s;
}

.nav-tab:hover {
  background: rgba(0, 0, 0, 0.04);
  color: var(--text-primary);
}

.nav-tab.router-link-active {
  background: rgba(0, 0, 0, 0.06);
  color: var(--text-primary);
}
</style>
