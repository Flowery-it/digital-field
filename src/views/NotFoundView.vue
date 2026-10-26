<template>
  <div class="not-found">
    <el-empty
      image="/images/notfound-road.jpg"
      :image-size="160"
      description="页面不存在或已被移除"
    >
      <div class="nf-actions">
        <el-button type="primary" @click="router.push('/home')">返回首页</el-button>
        <el-button @click="router.push('/login')">去登录</el-button>
      </div>
    </el-empty>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();
</script>

<style scoped>
/* 404 页独占一屏：垂直居中，给出明确的救赎出口 */
.not-found {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-6) var(--space-4);
  background: var(--background-color);
}

.nf-actions {
  display: flex;
  gap: var(--space-3);
  flex-wrap: wrap;
  justify-content: center;
}

@media (max-width: 480px) {
  .nf-actions {
    flex-direction: column;
    width: min(240px, 100%);
  }

  .nf-actions .el-button {
    width: 100%;
    margin-left: 0 !important;
  }
}
</style>
