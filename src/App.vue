<template>
  <div class="app-container">
    <router-view />
    <footer class="site-footer">
      <div class="page-container footer-inner">
        <span class="footer-brand">数字田野 · 农产品价格与气象服务平台</span>
        <!-- 板块名与主导航（AppHeader）保持完全一致：
             首页 / 气象生产 / 我的关注 / 论坛。
             曾出现「农业气象」（主导航叫气象生产）与多出的「智能荐种」
             （实为气象生产的子页，不是一级板块），已一并对齐。 -->
        <nav class="footer-links" aria-label="页脚导航">
          <router-link to="/home">首页</router-link>
          <router-link to="/production/overview">气象生产</router-link>
          <router-link to="/my-focus">我的关注</router-link>
          <router-link to="/forum">论坛</router-link>
          <router-link v-if="userStore.isAdmin" to="/admin/home">管理后台</router-link>
        </nav>
        <span class="footer-note">行情与气象数据仅供演示参考，不构成生产经营决策依据</span>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useUserStore } from './stores/userStore';
import { initScrollMotion, disposeScrollMotion } from './utils/scrollMotion';

// 页脚按角色显示「管理后台」入口，口径与主导航一致（username === 'admin'）
const userStore = useUserStore();

onMounted(() => {
  userStore.initFromLocalStorage();
  // 滚动动效：区块进场 + 横幅视差。内部自行处理降级与「减弱动效」偏好
  initScrollMotion();
});

onUnmounted(disposeScrollMotion);
</script>

<style>
/* 全站外层容器：页面 + 页脚纵向，页脚固定在底部 */
.app-container {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}

.app-container > :not(.site-footer) {
  flex: 1;
}

/* 页脚：深森林绿收尾，与页头的细线纸面形成上下呼应 */
.site-footer {
  margin-top: var(--space-16);
  padding: var(--space-12) 0 var(--space-8);
  background: var(--brand-forest);
  border-top: 1px solid var(--brand-forest-deep);
  color: rgba(245, 242, 233, 0.7);
}

.footer-inner {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-6);
  font-family: var(--font-sans);
  font-size: var(--fs-xs);
  letter-spacing: 0.02em;
}

.footer-brand {
  font-family: var(--font-serif);
  font-size: var(--fs-lg);
  font-weight: var(--fw-regular);
  letter-spacing: 0.06em;
  color: #FBF8F0;
  max-width: 34ch;
  line-height: 1.6;
}

.footer-links {
  display: flex;
  gap: var(--space-5);
  flex-wrap: wrap;
  padding-top: 4px;
}

.footer-links a {
  position: relative;
  color: rgba(245, 242, 233, 0.72);
  text-decoration: none;
  padding-bottom: 3px;
  border-bottom: 1px solid transparent;
  transition: color 0.24s ease, border-color 0.24s ease;
}

.footer-links a:hover,
.footer-links a.router-link-active {
  color: #FBF8F0;
  border-bottom-color: rgba(245, 242, 233, 0.72);
}

.footer-note {
  width: 100%;
  margin-top: var(--space-6);
  padding-top: var(--space-5);
  border-top: 1px solid rgba(245, 242, 233, 0.14);
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.04em;
  color: rgba(245, 242, 233, 0.5);
}

@media (max-width: 768px) {
  .site-footer {
    margin-top: var(--space-12);
    padding: var(--space-8) 0 var(--space-6);
  }

  .footer-inner {
    flex-direction: column;
    gap: var(--space-4);
  }

  .footer-brand {
    font-size: var(--fs-base);
  }

  .footer-links {
    gap: var(--space-4);
  }
}
</style>
