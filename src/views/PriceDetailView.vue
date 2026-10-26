<template>
  <PageShell :loading="loading">
    <PageHeader
      :title="product.name || '品种详情'"
      :crumbs="[
        { label: '首页', to: '/home' },
        { label: '价格总览' },
        { label: product.name || '品种详情' }
      ]"
    >
      <template #meta>
        <el-tag v-if="product.category" size="small">{{ categoryLabel }}</el-tag>
        <span v-if="product.spec" class="meta-text">规格：{{ product.spec }}</span>
      </template>
    </PageHeader>

        <!-- 错误态（P0-8）：与空态分离，分得清「没加载出来」和「没数据」 -->
        <div v-if="loadError" class="state-error" role="alert">
          <el-icon><WarningFilled /></el-icon>
          <span>品种数据加载失败，请稍后重试</span>
          <el-button size="small" type="primary" @click="fetchDetail">重试</el-button>
        </div>

        <!-- 品种头部 -->
        <el-card class="detail-card" v-if="headline">
          <div class="headline">
            <div class="headline-item">
              <div class="hl-label">全国均价</div>
              <div class="hl-value price">¥{{ headline.nationalAvg }}<span class="hl-unit">/公斤</span></div>
            </div>
            <div class="headline-item">
              <div class="hl-label">较昨日</div>
              <div class="hl-value" :class="dodClass">{{ dodText }}</div>
            </div>
            <div class="headline-item">
              <div class="hl-label">收录市场</div>
              <div class="hl-value">{{ headline.marketCount }} 个</div>
            </div>
            <div class="headline-item">
              <div class="hl-label">数据日期</div>
              <div class="hl-value date">{{ priceDate }}</div>
            </div>
          </div>
        </el-card>

        <!-- 走势图 -->
        <el-card class="detail-card">
          <template #header>
            <div class="card-header">
              <h2 class="card-title">价格走势</h2>
              <el-radio-group v-model="range" size="small" @change="fetchDetail">
                <el-radio-button :value="30">近 30 天</el-radio-button>
                <el-radio-button :value="90">近 90 天</el-radio-button>
                <el-radio-button :value="365">近 1 年</el-radio-button>
              </el-radio-group>
            </div>
          </template>
          <div ref="chartRef" class="chart-container"></div>
          <div class="chart-note">虚线为去年同期价格，用于判断当前价位处于历史什么水平</div>
        </el-card>

        <!-- AI 价格预测（岭回归模型） -->
        <el-card class="detail-card forecast-card" v-loading="forecastLoading">
          <template #header>
            <div class="card-header">
              <h2 class="card-title">价格预测</h2>
              <div class="forecast-actions">
                <el-select
                  v-model="forecastMarket"
                  size="small"
                  class="forecast-market-select"
                  placeholder="全国均价"
                  @change="fetchForecast"
                >
                  <el-option label="全国均价（各市场等权平均）" value="" />
                  <el-option
                    v-for="m in marketQuotes"
                    :key="m.marketId"
                    :label="m.marketName"
                    :value="m.marketId"
                  />
                </el-select>
                <el-button size="small" @click="fetchForecast">重新预测</el-button>
              </div>
            </div>
          </template>

          <!-- 模型不可用时降级为一行提示，不影响页面其余部分 -->
          <div v-if="forecastError && !forecastData" class="state-error" role="alert">
            <el-icon><WarningFilled /></el-icon>
            <span>{{ forecastError }}</span>
          </div>

          <template v-else-if="forecastData">
            <div class="forecast-metrics">
              <div class="fm-item">
                <span class="fm-label">预测基准</span>
                <span class="fm-value">{{ forecastData.baseDate }} · ¥{{ forecastData.lastPrice }}</span>
              </div>
              <div class="fm-item">
                <span class="fm-label">{{ forecastData.days }} 日后中枢</span>
                <span class="fm-value" :class="fcReturnClass">
                  ¥{{ fcLast ? fcLast.price : '—' }}（{{ fcReturnText }}）
                </span>
              </div>
              <div class="fm-item">
                <span class="fm-label">95% 参考区间</span>
                <span class="fm-value">
                  {{ fcLast ? `${fcLast.lower} ~ ${fcLast.upper}` : '—' }}
                </span>
              </div>
              <div class="fm-item">
                <span class="fm-label">方向准确率</span>
                <span class="fm-value">{{ fcMetrics ? `${fcMetrics.directionAccuracyPct}%` : '—' }}</span>
              </div>
              <div class="fm-item">
                <span class="fm-label">较基线误差</span>
                <span class="fm-value up">−{{ fcMetrics ? fcMetrics.skillPct : '—' }}%</span>
              </div>
            </div>
            <div ref="forecastRef" class="forecast-chart"></div>
            <div class="forecast-note">基于本地样例数据，仅供参考，不构成交易建议。</div>
          </template>
        </el-card>

        <!-- 产区销区价差 -->
        <el-card class="detail-card" v-if="spread && spread.producerToConsumer !== null">
          <template #header>
            <div class="card-header"><h2 class="card-title">产区销区价差</h2></div>
          </template>
          <div class="spread-body">
            <div class="spread-item">
              <span class="sp-tag origin">产地型均价</span>
              <span class="sp-value">¥{{ spread.byType['产地型'] }}</span>
            </div>
            <div class="spread-arrow">
              <span class="sp-diff">−</span>
            </div>
            <div class="spread-item">
              <span class="sp-tag consume">销地型均价</span>
              <span class="sp-value">¥{{ spread.byType['销地型'] }}</span>
            </div>
            <div class="spread-arrow"><span class="sp-eq">=</span></div>
            <div class="spread-item highlight">
              <span class="sp-tag gap">价差</span>
              <span class="sp-value big">¥{{ spread.producerToConsumer }}</span>
            </div>
          </div>
          <div class="spread-note">
            价差为正值说明外运存在理论空间，但需叠加运费、损耗与人工成本后再判断是否值得外运。
          </div>
        </el-card>

        <!-- 各市场报价 -->
        <el-card class="detail-card">
          <template #header>
            <div class="card-header"><h2 class="card-title">各市场报价（{{ priceDate }}）</h2></div>
          </template>
          <!-- 表格横向滚动容器（P0-6）：窄屏允许横滑而非撑破布局 -->
          <div class="table-scroll">
            <el-table :data="marketQuotes" stripe style="width: 100%">
              <el-table-column label="市场" min-width="200">
                <template #default="{ row }">
                  <span class="cell-link" @click="router.push(`/market/${row.marketId}`)">{{ row.marketName }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="marketType" label="类型" width="90">
                <template #default="{ row }">
                  <el-tag size="small" :type="typeTag(row.marketType)">{{ row.marketType }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="province" label="所在地" width="90" />
              <el-table-column label="价格区间" width="150">
                <template #default="{ row }">
                  ¥{{ row.priceLow }} ~ ¥{{ row.priceHigh }}
                </template>
              </el-table-column>
              <el-table-column label="均价" width="110" sortable>
                <template #default="{ row }">
                  <span class="cell-price">¥{{ row.priceAvg }}</span>
                </template>
              </el-table-column>
              <el-table-column label="较昨日" width="110" sortable>
                <template #default="{ row }">
                  <span v-if="row.changePctDod !== null" :class="pctClass(row.changePctDod)">
                    {{ row.changePctDod > 0 ? '+' : '' }}{{ row.changePctDod }}%
                  </span>
                  <span v-else class="cell-na">—</span>
                </template>
              </el-table-column>
              <el-table-column label="较去年同期" width="120" sortable>
                <template #default="{ row }">
                  <span v-if="row.changePctYoy !== null" :class="pctClass(row.changePctYoy)">
                    {{ row.changePctYoy > 0 ? '+' : '' }}{{ row.changePctYoy }}%
                  </span>
                  <span v-else class="cell-na">—</span>
                </template>
              </el-table-column>
            </el-table>
          </div>
          <div v-if="!loading && !marketQuotes.length && !loadError" class="empty-tip">
            暂无市场报价数据
          </div>
          <div class="table-note">
            不同市场口径（批发价 / 产地收购价）存在差异，页面按市场类型分组展示，不跨类型计算均价。
          </div>
        </el-card>

        <!-- 季节性参考 -->
        <el-card class="detail-card">
          <template #header>
            <div class="card-header"><h2 class="card-title">季节性参考（近三年月度中枢）</h2></div>
          </template>
          <div ref="seasonRef" class="season-chart"></div>
          <div class="season-note">仅反映历史价格中枢，不构成对未来价格的预测。</div>
        </el-card>
  </PageShell>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import * as echarts from 'echarts/core';
import { LineChart, BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsType } from 'echarts/core';

// 按需引入图表组件（替代全量 import * as echarts）
echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);
import { WarningFilled } from '@element-plus/icons-vue';
import PageShell from '../components/PageShell.vue';
import PageHeader from '../components/PageHeader.vue';
import { useChartResize } from '../composables/useChartResize';
import { useAuthGuard } from '../composables/useAuthGuard';
import { getChartTheme } from '../composables/useChartTheme';
import axiosInstance from '../utils/axios';

const route = useRoute();
const router = useRouter();
const guard = useAuthGuard();

const CATEGORY_LABEL: Record<string, string> = {
  grain: '粮食作物',
  veg: '蔬菜',
  fruit: '水果'
};

const loading = ref(false);
// 错误态（P0-8）：请求失败时展示重试入口，与「无数据」空态区分
const loadError = ref(false);
const range = ref(30);
const RANGE_OPTIONS = [30, 90, 365];

// 时间范围与 URL query 同步：视图可分享、刷新不丢失
watch(range, (v) => {
  router.replace({ query: { ...route.query, range: String(v) } });
});
const product = ref<any>({});
const priceDate = ref('');
const headline = ref<any>(null);
const trendCurrent = ref<{ date: string; price: number }[]>([]);
const trendLastYear = ref<{ date: string; price: number }[]>([]);
const marketQuotes = ref<any[]>([]);
const spread = ref<any>(null);
const seasonal = ref<{ month: number; avgPrice: number }[]>([]);

// ---- AI 价格预测（岭回归模型，参数由 scripts/train_price_model.py 离线训练导出） ----
const forecastRef = ref<HTMLElement | null>(null);
let forecastInstance: EChartsType | null = null;
const forecastLoading = ref(false);
const forecastError = ref('');
const forecastData = ref<any>(null);
const forecastMarket = ref('');

const fcLast = computed(() => {
  const pts = forecastData.value?.points;
  return pts && pts.length ? pts[pts.length - 1] : null;
});
const fcMetrics = computed(() => forecastData.value?.metrics || null);
const fcReturnText = computed(() => {
  const r = forecastData.value?.predictedReturn;
  if (r === undefined || r === null) return '—';
  return `${r > 0 ? '+' : ''}${r}%`;
});
const fcReturnClass = computed(() =>
  (forecastData.value?.predictedReturn ?? 0) >= 0 ? 'up' : 'down'
);

const chartRef = ref<HTMLElement | null>(null);
const seasonRef = ref<HTMLElement | null>(null);
let chartInstance: EChartsType | null = null;
let seasonInstance: EChartsType | null = null;

const categoryLabel = computed(() => CATEGORY_LABEL[product.value.category] || product.value.category || '');

const dodClass = computed(() => {
  const c = headline.value?.changePctDod;
  if (c === null || c === undefined) return '';
  return c >= 0 ? 'up' : 'down';
});
const dodText = computed(() => {
  const c = headline.value?.changePctDod;
  if (c === null || c === undefined) return '—';
  return `${c > 0 ? '+' : ''}${c}%`;
});

const pctClass = (v: number) => (v >= 0 ? 'up' : 'down');
const typeTag = (t: string) => (t === '产地型' ? 'success' : t === '集散型' ? 'warning' : 'primary');

const initChart = () => {
  if (chartRef.value && !chartInstance) {
    chartInstance = echarts.init(chartRef.value);
    // ResizeObserver 自适应（P1-5）：替代 window resize 监听，随容器尺寸变化重绘
    useChartResize(() => chartInstance, chartRef);
  }
  if (seasonRef.value && !seasonInstance) {
    seasonInstance = echarts.init(seasonRef.value);
    useChartResize(() => seasonInstance, seasonRef);
  }
};

const updateChart = () => {
  if (!chartInstance) return;
  // 去年同期按「月-日」对齐本期，月份标签取本期
  const cur = trendCurrent.value;
  const last = trendLastYear.value;
  const labels = cur.map(d => d.date.slice(5).replace('-', '/'));

  const lastMap: Record<string, number> = {};
  last.forEach(d => { lastMap[d.date.slice(5)] = d.price; });
  const lastAligned = cur.map(d => lastMap[d.date.slice(5)] ?? null);

  const ct = getChartTheme();
  chartInstance.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
    legend: { data: ['本期均价', '去年同期'], top: 0 },
    grid: { left: 55, right: 25, top: 45, bottom: 35 },
    xAxis: {
      type: 'category',
      data: labels,
      boundaryGap: false,
      axisLabel: { color: ct.axisLabel, interval: Math.max(0, Math.floor(labels.length / 10)) }
    },
    yAxis: {
      type: 'value',
      name: '元/公斤',
      scale: true,
      axisLabel: { color: ct.axisLabel },
      splitLine: { lineStyle: { color: ct.axisLine } }
    },
    series: [
      {
        name: '本期均价',
        type: 'line',
        data: cur.map(d => d.price),
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 3, color: ct.seriesPrimary },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: ct.areaPrimaryFrom },
            { offset: 1, color: ct.areaPrimaryTo }
          ])
        }
      },
      {
        name: '去年同期',
        type: 'line',
        data: lastAligned,
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2, type: 'dashed', color: ct.seriesAccent },
        itemStyle: { color: ct.seriesAccent }
      }
    ]
    // notMerge：切换品种/时间范围时避免残留上一次的 series 与坐标轴
  }, true);
};

