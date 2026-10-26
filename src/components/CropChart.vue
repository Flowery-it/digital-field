<template>
  <div class="crop-chart">
    <div class="chart-header">
      <el-radio-group v-model="activeCategory" class="category-radio" @change="handleCategoryChange">
        <el-radio-button label="grain">基本粮食作物</el-radio-button>
        <el-radio-button label="cash">经济作物</el-radio-button>
        <el-radio-button label="vegetable">蔬菜</el-radio-button>
        <el-radio-button label="fruit">水果</el-radio-button>
        <el-radio-button label="total">粮食合计</el-radio-button>
      </el-radio-group>
      <el-select v-model="chartType" class="chart-type-select" @change="updateChart">
        <el-option label="折线图" value="line" />
        <el-option label="柱状图" value="bar" />
        <el-option label="饼图" value="pie" />
        <el-option label="散点图" value="scatter" />
      </el-select>
      <el-select
        v-model="selectedRegion"
        class="region-select"
        filterable
        clearable
        placeholder="全部地区"
        @change="loadChartData"
      >
        <el-option label="全部地区" value="" />
        <el-option v-for="r in regions" :key="r" :label="r" :value="r" />
      </el-select>
      <el-select
        v-model="valueMode"
        class="value-mode-select"
        @change="updateChart"
      >
        <el-option label="绝对值（万吨）" value="abs" />
        <el-option label="占比（%）" value="share" />
        <el-option label="指数（首年=100）" value="index" />
      </el-select>
      <el-select
        v-model="selectedCrop"
        class="crop-select"
        clearable
        placeholder="全部品种"
        @change="loadChartData"
      >
        <el-option label="全部品种" value="" />
        <el-option v-for="c in categoryCrops" :key="c" :label="c" :value="c" />
      </el-select>
      <span v-if="priceDateHint" class="data-hint">{{ priceDateHint }}</span>
    </div>
    <div v-loading="loading" class="chart-body">
      <div v-if="!loadError && chartData.yieldData.length" ref="chartRef" class="chart-container"></div>
      <div v-if="loadError" class="chart-error">
        <el-icon><WarningFilled /></el-icon>
        <span>产量数据加载失败，请稍后重试</span>
        <el-button size="small" type="primary" @click="loadChartData">重试</el-button>
      </div>
      <div v-else-if="!loading && !chartData.yieldData.length" class="chart-empty">
        <el-icon><InfoFilled /></el-icon>
        <span>当前筛选条件下暂无产量数据，请调整地区或作物</span>
      </div>
    </div>
    <div v-if="!loadError && chartData.yieldData.length" class="data-note">
      <span>
        数值口径可切换：<b>绝对值</b>为产量（万吨，纵轴按数据范围自适应，非从 0 起）、
        <b>占比</b>为该作物占同年本类合计的比重、<b>指数</b>以首年为 100；
        同一大类内作物量级差异较大时，建议用占比或指数比较。粮食组与水果组默认只展示品种分量，
        合计口径请在「全部品种」下拉中单独选择。
      </span>
      <span v-if="activeCategory === 'total'">
        粮食总产为国家统计局分省<b>真实数据</b>（2020—2024，stats.gov.cn 免费公开）。
      </span>
      <span v-else-if="activeCategory === 'grain'">
        稻谷/小麦/玉米/大豆/其他粮食：全国合计按统计局分品种口径 IPF 校准（偏差为零），
        省级为产区带分摊、市级为省内权重分摊，<b>不代表真实单产</b>。
      </span>
      <span v-else-if="activeCategory === 'vegetable'">
        蔬菜：全国总量为统计局公报<b>真实数据</b>（2020 约 7.49 亿吨 → 2024 约 8.6 亿吨，
        中间年份按线性插值），省级为产区带分摊、市级为省内权重分摊，<b>不代表真实单产</b>。
      </span>
      <span v-else-if="activeCategory === 'fruit'">
        水果合计与苹果/柑橘：全国总量为统计局公报<b>真实数据</b>（水果 2020 约 2.87 亿吨 →
        2024 约 3.4 亿吨；苹果 4406.6→5128.51 万吨；柑橘 5121.9→6791.49 万吨，中间年份线性插值），
        省级为产区带分摊（苹果-陕鲁、柑橘-桂湘鄂为主产省），<b>不代表真实单产</b>。
      </span>
      <span v-else>
        棉花/花生/油菜籽/甘蔗/茶叶：全国总量为统计局公报<b>真实数据</b>（2020—2024），
        省级按产区带分摊（新疆棉花、广西甘蔗等主产省份额按公开产区格局校准），
        市级为省内权重分摊，<b>不代表真实单产</b>。
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, nextTick } from 'vue';
import * as echarts from 'echarts/core';
import { LineChart, BarChart, PieChart, ScatterChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, TitleComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsType } from 'echarts/core';
import { WarningFilled, InfoFilled } from '@element-plus/icons-vue';
import axiosInstance from '../utils/axios';
import { useChartResize } from '../composables/useChartResize';
import { getChartTheme } from '../composables/useChartTheme';

