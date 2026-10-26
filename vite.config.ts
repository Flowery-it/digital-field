import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      // 开发环境将 /api 代理到 Express 后端，避免跨域
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
})