const updateSeasonChart = () => {
  if (!seasonInstance || !seasonal.value.length) return;
  const ct = getChartTheme();
  seasonInstance.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: 55, right: 25, top: 30, bottom: 30 },
    xAxis: {
      type: 'category',
      data: seasonal.value.map(s => `${s.month}月`),
      axisLabel: { color: ct.axisLabel }
    },
    yAxis: {
      type: 'value',
      name: '元/公斤',
      scale: true,
      axisLabel: { color: ct.axisLabel },
      splitLine: { lineStyle: { color: ct.axisLine } }
    },
    series: [{
      name: '月度中枢',
      type: 'bar',
      data: seasonal.value.map(s => s.avgPrice),
      barWidth: '55%',
      itemStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: ct.seriesGreen },
          { offset: 1, color: ct.areaGreenTo }
        ]),
        borderRadius: [4, 4, 0, 0]
      },
      label: { show: true, position: 'top', color: ct.axisLabel, fontSize: 11 }
    }]
  }, true);
};

const initForecastChart = () => {
  if (forecastRef.value && !forecastInstance) {
    forecastInstance = echarts.init(forecastRef.value);
    useChartResize(() => forecastInstance, forecastRef);
  }
};

const updateForecastChart = () => {
  if (!forecastInstance || !forecastData.value) return;
  const hist = trendCurrent.value.slice(-30);
  const pts = forecastData.value.points || [];
  if (!hist.length || !pts.length) return;

  const fcLabels = pts.map((p: any) => p.date);
  const labels = [...hist.map(d => d.date), ...fcLabels].map(d => d.slice(5).replace('-', '/'));
  const lastHist = hist[hist.length - 1];
  const lastHistPrice = lastHist ? lastHist.price : 0;

  // 历史段：预测日留空，避免两段折线视觉粘连
  const histValues: (number | null)[] = [...hist.map(d => d.price), ...fcLabels.map(() => null)];
  // 预测段必须按 x 轴位置右对齐：前面补 hist.length - 1 个空位，
  // 最后 1 个历史点位置作为衔接点（与历史线末端重合），预测日接在其后
  const pad: (number | null)[] = new Array(hist.length - 1).fill(null);
  const fcValues: (number | null)[] = [...pad, lastHistPrice, ...pts.map((p: any) => p.price)];
  // 95% 区间：ECharts 堆叠面积带（下界透明 + 带宽可见），同样右对齐
  const lowerValues: (number | null)[] = [...pad, lastHistPrice, ...pts.map((p: any) => p.lower)];
  const bandValues: (number | null)[] = [
    ...pad,
    0,
    ...pts.map((p: any) => Number((p.upper - p.lower).toFixed(3)))
  ];

  const ct = getChartTheme();
  forecastInstance.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      // 自定义提示：只列出当日真实存在的值，隐藏「区间下界」堆叠辅助系列
      formatter: (params: any) => {
        const list: any[] = Array.isArray(params) ? params : [params];
        if (!list.length) return '';
        const i = list[0].dataIndex as number;
        const dot = (c: string) =>
          `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c};margin-right:6px;"></span>`;
        const row = (c: string, name: string, val: string) =>
          `<div style="display:flex;align-items:center;justify-content:space-between;gap:20px;">` +
          `<span>${dot(c)}${name}</span>` +
          `<span style="font-variant-numeric:tabular-nums;">${val}</span></div>`;
        const rows: string[] = [];
        const hv = histValues[i];
        if (hv !== null && hv !== undefined) {
          rows.push(row(ct.seriesPrimary, '历史均价', `${Number(hv).toFixed(2)} 元/公斤`));
        }
        const fv = fcValues[i];
        const lo = lowerValues[i];
        const bw = bandValues[i];
        if (fv !== null && fv !== undefined) {
          rows.push(row(ct.seriesAmber, 'AI 预测中枢', `${Number(fv).toFixed(2)} 元/公斤`));
        }
        if (lo !== null && lo !== undefined && bw !== null && bw !== undefined && bw > 0) {
          rows.push(
            row(ct.seriesAccent, '95% 参考区间', `${Number(lo).toFixed(2)} ~ ${Number(lo + bw).toFixed(2)}`)
          );
        }
        return `<div style="color:${ct.axisLabel};margin-bottom:4px;">${labels[i]}</div>${rows.join('')}`;
      }
    },
    legend: { data: ['历史均价', 'AI 预测中枢', '95% 参考区间'], top: 0 },
    grid: { left: 55, right: 40, top: 45, bottom: 35 },
    xAxis: {
      type: 'category',
      data: labels,
      boundaryGap: false,
      axisLabel: { color: ct.axisLabel, interval: Math.max(0, Math.floor(labels.length / 10)) }
    },
    yAxis: {
      type: 'value',
      name: '元/公斤',
      scale: true,
      axisLabel: { color: ct.axisLabel },
      splitLine: { lineStyle: { color: ct.axisLine } }
    },
    series: [
      {
        name: '历史均价',
        type: 'line',
        data: histValues,
        smooth: true,
        symbol: 'none',
        z: 4,
        lineStyle: { width: 3, color: ct.seriesPrimary },
        itemStyle: { color: ct.seriesPrimary }
      },
      {
        name: 'AI 预测中枢',
        type: 'line',
        data: fcValues,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        z: 5,
        lineStyle: { width: 2.5, type: 'dashed', color: ct.seriesAmber },
        itemStyle: { color: ct.seriesAmber }
      },
      {
        name: '区间下界',
        type: 'line',
        stack: 'conf',
        data: lowerValues,
        symbol: 'none',
        z: 1,
        lineStyle: { opacity: 0 },
        areaStyle: { opacity: 0 },
        silent: true,
        tooltip: { show: false }
      },
      {
        name: '95% 参考区间',
        type: 'line',
        stack: 'conf',
        data: bandValues,
        symbol: 'none',
        z: 2,
        lineStyle: { opacity: 0 },
        areaStyle: { color: ct.areaAmberTo },
        silent: true,
        tooltip: { show: false }
      }
    ]
    // notMerge：切换品种/市场时避免残留上一次的 series 与坐标轴
  }, true);
};