// 按需引入图表组件（替代全量 import * as echarts），显著缩小图表 chunk
echarts.use([LineChart, BarChart, PieChart, ScatterChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, CanvasRenderer]);

// 作物大类：grain-基本粮食作物 / cash-经济作物 / vegetable-蔬菜 / fruit-水果 / total-粮食合计
type CropCategory = 'grain' | 'cash' | 'vegetable' | 'fruit' | 'total';

const chartRef = ref<HTMLElement | null>(null);
let chartInstance: EChartsType | null = null;
const chartType = ref('line');
// 数值口径：abs-绝对值（万吨）/ share-同年占比（%）/ index-指数（首年=100）
// 同一大类内作物量级差异可达数十倍（如甘蔗 1 万吨级 vs 茶叶 百吨级），
// 绝对值口径下小作物会被压成平线，故提供占比与指数两种可比口径。
type ValueMode = 'abs' | 'share' | 'index';
const valueMode = ref<ValueMode>('abs');
const activeCategory = ref<CropCategory>('grain');
const selectedRegion = ref('');
const selectedCrop = ref('');
const loading = ref(false);
const loadError = ref(false);
const regions = ref<string[]>([]);
// 作物选项按大类分组（由 /crop/types 动态返回）
const cropGroups = ref<{ total: string[]; grain: string[]; cash: string[]; vegetable: string[]; fruit: string[] }>({ total: [], grain: [], cash: [], vegetable: [], fruit: [] });
const categoryCrops = computed(() => cropGroups.value[activeCategory.value]);
const priceDateHint = ref('');

const chartData = reactive<{
  years: number[];
  cropTypes: string[];
  yieldData: { year: number; cropType: string; yield: number; price: number | null }[];
}>({
  years: [],
  cropTypes: [],
  yieldData: []
});

const ensureChart = () => {
  if (chartInstance || !chartRef.value) return;
  chartInstance = echarts.init(chartRef.value);
};

const updateChart = async () => {
  await nextTick();
  ensureChart();
  if (!chartInstance) return;
  // 容器可能刚由隐藏态显示，先按当前尺寸校正一次，避免画布尺寸为 0
  chartInstance.resize();
  // 必须用 notMerge：切换图表类型/大类/数值口径时，
  // 合并式 setOption 会残留上一次的 series 与坐标轴，导致新旧图形叠在一起
  chartInstance.setOption(getChartOption(), true);
  // 图表区改为 flex 拉伸后，容器高度由外层双栏等高决定，
  // init 时可能拿到尚未撑开的初始高度；下一帧再校正一次，
  // 否则画布会停在旧高度，底部留白（ResizeObserver 只在「变化」时触发，
  // 首帧未变化就不会补这一刀）
  requestAnimationFrame(() => chartInstance?.resize());
};

// 各作物的配色：统一取图表分类色板（与全站色板同源，不再在组件内硬编码色值）
const CROP_COLORS = getChartTheme().categorical;

