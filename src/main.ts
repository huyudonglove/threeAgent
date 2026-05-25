import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'

const app = createApp(App)
app.use(router)
app.mount('#app')

import { nextTick } from 'vue'
nextTick(() => {
  window.agentAPI?.onMainProcessMessage((message) => {
    console.log('[main-process]', message)
  })
})