const fetchForecast = async () => {
  const productId = route.params.productId as string;
  if (!productId) return;
  forecastLoading.value = true;
  forecastError.value = '';
  try {
    const res: any = await axiosInstance.get('/price/forecast', {
      params: { productId, marketId: forecastMarket.value || undefined }
    });
    forecastData.value = res.data;
    await nextTick();
    initForecastChart();
    updateForecastChart();
  } catch (error: any) {
    forecastData.value = null;
    forecastError.value = error?.response?.data?.message || '价格预测暂不可用';
  } finally {
    forecastLoading.value = false;
  }
};

const fetchDetail = async () => {
  const productId = route.params.productId as string;
  if (!productId) return;
  loading.value = true;
  loadError.value = false;
  try {
    const res: any = await axiosInstance.get(`/price/detail/${productId}`, { params: { range: range.value } });
    const d = res.data;
    product.value = d.product || {};
    priceDate.value = d.priceDate || '';
    headline.value = d.headline || null;
    trendCurrent.value = d.trend?.current || [];
    trendLastYear.value = d.trend?.lastYear || [];
    marketQuotes.value = d.marketQuotes || [];
    spread.value = d.spread || null;
    seasonal.value = d.seasonal || [];

    await nextTick();
    initChart();
    updateChart();
    updateSeasonChart();
    await fetchForecast();
  } catch {
    loadError.value = true;
    /* 拦截器已提示 */
  } finally {
    loading.value = false;
  }
};

