<script setup lang="ts">
// App.vue - 应用入口，包含导航和路由出口
</script>

<template>
  <div id="app-root">
    <nav class="app-nav">
      <router-link to="/workspaces" class="nav-tab">工作区</router-link>
      <router-link to="/workbench" class="nav-tab">工作台</router-link>
      <router-link to="/model-config" class="nav-tab">模型配置</router-link>
      <router-link to="/model-lab" class="nav-tab">输出实验</router-link>
      <router-link to="/results" class="nav-tab">结果沉淀</router-link>
      <router-link to="/plugins" class="nav-tab">插件管理</router-link>
    </nav>
    <router-view />
  </div>
</template>

<style scoped>
#app-root {
  min-height: 100vh;
}

.app-nav {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  gap: 4px;
  min-height: 49px;
  padding: 8px 16px;
  overflow-x: auto;
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: 0 8px 24px rgba(17, 35, 63, 0.06);
}

.nav-tab {
  flex: 0 0 auto;
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
