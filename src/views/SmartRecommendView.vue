<template>
  <PageShell :embedded="embedded" :loading="loading">
    <PageHeader
      title="智能荐种"
      subtitle="按产区、价格、气象与农时四因子，为目标地区动态推荐适合的作物"
      :crumbs="[
        { label: '首页', to: '/home' },
        { label: '气象生产', to: '/production/overview' },
        { label: '智能荐种' }
      ]"
    />

    <!-- 说明与筛选 -->
    <el-card class="sr-card">
          <template #header>
            <div class="card-header">
              <h2 class="card-title">AI 动态品种推荐</h2>
              <span class="header-sub">四因子加权 · 推荐指数因时因地而变</span>
            </div>
          </template>

          <p class="sr-intro">
            推荐指数 = <b>产区基础分 30%</b> + <b>价格趋势 30%</b> + <b>气象风险 30%</b> + <b>农时窗口 10%</b>。
            价格趋势来自 7 日价格预测模型，气象风险来自 15 天预报适配度，农时窗口来自播种/移栽期匹配；
            任一因子数据缺失时自动剔除该因子并重新归一权重，<b>不编造数据</b>。
          </p>

          <div class="sr-controls">
            <el-select v-model="province" class="sr-select" size="default" placeholder="选择省份" @change="onProvinceChange">
              <el-option v-for="p in provinces" :key="p" :label="p" :value="p" />
            </el-select>
            <el-select v-model="city" class="sr-select" size="default" filterable placeholder="选择城市">
              <el-option v-for="c in cities" :key="c.name" :label="c.name" :value="c.name" />
            </el-select>
            <el-select v-model="category" class="sr-select" size="default" placeholder="全部类别" clearable>
              <el-option label="基本粮食作物" value="基本粮食作物" />
              <el-option label="经济作物" value="经济作物" />
              <el-option label="特色作物" value="特色作物" />
            </el-select>
            <el-button type="primary" :loading="loading" @click="generate">
              {{ hasPersisted ? '重新生成' : '生成 AI 推荐' }}
            </el-button>
            <el-tag v-if="hasPersisted" type="info" size="default" class="sr-persist-tag">
              已留存 · 生成于 {{ persistTime }}
            </el-tag>
          </div>
          <p class="sr-hint">
            推荐理由由大模型基于上方因子数据生成（数字经一致性核对）；未接入大模型时自动使用规则模板文案，界面会标注来源。
            <b>首次生成后结果将留存</b>：切换到其他页面再返回仍在此展示，直到你点击「重新生成」。
          </p>
        </el-card>

        <!-- 天气不可用提示 -->
        <el-alert
          v-if="result && !result.weatherAvailable"
          :title="result.weatherNotice || '天气数据暂不可用'"
          type="warning"
          show-icon
          :closable="false"
          class="sr-alert"
        />

        <!-- 结果区 -->
        <template v-if="result && result.items.length">
          <!-- 因子分解图 -->
          <el-card class="sr-card">
            <template #header>
              <div class="card-header">
                <h2 class="card-title">推荐指数因子分解（前 {{ Math.min(8, result.items.length) }} 名）</h2>
                <span class="header-sub">堆叠高度 = 因子得分 × 权重，满分 100</span>
              </div>
            </template>
            <div ref="chartRef" class="sr-chart"></div>
          </el-card>

          <!-- 推荐卡片 -->
          <div class="sr-grid">
            <el-card v-for="(item, idx) in result.items" :key="item.cropType + idx" class="sr-item" :class="{ top: idx === 0 }">
              <div class="sr-item-head">
                <span class="sr-rank" :class="{ gold: idx === 0 }">{{ idx + 1 }}</span>
                <div class="sr-item-title">
                  <span class="sr-crop">{{ item.cropType }}</span>
                  <el-tag size="small" type="info">{{ item.category }}</el-tag>
                </div>
                <div class="sr-index">
                  <span class="sr-index-value">{{ item.dynamicIndex ?? '—' }}</span>
                  <span class="sr-index-label">AI 推荐指数</span>
                </div>
              </div>

              <div class="sr-factors">
                <el-tooltip v-for="f in factorList(item)" :key="f.key" :content="f.detail" placement="top" :show-after="300">
                  <span class="sr-factor" :class="{ off: f.score === null }">
                    <i class="dot" :style="{ background: f.color }"></i>
                    {{ f.label }}
                    <b>{{ f.score === null ? '缺失' : f.score }}</b>
                  </span>
                </el-tooltip>
              </div>

              <div class="sr-reason">
                <div class="sr-reason-head">
                  <el-tag size="small" :type="item.reasonSource === 'llm' ? 'success' : 'info'">
                    {{ item.reasonSource === 'llm' ? '大模型生成' : '规则模板' }}
                  </el-tag>
                  <el-tooltip
                    v-if="item.reasonAudit && !item.reasonAudit.passed"
                    :content="`以下数字未在实况数据中找到：${item.reasonAudit.unverified.join('、')}`"
                    placement="top"
                  >
                    <el-tag size="small" type="warning">数字待核对</el-tag>
                  </el-tooltip>
                </div>
                <p>{{ item.aiReason }}</p>
              </div>

              <div class="sr-item-foot">
                <el-button size="small" type="primary" plain @click="openAdopt(item)">采纳并记录收益</el-button>
              </div>
            </el-card>
          </div>

          <p class="sr-disclaimer">{{ result.disclaimer }}</p>
        </template>

        <el-empty v-else-if="!loading && generated" description="该地区暂无推荐数据，换个地区或类别试试" />

    <!-- 采纳收益登记（BenefitRecordDialog：三处收益入口共用同一组件） -->
    <BenefitRecordDialog
      v-model:visible="adoptVisible"
      title="采纳推荐并记录预估收益"
      :summary="`作物：<b>${adoptItem?.cropType}</b>（${adoptItem?.category}）`"
      amount-label="预估增收/节本金额（元）"
      basis-label="估算依据（可修改，将留档可追溯）"
      :default-amount="1000"
      :default-basis="adoptItem?.aiReason || ''"
      :max="1000000"
      :step="100"
      :rows="4"
      note="金额为平台按公开口径的<b>估算值</b>，非实际到账收入；登记后可在「我的关注」查看累计收益。"
      :submitting="adopting"
      @submit="submitAdopt"
    />
  </PageShell>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import axiosInstance from '../utils/axios';