// 按当前数值口径换算序列数据
//   abs   —— 原始产量（万吨）
//   share —— 该作物占同年本类合计的比重（%）
//   index —— 以首个有数据的年份为 100 的定基指数
const buildSeries = (types: string[]) => {
  const { years, yieldData } = chartData;
  const raw = (year: number, type: string): number | null => {
    const it = yieldData.find(d => d.year === year && d.cropType === type);
    return it ? it.yield : null;
  };
  const r1 = (v: number) => Math.round(v * 10) / 10;

  if (valueMode.value === 'share') {
    const yearSum: Record<number, number> = {};
    years.forEach(y => {
      yearSum[y] = types.reduce((s, t) => s + (raw(y, t) ?? 0), 0);
    });
    return types.map(t => ({
      name: t,
      data: years.map(y => {
        const v = raw(y, t);
        return v == null || !yearSum[y] ? null : r1(v / yearSum[y] * 100);
      })
    }));
  }

  if (valueMode.value === 'index') {
    return types.map(t => {
      const first = years.map(y => raw(y, t)).find(v => v != null && v > 0) ?? null;
      return {
        name: t,
        data: years.map(y => {
          const v = raw(y, t);
          return v == null || !first ? null : r1(v / first * 100);
        })
      };
    });
  }

  return types.map(t => ({ name: t, data: years.map(y => raw(y, t)) }));
};

const yAxisName = () =>
  valueMode.value === 'share' ? '占本类产量比重（%）'
    : valueMode.value === 'index' ? '定基指数（首年=100）'
      : '产量（万吨）';

const unitSuffix = () => (valueMode.value === 'share' ? '%' : valueMode.value === 'index' ? '' : ' 万吨');

