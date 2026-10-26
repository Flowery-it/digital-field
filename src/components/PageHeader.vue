<template>
  <!-- 页面级标题区：面包屑 + 主标题 + 右侧元信息/操作。
       全站页面级头部统一走这个组件，避免各视图手写 .page-head / 面包屑。 -->
  <header class="page-head">
    <div class="ph-left">
      <el-breadcrumb v-if="crumbs?.length" class="page-breadcrumb" separator="/">
        <el-breadcrumb-item v-for="c in crumbs" :key="c.label" :to="c.to">
          {{ c.label }}
        </el-breadcrumb-item>
      </el-breadcrumb>
      <h1 v-if="title" class="page-title">{{ title }}</h1>
      <p v-if="subtitle" class="page-subtitle">{{ subtitle }}</p>
    </div>
    <div v-if="$slots.actions || meta?.length" class="page-meta">
      <slot name="meta">
        <el-tag v-for="m in meta || []" :key="m.label" :type="m.type" size="small">{{ m.label }}</el-tag>
      </slot>
      <slot name="actions" />
    </div>
  </header>
</template>

<script setup lang="ts">
export interface Crumb {
  label: string;
  to?: string | Record<string, unknown>;
}

withDefaults(
  defineProps<{
    /** 页面主标题 */
    title?: string;
    /** 标题下方一句话说明 */
    subtitle?: string;
    /** 面包屑（末项为当前页，不传 to） */
    crumbs?: Crumb[];
    /** 右侧元信息标签；复杂内容请改用 #meta 插槽 */
    meta?: { label: string; type?: 'primary' | 'success' | 'warning' | 'danger' | 'info' }[];
  }>(),
  {
    title: '',
    subtitle: '',
    crumbs: () => [],
    meta: () => []
  }
);
</script>

<style scoped>
/* 标题与说明纵向排列，作为标题区的左侧主体 */
.ph-left {
  min-width: 0;
}

.page-subtitle {
  margin-top: var(--space-2);
  font-family: var(--font-serif);
  font-size: var(--fs-md);
  line-height: var(--lh-relaxed);
  color: var(--text-secondary);
  max-width: 68ch;
}

/* 窄屏标题区改为纵向堆叠，操作换行到下一行 */
@media (max-width: 768px) {
  .page-head {
    align-items: flex-start;
    flex-direction: column;
    gap: var(--space-3);
  }

  .page-meta {
    width: 100%;
  }
}
</style>