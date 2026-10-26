<template>
  <PageShell :loading="loading">
    <PageHeader
      :title="market.name || '市场详情'"
      :crumbs="[
        { label: '首页', to: '/home' },
        { label: '市场总览' },
        { label: market.name || '市场详情' }
      ]"
    >
      <template #meta>
        <el-tag v-if="market.marketType" size="small">{{ market.marketType }}</el-tag>
        <el-tag v-if="market.tier === 1" size="small" type="warning">标杆市场</el-tag>
        <span v-if="market.province || market.city" class="meta-text">
          {{ market.province }}{{ market.city ? ' · ' + market.city : '' }}
        </span>
        <!-- 上下文保持：看本市场报价 → 看本市场所在城市天气（城市缺失时隐藏，避免误导性入口） -->
        <el-button
          v-if="market.city"
          size="small"
          text
          type="primary"
          class="weather-link"
          @click="goWeather"
        >
          查看当地天气 →
        </el-button>
      </template>
    </PageHeader>

        <!-- 错误态（P0-8）：与空态分离，分得清「没加载出来」和「没数据」 -->
        <div v-if="loadError" class="state-error" role="alert">
          <el-icon><WarningFilled /></el-icon>
          <span>市场数据加载失败，请稍后重试</span>
          <el-button size="small" type="primary" @click="fetchDetail(true)">重试</el-button>
        </div>

        <!-- 市场头部 -->
        <el-card class="detail-card" v-if="headline">
          <div class="headline">
            <div class="headline-item">
              <div class="hl-label">报价品种</div>
              <div class="hl-value price">{{ headline.quotedCount }}<span class="hl-unit">个</span></div>
            </div>
            <div class="headline-item">
              <div class="hl-label">今日涨跌</div>
              <div class="hl-value stat">
                <span class="up">{{ headline.up }} 涨</span>
                <span class="sep">/</span>
                <span class="down">{{ headline.down }} 跌</span>
                <span class="sep">/</span>
                <span class="flat">{{ headline.flat }} 平</span>
              </div>
            </div>
            <div class="headline-item" v-if="headline.topUp">
              <div class="hl-label">涨幅最大</div>
              <div class="hl-value top">
                {{ headline.topUp.name }}
                <span class="up">+{{ headline.topUp.changePctDod }}%</span>
              </div>
            </div>
            <div class="headline-item">
              <div class="hl-label">数据日期</div>
              <div class="hl-value date">{{ priceDate }}</div>
            </div>
          </div>
        </el-card>

        <!-- 品种走势 -->
        <el-card class="detail-card" v-if="trendProduct">
          <template #header>
            <div class="card-header">
              <h2 class="card-title">{{ trendProduct.name }}价格走势</h2>
              <div class="header-tools">
                <el-select v-model="trendProductId" size="small" class="product-select" @change="fetchDetail(false)">
                  <el-option v-for="q in quotes" :key="q.productId" :label="q.name" :value="q.productId" />
                </el-select>
                <el-radio-group v-model="range" size="small" @change="fetchDetail(false)">
                  <el-radio-button :value="30">近 30 天</el-radio-button>
                  <el-radio-button :value="90">近 90 天</el-radio-button>
                  <el-radio-button :value="365">近 1 年</el-radio-button>
                </el-radio-group>
              </div>
            </div>
          </template>
          <div ref="chartRef" class="chart-container"></div>
          <div class="chart-note">
            实线为该市场自身报价，虚线为同期全国均价，可用于判断本市场报价处于全国什么水平。
          </div>
        </el-card>

        <!-- 品种报价全表 -->
        <el-card class="detail-card">
          <template #header>
            <div class="card-header">
              <h2 class="card-title">品种报价（{{ priceDate }}）</h2>
              <el-radio-group v-model="category" size="small">
                <el-radio-button value="">全部</el-radio-button>
                <el-radio-button value="grain">粮食</el-radio-button>
                <el-radio-button value="veg">蔬菜</el-radio-button>
                <el-radio-button value="fruit">水果</el-radio-button>
              </el-radio-group>
            </div>
          </template>
          <!-- 表格横向滚动容器（P0-6）：窄屏允许横滑而非撑破布局 -->
          <div class="table-scroll">
            <el-table :data="filteredQuotes" stripe style="width: 100%">
              <el-table-column label="品种" min-width="140">
                <template #default="{ row }">
                  <span class="cell-link" @click="router.push(`/price/${row.productId}`)">{{ row.name }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="spec" label="规格" width="100" />
              <el-table-column label="价格区间" width="160">
                <template #default="{ row }">
                  ¥{{ row.priceLow }} ~ ¥{{ row.priceHigh }}
                </template>
              </el-table-column>
              <el-table-column label="均价" width="110" sortable :sort-method="sortByPrice">
                <template #default="{ row }">
                  <span class="cell-price">¥{{ row.priceAvg }}</span>
                </template>
              </el-table-column>
              <el-table-column label="较昨日" width="110" sortable :sort-method="sortByDod">
                <template #default="{ row }">
                  <span v-if="row.changePctDod !== null" :class="pctClass(row.changePctDod)">
                    {{ row.changePctDod > 0 ? '+' : '' }}{{ row.changePctDod }}%
                  </span>
                  <span v-else class="cell-na">—</span>
                </template>
              </el-table-column>
              <el-table-column label="较去年同期" width="120" sortable :sort-method="sortByYoy">
                <template #default="{ row }">
                  <span v-if="row.changePctYoy !== null" :class="pctClass(row.changePctYoy)">
                    {{ row.changePctYoy > 0 ? '+' : '' }}{{ row.changePctYoy }}%
                  </span>
                  <span v-else class="cell-na">—</span>
                </template>
              </el-table-column>
            </el-table>
          </div>
          <div v-if="!loading && !filteredQuotes.length && !loadError" class="empty-tip">
            该市场暂无{{ categoryLabel(category) }}报价
          </div>
          <div class="table-note">
            报价为该市场当日登记数据，点击品种名可查看该品种全国走势。不同市场口径（批发价 / 产地收购价）存在差异，不跨市场类型计算均价。
          </div>
        </el-card>
  </PageShell>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsType } from 'echarts/core';

