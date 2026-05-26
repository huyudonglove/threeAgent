// src/router/index.ts
// 工作台路由

import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      redirect: '/workspaces',
    },
    {
      path: '/workspaces',
      name: 'workspaces',
      component: () => import('../pages/WorkspaceIndexPage.vue'),
    },
    {
      path: '/workbench',
      name: 'workbench',
      component: () => import('../pages/WorkbenchPage.vue'),
    },
    {
      path: '/model-config',
      name: 'model-config',
      component: () => import('../pages/ModelConfigPage.vue'),
    },
    {
      path: '/model-lab',
      name: 'model-lab',
      component: () => import('../pages/ModelOutputLabPage.vue'),
    },
    {
      path: '/results',
      name: 'results',
      component: () => import('../pages/ResultsPage.vue'),
    },
    {
      path: '/plugins',
      name: 'plugins',
      component: () => import('../pages/PluginManagePage.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/workspaces',
    },
  ],
})

export default router
