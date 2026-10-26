import { onMounted, onUnmounted, ref } from 'vue';

/**
 * 响应式视口宽度：resize 时更新
 * 供 dialogWidth 等「小屏改百分比」的计算属性使用——
 * 直接读 window.innerWidth 的 computed 没有响应式依赖，resize 永不重算。
 */
export function useViewportWidth() {
  const width = ref(typeof window !== 'undefined' ? window.innerWidth : 1280);
  const onResize = () => {
    width.value = window.innerWidth;
  };
  onMounted(() => window.addEventListener('resize', onResize));
  onUnmounted(() => window.removeEventListener('resize', onResize));
  return width;
}