// 按需引入图表组件（替代全量 import * as echarts）
echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);
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
  grain: '粮食',
  veg: '蔬菜',
  fruit: '水果',
  '': ''
};

const loading = ref(false);
// 错误态（P0-8）：请求失败时展示重试入口，与「无数据」空态区分
const loadError = ref(false);
const market = ref<any>({});
const priceDate = ref('');
const headline = ref<any>(null);
const quotes = ref<any[]>([]);
const trendProduct = ref<any>(null);
const trendMarket = ref<{ date: string; price: number }[]>([]);
const trendNational = ref<{ date: string; price: number }[]>([]);
const trendProductId = ref('');
const range = ref(30);
const RANGE_OPTIONS = [30, 90, 365];

// 时间范围与 URL query 同步：视图可分享、刷新不丢失
watch(range, (v) => {
  router.replace({ query: { ...route.query, range: String(v) } });
});
const category = ref('');

const chartRef = ref<HTMLElement | null>(null);
let chartInstance: EChartsType | null = null;

const filteredQuotes = computed(() =>
  category.value ? quotes.value.filter(q => q.category === category.value) : quotes.value
);

const categoryLabel = (c: string) => CATEGORY_LABEL[c] ?? c;
const pctClass = (v: number) => (v >= 0 ? 'up' : 'down');

// 查看该市场所在城市的天气（带 city 上下文，与 WeatherView ?city= 处理对接）
const goWeather = () => {
  router.push({ path: '/production/weather', query: { city: market.value.city } });
};

