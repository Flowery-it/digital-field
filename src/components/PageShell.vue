<template>
  <!-- 页面外壳：整页 flex 柱布局 + 吸顶页头 + 主内容容器。
       业务视图只写页面专属内容；embedded 模式下由 /production 父页提供页头，
       自身退化为无壳内容面板（与既有 embedded 契约一致）。 -->
  <div class="page-shell">
    <AppHeader v-if="!embedded" />
    <el-main
      :id="embedded ? undefined : 'main-content'"
      class="page-main"
      :class="{ embedded }"
      v-loading="loading"
    >
      <div class="page-container">
        <slot />
      </div>
    </el-main>
  </div>
</template>

<script setup lang="ts">
import AppHeader from './AppHeader.vue';

defineProps<{
  /** 嵌入模式：不渲染页头，主内容区去掉留白与底色 */
  embedded?: boolean;
  /** 主内容区加载态（el-main 上的 v-loading） */
  loading?: boolean;
}>();
</script>
