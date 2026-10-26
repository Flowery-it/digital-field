import { onMounted, onUnmounted, watch, type Ref } from 'vue';
import type { EChartsType } from 'echarts/core';

/**
 * ECharts 容器自适应 composable
 * - ResizeObserver 感知容器自身尺寸变化（不止 window resize）
 * - rAF 防抖，避免高频重绘
 * - 支持 chartRef 由 null（v-if）延迟渲染为真实 DOM 后再监听
 * - 卸载时自动 disconnect + dispose，消除监听器泄漏
 */
export function useChartResize(
  getChart: () => EChartsType | null,
  el: Ref<HTMLElement | null>
) {
  let observer: ResizeObserver | null = null;
  let raf = 0;
  let observing = false;

  const schedule = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => getChart()?.resize());
  };

  const startObserve = () => {
    if (observing || !el.value || typeof ResizeObserver === 'undefined') return;
    observer = new ResizeObserver(schedule);
    observer.observe(el.value);
    observing = true;
  };

  const stopObserve = () => {
    observer?.disconnect();
    observer = null;
    observing = false;
  };

  onMounted(() => {
    startObserve();
    // chartRef 初始为 null（v-if）时，待其渲染后再开始监听
    watch(
      () => el.value,
      (newEl, oldEl) => {
        if (newEl && newEl !== oldEl) {
          stopObserve();
          startObserve();
        }
      }
    );
  });

  onUnmounted(() => {
    stopObserve();
    cancelAnimationFrame(raf);
    getChart()?.dispose();
  });
}
