import axios from 'axios';
import { ElMessage } from 'element-plus';

// 开发环境默认走 /api（由 vite 代理转发到 localhost:3000），
// 生产环境可通过 .env.production 的 VITE_API_BASE 覆盖为真实后端地址
const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/api',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// 401 时需要在拦截器内做 SPA 跳转；由 main.ts 在创建 router 后调用 bindRouter 注入，
// 避免 axios → router → views → axios 的循环依赖
let routerInstance: any = null;

export function bindRouter(router: any) {
  routerInstance = router;
}

// 请求拦截器
axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
axiosInstance.interceptors.response.use(
  (response) => {
    const { code, message } = response.data;
    if (code !== 200) {
      ElMessage.error(message);
      return Promise.reject(new Error(message));
    }
    return response.data;
  },
  (error) => {
    const { response } = error;
    if (response) {
      const { status, data } = response;
      switch (status) {
        case 401:
          ElMessage.error(data.message || '未授权，请重新登录');
          // 清除登录状态并跳转到登录页（SPA 内跳转，保留 redirect 与页面状态）
          localStorage.removeItem('token');
          localStorage.removeItem('userId');
          localStorage.removeItem('username');
          localStorage.removeItem('role');
          const current = window.location.pathname + window.location.search;
          // 已在登录页时不重复跳转（避免 URL 自我追加 redirect）
          if (routerInstance && window.location.pathname !== '/login') {
            routerInstance.push({ name: 'login', query: { redirect: current } });
          } else if (!routerInstance) {
            window.location.href = '/login';
          }
          break;
        case 403:
          ElMessage.error(data.message || '无权限访问');
          break;
        case 404:
          ElMessage.error('请求的资源不存在');
          break;
        case 500:
          ElMessage.error('服务器内部错误');
          break;
        default:
          ElMessage.error('请求失败');
      }
    } else {
      ElMessage.error('网络错误，请检查网络连接');
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;