onMounted(async () => {
  if (!guard()) return;
  // 从 URL 恢复时间范围
  const q = Number(route.query.range);
  if (RANGE_OPTIONS.includes(q)) range.value = q;
  await fetchDetail();
});
</script>

<style scoped>
/* 面包屑 / 页头 / 卡片标题 / 错误空态 / 涨跌色 均已上提全局 style.css，
   本文件不再重复定义 .page-breadcrumb / .page-head / .page-title / .page-meta / .meta-text */

.detail-card {
  margin-bottom: var(--space-block);
}

/* 头部指标：改为栅格卡片，比一排裸文本更易扫读 */
.headline {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--space-4);
}

.headline-item {
  padding: var(--space-3) var(--space-4);
  background: var(--surface-soft);
  border-radius: var(--radius-md);
}

.headline-item .hl-label {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  margin-bottom: var(--space-1);
}

.headline-item .hl-value {
  font-size: var(--fs-3xl);
  font-weight: var(--fw-bold);
  color: var(--text-primary);
  line-height: var(--lh-tight);
}

.headline-item .hl-value.price {
  color: var(--brand-blue);
}

.headline-item .hl-unit {
  font-size: var(--fs-sm);
  font-weight: var(--fw-regular);
  color: var(--text-secondary);
  margin-left: 2px;
}

