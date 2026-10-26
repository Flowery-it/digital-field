import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from '../stores/userStore';

/**
 * 业务页登录守卫（与路由 meta.requiresAuth 的双保险）
 * 未登录时回落登录页并阻止本次 onMounted 的后续数据请求。
 *
 * 用法：
 *   const guard = useAuthGuard();
 *   onMounted(() => {
 *     if (!guard()) return;
 *     // …加载数据
 *   });
 */
export function useAuthGuard() {
  const router = useRouter();
  const userStore = useUserStore();

  return () => {
    userStore.initFromLocalStorage();
    if (!userStore.isLoggedIn) {
      router.push('/login');
      return false;
    }
    return true;
  };
}

/** 挂载时即执行的守卫（不需要在 onMounted 里继续做事的页面用这个） */
export function useAuthGuardOnMounted() {
  const guard = useAuthGuard();
  onMounted(() => guard());
}
