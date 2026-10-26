import { useRouter } from 'vue-router';
import { useUserStore } from '../stores/userStore';

/**
 * 管理端登录守卫（四个管理页原各写一遍）
 * 与路由 meta.requiresAdmin 双保险：未登录或非管理员回落管理员登录页，
 * 并阻止本次 onMounted 的后续数据请求。
 *
 * 用法：
 *   const adminGuard = useAdminGuard();
 *   onMounted(() => {
 *     if (!adminGuard()) return;
 *     // …加载数据
 *   });
 */
export function useAdminGuard() {
  const router = useRouter();
  const userStore = useUserStore();

  return () => {
    userStore.initFromLocalStorage();
    if (!userStore.isLoggedIn || userStore.username !== 'admin') {
      router.push('/admin/login');
      return false;
    }
    return true;
  };
}