import PageShell from '../components/PageShell.vue';
import PageHeader from '../components/PageHeader.vue';
import BenefitRecordDialog from '../components/BenefitRecordDialog.vue';
import { useCityOptions } from '../composables/useCityOptions';
import { useAuthGuard } from '../composables/useAuthGuard';
import { formatDateTime } from '../utils/formatTime';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsType } from 'echarts/core';
import { useChartResize } from '../composables/useChartResize';
import { getChartTheme, type ChartTheme } from '../composables/useChartTheme';

// 嵌入模式：作为「生产决策」页的子标签页时为 true，此时不渲染页头（由父级统一提供）
const props = defineProps<{ embedded?: boolean }>();
const embedded = computed(() => !!props.embedded);

const guard = useAuthGuard();
const { provinces, cities, loadCities, hasCity } = useCityOptions();

// 按需引入（与 CropChart 同一模式）：仅注册本页用到的图表与组件
echarts.use([BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

interface Factor { key: string; label: string; color: string; score: number | null; detail: string }
interface RecommendItem {
  cropType: string;
  category: string;
  baseIndex: number;
  dynamicIndex: number | null;
  aiReason: string;
  reasonSource: 'llm' | 'template';
  reasonAudit?: { checked: number; unverified: string[]; passed: boolean } | null;
  factors: Record<string, { score: number | null; available: boolean; detail: string }>;
}
interface RecommendResult {
  region: string;
  weatherAvailable: boolean;
  weatherNotice: string | null;
  items: RecommendItem[];
  disclaimer: string;
}

const FACTOR_META: { key: string; label: string; color: string; weight: number }[] = [
  { key: 'base', label: '产区基础', color: 'var(--chart-series-primary)', weight: 0.30 },
  { key: 'price', label: '价格趋势', color: 'var(--chart-series-accent)', weight: 0.30 },
  { key: 'weather', label: '气象风险', color: 'var(--chart-series-green)', weight: 0.30 },
  { key: 'solar', label: '农时窗口', color: 'var(--chart-series-amber)', weight: 0.10 }
];

// 因子 key → 图表主题字段（ECharts 渲染到 canvas，取 getChartTheme 快照而非 CSS 变量）
const factorChartColor = (key: string, ct: ChartTheme): string => {
  if (key === 'base') return ct.seriesPrimary;
  if (key === 'price') return ct.seriesAccent;
  if (key === 'weather') return ct.seriesGreen;
  return ct.seriesAmber;
};

const province = ref('河北省');
const city = ref('石家庄');
const category = ref('');
const loading = ref(false);
const generated = ref(false);
const result = ref<RecommendResult | null>(null);
// 已留存状态：切页再返回时展示「已留存 · 生成于 …」，按钮变为「重新生成」
const hasPersisted = ref(false);
const persistTime = ref('');

const chartRef = ref<HTMLElement | null>(null);
let chartInstance: EChartsType | null = null;
useChartResize(() => chartInstance, chartRef);

const factorList = (item: RecommendItem): Factor[] =>
  FACTOR_META.map(m => {
    const f = item.factors[m.key];
    return {
      key: m.key,
      label: m.label,
      color: m.color,
      score: f ? f.score : null,
      detail: f ? f.detail : ''
    };
  });

const fetchCities = async () => {
  await loadCities(province.value);
  if (cities.value.length && !hasCity(city.value)) {
    const first = cities.value[0];
    if (first) city.value = first.name;
  }
};

const onProvinceChange = () => {
  city.value = '';
  result.value = null;
  hasPersisted.value = false;
  fetchCities();
};

// 挂载/切换地区后读取已留存结果（只读，不调大模型）
const loadPersisted = async () => {
  if (!city.value) return;
  try {
    const res: any = await axiosInstance.get('/recommend/dynamic', {
      params: { region: city.value, category: category.value || undefined }
    });
    if (res.data?.found) {
      result.value = res.data.payload;
      hasPersisted.value = true;
      persistTime.value = formatDateTime(res.data.generatedAt);
      generated.value = true;
      await nextTick();
      renderChart();
    } else {
      result.value = null;
      hasPersisted.value = false;
      generated.value = false;
    }
  } catch {
    /* 读取失败静默：用户可点按钮主动生成 */
  }
};

// 用户主动触发：首次生成或重新生成（服务端持久化覆盖）
const generate = async () => {
  if (!city.value) {
    ElMessage.warning('请先选择城市');
    return;
  }
  loading.value = true;
  generated.value = false;
  try {
    // 推荐理由调用大模型，推理型模型可能耗时数十秒，单独放宽超时
    const res: any = await axiosInstance.post(
      '/recommend/dynamic/refresh',
      { region: city.value, category: category.value || undefined },
      { timeout: 200000 }
    );
    if (res.data?.found) {
      result.value = res.data.payload;
      hasPersisted.value = true;
      persistTime.value = formatDateTime(res.data.generatedAt);
      generated.value = true;
      ElMessage.success('推荐已生成并留存，切页再返回仍会展示');
      await nextTick();
      renderChart();
    }
  } catch {
    result.value = null;
    hasPersisted.value = false;
  } finally {
    loading.value = false;
  }
};

const renderChart = () => {
  if (!chartRef.value || !result.value) return;
  if (!chartInstance) chartInstance = echarts.init(chartRef.value);
  chartInstance.resize();

  const top = result.value.items.slice(0, 8);
  const names = top.map(i => i.cropType).reverse();
  const ct = getChartTheme();
  const series = FACTOR_META.map(m => ({
    name: m.label,
    type: 'bar' as const,
    stack: 'total',
    barMaxWidth: 22,
    // canvas 不解析 CSS 变量：图表内因子色经图表主题快照取（与模板内 var() 同一令牌）
    itemStyle: { color: factorChartColor(m.key, ct) },
    data: top.map(i => {
      const f = i.factors[m.key];
      const score = f && f.score !== null ? f.score : 0;
      return Number((score * m.weight).toFixed(1));
    }).reverse()
  }));

  chartInstance.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (v: any) => (v == null ? '-' : `${v} 分`)
    },
    legend: { data: FACTOR_META.map(m => m.label), bottom: 0, textStyle: { color: ct.axisLabel } },
    grid: { left: 10, right: 30, top: 20, bottom: 40, containLabel: true },
    xAxis: {
      type: 'value',
      max: 100,
      axisLabel: { color: ct.axisLabel },
      splitLine: { lineStyle: { color: ct.axisLine } }
    },
    yAxis: { type: 'category', data: names, axisLabel: { color: ct.axisLabel } },
    series
  }, true);
};