.headline-item .hl-value.date {
  font-size: var(--fs-xl);
}

/* 价差：横向流程，箭头居中，三段等宽对齐 */
.spread-body {
  display: flex;
  align-items: stretch;
  gap: var(--space-4);
  flex-wrap: wrap;
}

.spread-item {
  flex: 1 1 160px;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  background: var(--surface-soft);
  border-radius: var(--radius-md);
}

.spread-item.highlight {
  background: var(--brand-soft);
  border: 1px solid var(--brand-soft-border);
}

.sp-tag {
  font-size: var(--fs-xs);
  color: #fff;
  padding: 2px 10px;
  border-radius: var(--radius-sm);
  width: fit-content;
  font-weight: var(--fw-medium);
}

.sp-tag.origin { background: var(--down-text); }
.sp-tag.consume { background: var(--up-badge-bg); }
.sp-tag.gap { background: var(--brand-blue); }

.sp-value {
  font-size: var(--fs-2xl);
  font-weight: 700;
  color: var(--text-primary);
}

.sp-value.big {
  font-size: var(--fs-4xl);
  color: var(--brand-blue);
}

.spread-arrow {
  display: flex;
  align-items: center;
  font-size: var(--fs-2xl);
  color: var(--text-secondary);
  flex: 0 0 auto;
}