const getChartOption = () => {
  const { years, yieldData } = chartData;
  const types = Array.from(new Set(yieldData.map(d => d.cropType)));
  const series = buildSeries(types);
  // 系列较多时给图例留更多空间，并允许滚动
  const gridBottom = types.length > 3 ? 72 : 55;
  const ct = getChartTheme();
  const commonAxisLabel = { color: ct.axisLabel };

  switch (chartType.value) {
    case 'line':
      return {
        title: { text: '作物产量趋势', left: 'center' },
        tooltip: {
          trigger: 'axis',
          valueFormatter: (v: any) => (v == null ? '-' : `${v}${unitSuffix()}`)
        },
        legend: { data: types, type: 'scroll', bottom: 8 },
        grid: { left: 60, right: 25, top: 45, bottom: gridBottom },
        xAxis: { type: 'category', data: years, axisLabel: commonAxisLabel },
        yAxis: {
          type: 'value',
          name: yAxisName(),
          scale: valueMode.value === 'abs', // 绝对值口径下纵轴按数据范围自适应，小作物也能看出趋势
          axisLabel: commonAxisLabel,
          splitLine: { lineStyle: { color: ct.axisLine } }
        },
        series: series.map((s, i) => ({
          name: s.name,
          type: 'line',
          data: s.data,
          smooth: true,
          symbolSize: 7,
          lineStyle: { width: 3, color: CROP_COLORS[i % CROP_COLORS.length] },
          itemStyle: { color: CROP_COLORS[i % CROP_COLORS.length] },
          connectNulls: true
        }))
      };

    case 'bar':
      return {
        title: { text: '作物产量对比', left: 'center' },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          valueFormatter: (v: any) => (v == null ? '-' : `${v}${unitSuffix()}`)
        },
        legend: { data: types, type: 'scroll', bottom: 8 },
        grid: { left: 60, right: 25, top: 45, bottom: gridBottom },
        xAxis: { type: 'category', data: years, axisLabel: commonAxisLabel },
        yAxis: {
          type: 'value',
          name: yAxisName(),
          scale: valueMode.value === 'abs',
          axisLabel: commonAxisLabel,
          splitLine: { lineStyle: { color: ct.axisLine } }
        },
        series: series.map((s, i) => ({
          name: s.name,
          type: 'bar',
          barGap: '10%',
          itemStyle: { color: CROP_COLORS[i % CROP_COLORS.length], borderRadius: [3, 3, 0, 0] },
          data: s.data
        }))
      };

    case 'pie': {
      // 饼图始终按绝对值口径展示占比，避免与占比/指数口径重复换算
      const latestYear = years[years.length - 1];
      const pieData = types.map(t => {
        const item = yieldData.find(d => d.year === latestYear && d.cropType === t);
        return { name: t, value: item ? item.yield : 0 };
      });
      const suffix = valueMode.value === 'abs' ? '' : '（绝对值口径）';
      return {
        title: { text: `${latestYear} 年作物产量占比${suffix}`, left: 'center' },
        tooltip: { trigger: 'item', formatter: '{b}: {c} 万吨（{d}%）' },
        legend: { orient: 'vertical', left: 'left', type: 'scroll', data: pieData.map(d => d.name) },
        color: CROP_COLORS,
        series: [{
          name: '产量',
          type: 'pie',
          radius: ['35%', '65%'],
          center: ['55%', '55%'],
          data: pieData,
          emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.3)' } },
          label: { formatter: '{b}\n{c} 万吨' }
        }]
      };
    }

    case 'scatter': {
      // 年份是离散整数，此前误用 min:'dataMax' 会把所有点压到同一条竖线上
      const yMin = years.length ? Math.min(...years) - 0.5 : undefined;
      const yMax = years.length ? Math.max(...years) + 0.5 : undefined;
      return {
        title: { text: '作物产量分布', left: 'center' },
        tooltip: {
          trigger: 'item',
          formatter: (p: any) => `${p.value[2]}<br/>年份: ${p.value[0]}<br/>${yAxisName()}: ${p.value[1]}${unitSuffix()}`
        },
        legend: { data: types, type: 'scroll', bottom: 8 },
        grid: { left: 60, right: 25, top: 45, bottom: gridBottom },
        xAxis: {
          type: 'value',
          name: '年份',
          min: yMin,
          max: yMax,
          interval: 1,
          axisLabel: { ...commonAxisLabel, formatter: (v: number) => String(Math.round(v)) }
        },
        yAxis: {
          type: 'value',
          name: yAxisName(),
          scale: valueMode.value === 'abs',
          axisLabel: commonAxisLabel,
          splitLine: { lineStyle: { color: ct.axisLine } }
        },
        series: series.map((s, i) => ({
          name: s.name,
          type: 'scatter',
          symbolSize: 12,
          itemStyle: { color: CROP_COLORS[i % CROP_COLORS.length] },
          data: s.data.map((v, idx) => [years[idx], v, s.name])
        }))
      };
    }

    default:
      return {};
  }
};

// 切换大类时清空单品种筛选，重新加载
const handleCategoryChange = () => {
  selectedCrop.value = '';
  loadChartData();
};

const loadChartData = async () => {
  loading.value = true;
  loadError.value = false;
  try {
    const res: any = await axiosInstance.get('/crop/chart', {
      params: {
        region: selectedRegion.value || undefined,
        category: activeCategory.value,
        cropType: selectedCrop.value || undefined
      }
    });
    const d = res.data || {};
    chartData.years = d.years || [];
    chartData.cropTypes = d.cropTypes || [];
    chartData.yieldData = d.yieldData || [];
    const categoryLabelMap: Record<CropCategory, string> = {
      grain: '基本粮食作物', cash: '经济作物', vegetable: '蔬菜', fruit: '水果', total: '粮食合计'
    };
    priceDateHint.value = `${chartData.years.length ? chartData.years[0] + '—' + chartData.years[chartData.years.length - 1] : ''} 年 · ${categoryLabelMap[activeCategory.value]} · ${selectedRegion.value || '全部地区'}`;
    await updateChart();
  } catch {
    loadError.value = true;
    chartData.yieldData = [];
  } finally {
    loading.value = false;
  }
};

