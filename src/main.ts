import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import './style.css'
import App from './App.vue'
import router from './router'
import { useUserStore } from './stores/userStore'
import { bindRouter } from './utils/axios'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.use(ElementPlus)

// 将 router 注入 axios 拦截器：401 时以 SPA 方式跳登录页并携带 redirect
bindRouter(router)

// 初始化用户状态
const userStore = useUserStore()
userStore.initFromLocalStorage()

app.mount('#app')