// ---- 采纳并记录收益 ----
const adopting = ref(false);
const adoptItem = ref<RecommendItem | null>(null);
const adoptVisible = ref(false);

const openAdopt = (item: RecommendItem) => {
  adoptItem.value = item;
  adoptVisible.value = true;
};

const submitAdopt = async (amount: number, basis: string) => {
  if (!adoptItem.value) return;
  if (!basis) {
    ElMessage.warning('估算依据不能为空（收益必须可追溯）');
    return;
  }
  adopting.value = true;
  try {
    await axiosInstance.post('/benefit/record', {
      module: 'recommend',
      item: adoptItem.value.cropType,
      amountYuan: amount,
      basis
    });
    ElMessage.success('已登记到「AI 助农收益台账」');
    adoptVisible.value = false;
  } catch {
    /* 拦截器已提示错误 */
  } finally {
    adopting.value = false;
  }
};

onMounted(async () => {
  if (!guard()) return;
  await fetchCities();
  await loadPersisted();
});
</script>

<style scoped>
.sr-card {
  margin-bottom: var(--space-block);
}

.sr-intro {
  font-size: var(--fs-sm);
  color: var(--text-regular);
  line-height: 1.8;
  margin: 0 0 16px;
}

.sr-controls {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
}

.sr-select {
  width: 180px;
}