/* .spread-note / .table-note / .chart-note / .season-note 已上提全局 style.css */

.chart-container {
  height: var(--chart-h-price);
}

.season-chart {
  height: var(--chart-h-season);
}

/* AI 价格预测区块 */
.forecast-actions {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

/* 预测指标：栅格卡片，桌面 5 列自动换行 */
.forecast-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.fm-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-3);
  background: var(--surface-soft);
  border-radius: var(--radius-md);
}

.fm-label {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
}

.fm-value {
  font-size: var(--fs-lg);
  font-weight: var(--fw-bold);
  color: var(--text-primary);
  line-height: var(--lh-tight);
}

.forecast-meta {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  line-height: var(--lh-relaxed);
  margin-bottom: var(--space-3);
}

.forecast-chart {
  height: var(--chart-h-season);
}

.forecast-note {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  margin-top: var(--space-3);
  line-height: var(--lh-relaxed);
}

.forecast-note code {
  font-family: ui-monospace, Consolas, monospace;
  background: var(--surface-soft);
  border-radius: var(--radius-sm);
  padding: 1px var(--space-2);
  color: var(--text-regular);
}

/* 预测口径选择器：桌面 220px，窄屏跟随卡片宽度（原内联 width 无响应式兜底） */
.forecast-market-select {
  width: 220px;
  max-width: 100%;
}

@media (max-width: 768px) {
  .fm-value {
    font-size: var(--fs-base);
  }

  .headline-item .hl-value {
    font-size: var(--fs-xl);
  }

  .spread-body {
    gap: var(--space-3);
  }

  .forecast-market-select {
    width: 100%;
  }
}
</style>
