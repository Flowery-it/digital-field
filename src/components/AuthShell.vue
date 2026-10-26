<template>
  <!-- 认证页外壳：登录 / 注册 / 管理端登录共用同一套版式与外壳样式，
       此前三个页面各写一遍背景、卡片、logo、按钮样式。 -->
  <div class="auth-shell" :style="{ '--auth-bg': `url(${background})` }">
    <div class="auth-card">
      <div class="auth-brand">
        <img class="auth-logo" src="/images/favicon-128.png" alt="" width="56" height="56" />
        <h2 class="auth-title">{{ siteName }}</h2>
        <p class="auth-subtitle">{{ subtitle }}</p>
      </div>
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    /** 站点名，登录/注册为「数字田野」 */
    siteName?: string;
    /** 副标题，形如「农产品价格与气象服务平台 · 登录」 */
    subtitle: string;
    /** 背景图路径 */
    background?: string;
  }>(),
  {
    siteName: '数字田野',
    background: '/images/bg-home.jpg'
  }
);
</script>

<style scoped>
/* 外壳与卡片样式全部来自 style.css 的认证页骨架层，此处不重复定义 */
</style>