.sr-hint {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  margin: 12px 0 0;
  line-height: 1.7;
}

.sr-persist-tag {
  height: 32px;
  line-height: 30px;
}

.sr-alert {
  margin-bottom: var(--space-5);
}

.sr-chart {
  width: 100%;
  min-height: 320px;
}

.sr-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: var(--space-4);
  margin-bottom: var(--space-block);
}

.sr-item.top {
  border-color: var(--brand-blue);
}

.sr-item-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sr-rank {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--border-color);
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: var(--fw-semibold);
  flex-shrink: 0;
}

.sr-rank.gold {
  background: var(--brand-blue);
  color: #fff;
}

.sr-item-title {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.sr-crop {
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
  color: var(--text-primary);
}

.sr-index {
  text-align: right;
  flex-shrink: 0;
}

.sr-index-value {
  display: block;
  font-size: var(--fs-3xl);
  font-weight: var(--fw-semibold);
  color: var(--brand-blue);
  line-height: 1.1;
}

.sr-index-label {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
}

.sr-factors {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 14px 0;
}

.sr-factor {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-xs);
  color: var(--text-regular);
  background: var(--background-color);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 4px 10px;
  cursor: default;
}

.sr-factor.off {
  color: var(--text-secondary);
  text-decoration: line-through;
}

.sr-factor .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.sr-reason {
  border-top: 1px dashed var(--border-color);
  padding-top: 12px;
}

.sr-reason-head {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.sr-reason p {
  font-size: var(--fs-sm);
  color: var(--text-regular);
  line-height: 1.7;
  margin: 0;
}

.sr-item-foot {
  margin-top: 12px;
  text-align: right;
}

.sr-disclaimer {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  text-align: center;
}

@media (max-width: 768px) {
  .sr-select {
    width: 100%;
  }

  .sr-grid {
    grid-template-columns: 1fr;
  }
}
</style>