const sortByPrice = (a: any, b: any) => a.priceAvg - b.priceAvg;
const sortByDod = (a: any, b: any) => (a.changePctDod ?? -Infinity) - (b.changePctDod ?? -Infinity);
const sortByYoy = (a: any, b: any) => (a.changePctYoy ?? -Infinity) - (b.changePctYoy ?? -Infinity);

const initChart = () => {
  if (chartRef.value && !chartInstance) {
    chartInstance = echarts.init(chartRef.value);
    // ResizeObserver 自适应（P1-5）：替代 window resize 监听，随容器尺寸变化重绘
    useChartResize(() => chartInstance, chartRef);
  }
};

const updateChart = () => {
  if (!chartInstance) return;
  const labels = trendMarket.value.map(d => d.date.slice(5).replace('-', '/'));
  const nationalMap: Record<string, number> = {};
  trendNational.value.forEach(d => { nationalMap[d.date.slice(5)] = d.price; });
  const nationalAligned = trendMarket.value.map(d => nationalMap[d.date.slice(5)] ?? null);

  const ct = getChartTheme();
  chartInstance.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
    legend: { data: ['本市场报价', '全国均价'], top: 0 },
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
        name: '本市场报价',
        type: 'line',
        data: trendMarket.value.map(d => d.price),
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
        name: '全国均价',
        type: 'line',
        data: nationalAligned,
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2, type: 'dashed', color: ct.seriesAccent },
        itemStyle: { color: ct.seriesAccent }
      }
    ]
    // notMerge：切换市场/品种/时间范围时避免残留上一次的 series
  }, true);
};

// full=true 时重新拉取全部数据（首次进入 / 切换品种）；full=false 仅刷新走势
const fetchDetail = async (full = true) => {
  const marketId = route.params.marketId as string;
  if (!marketId) return;
  if (full) loading.value = true;
  loadError.value = false;
  try {
    const res: any = await axiosInstance.get(`/market/detail/${marketId}`, {
      params: { range: range.value, productId: trendProductId.value || undefined }
    });
    const d = res.data;
    market.value = d.market || {};
    priceDate.value = d.priceDate || '';
    headline.value = d.headline || null;
    quotes.value = d.quotes || [];
    trendProduct.value = d.trendProduct || null;
    if (d.trendProduct && !trendProductId.value) trendProductId.value = d.trendProduct.productId;
    trendMarket.value = d.trend?.market || [];
    trendNational.value = d.trend?.national || [];

    await nextTick();
    initChart();
    updateChart();
  } catch {
    loadError.value = true;
    /* 拦截器已提示 */
  } finally {
    if (full) loading.value = false;
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
/* 面包屑 / 页头 / 卡片标题 / 错误空态 / 涨跌色 / 说明脚注 均已上提全局 style.css */

/* 查看当地天气入口：文字按钮，靠 meta 行末端 */
.weather-link {
  margin-left: var(--space-2);
  flex-shrink: 0;
}

.detail-card {
  margin-bottom: var(--space-block);
}

.product-select {
  width: 130px;
  max-width: 100%;
}

/* 头部指标：栅格卡片，与品种详情页同构 */
.headline {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
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

.headline-item .hl-value.stat {
  font-size: var(--fs-xl);
}

.headline-item .hl-value.top {
  font-size: var(--fs-xl);
}

.headline-item .hl-unit {
  font-size: var(--fs-sm);
  font-weight: var(--fw-regular);
  color: var(--text-secondary);
  margin-left: 2px;
}

.headline-item .hl-value.date {
  font-size: var(--fs-lg);
}

.stat .sep {
  color: var(--text-secondary);
  margin: 0 var(--space-1);
  font-weight: var(--fw-regular);
}

.stat .flat {
  color: var(--text-secondary);
}

.chart-container {
  height: var(--chart-h-price);
}

@media (max-width: 768px) {
  .headline-item .hl-value {
    font-size: var(--fs-xl);
  }
}
</style>