// 地区与作物选项从后端动态拉取，避免硬编码与数据脱节
const loadOptions = async () => {
  try {
    const [regionRes, cropRes]: any[] = await Promise.all([
      axiosInstance.get('/crop/regions'),
      axiosInstance.get('/crop/types')
    ]);
    regions.value = regionRes.data || [];
    const g = cropRes.data || {};
    cropGroups.value = {
      total: g.total || [],
      grain: g.grain || [],
      cash: g.cash || [],
      vegetable: g.vegetable || [],
      fruit: g.fruit || []
    };
  } catch {
    /* 选项加载失败时保持空列表，图表仍可查看全部数据 */
  }
};

onMounted(async () => {
  // ResizeObserver 自适应 + 卸载自动 dispose（替代 window.resize 监听）
  // 注意：chartRef 初始可能为 null（v-if 在数据就绪前不渲染），useChartResize 内部已做空值保护
  useChartResize(() => chartInstance, chartRef);
  await loadOptions();
  await loadChartData();

  /**
   * 图表区改为 flex 拉伸后，画布高度取决于外层双栏的等高结果，
   * 而这个高度在首帧尚未确定：echarts.init 拿到的是「未撑开」的初始高度，
   * 之后 ResizeObserver 只在尺寸「发生变化」时触发 resize——
   * 若首次校正后尺寸恰好没再变，画布就永远停在旧高度（底部大片留白）。
   *
   * 这里连续三帧各校正一次，覆盖 grid 等高 → flex 传导 → 画布重排这条链路。
   */
  let tries = 0;
  const settle = () => {
    if (tries++ >= 3) return;
    requestAnimationFrame(() => {
      chartInstance?.resize();
      settle();
    });
  };
  settle();
});
</script>

<style scoped>
/* 高度改为自适应：外层容器不再写死高度，
   控件行（5 个大类按钮 + 4 个下拉）会随宽度换行，固定高度会把图区挤出容器。
   flex:1 + min-height:0 让本组件在被父级拉高时把剩余空间传给图表区 */
.crop-chart {
  width: 100%;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.chart-header {
  display: flex;
  gap: 10px 12px;
  margin-bottom: 16px;
  align-items: center;
  flex-wrap: wrap;
}

.category-radio {
  flex-shrink: 0;
  flex-wrap: wrap;
}

.chart-type-select {
  width: 110px;
  max-width: 100%;
}

.region-select {
  width: 150px;
  max-width: 100%;
}

.crop-select {
  width: 130px;
  max-width: 100%;
}

.value-mode-select {
  width: 150px;
  max-width: 100%;
}

.data-hint {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  margin-left: auto;
}

@media (max-width: 768px) {
  .chart-type-select,
  .region-select,
  .crop-select,
  .value-mode-select {
    width: 100%;
  }

  .data-hint {
    margin-left: 0;
  }
}

/* 图表画布区：吃掉父级剩余高度。
   此前写死 height: var(--chart-h-crop)，当外层卡片被 grid 拉高后，
   canvas 不跟着长，底部会留出一大片空白（图表「填不满容器」的直接原因）。
   改为 flex:1 + min-height 下限，既能拉伸又不会被压扁。 */
.chart-body {
  position: relative;
  flex: 1;
  min-height: var(--chart-h-crop);
  display: flex;
  flex-direction: column;
}

.chart-container {
  width: 100%;
  flex: 1;
  min-height: var(--chart-h-crop);
}

/* 图表区错误态 / 空态：同一块高度，语义分开
   （错误 = 警示色 + 可重试；空 = 中性灰 + 引导调整筛选） */
.chart-error,
.chart-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-size: var(--fs-sm);
  flex: 1;
  min-height: var(--chart-h-crop);
}

.chart-error {
  color: var(--danger-color);
}

.chart-empty {
  color: var(--text-secondary);
}

.data-note {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  line-height: 1.7;
  margin-top: 4px;
}

.data-note b {
  color: var(--text-regular);
  font-weight: var(--fw-semibold);
}
</style>
