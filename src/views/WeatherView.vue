<template>
  <PageShell :embedded="embedded">
      <!-- 品牌横幅：与全站横幅同骨架，主题切换为气象；嵌入模式省略 -->
      <section v-if="!embedded" class="page-hero weather-hero" aria-label="气象服务简介">
        <div class="page-hero-body">
          <p class="page-hero-kicker">逐日气象 · 风险预警 · 农事提醒</p>
          <h1 class="page-hero-title">读懂天时，安排好每一季农事</h1>
          <p class="page-hero-sub">覆盖全国 32 个省级行政区的七日预报，结合作物生育期自动生成浇水、防灾与采收建议</p>
          <div v-if="today" class="page-hero-meta">
            <span class="page-hero-chip">{{ selectedCity }} · {{ today.textDay }}</span>
            <span class="page-hero-chip">{{ today.tempMax }}° / {{ today.tempMin }}°</span>
            <span v-if="adviceList.length" class="page-hero-chip has">{{ adviceList.length }} 条农事提醒</span>
            <span v-else class="page-hero-chip">天气平稳</span>
          </div>
          <div class="page-hero-actions">
            <el-button type="primary" size="large" @click="scrollTo('weather-forecast')">查看七日预报</el-button>
            <el-button size="large" class="page-hero-ghost" @click="scrollTo('weather-advice')">农事提醒</el-button>
          </div>
        </div>
      </section>

      <!-- 今日天气（主模块：选择地区内嵌于此卡，顶部品牌渐变条强调） -->
      <el-card id="weather-today" class="weather-card today-card card-primary">
        <template #header>
          <div class="card-header">
            <h2 class="card-title">今日天气</h2>
            <span v-if="updateTime" class="summary-text">
              数据更新于 {{ updateTime }}
              <span v-if="cacheAgeMinutes > 0" class="cache-tag">· 缓存 {{ cacheAgeMinutes }} 分钟前</span>
            </span>
          </div>
        </template>
        <!-- 选择地区：按最初版式内嵌于今日天气卡，省 -> 市两级覆盖全国 32 个省级行政区 -->
        <div class="selector-row">
          <span class="selector-label">选择地区</span>
          <el-select
            v-model="selectedProvince"
            class="province-select"
            size="small"
            :loading="cityLoading"
            aria-label="选择省份"
            @change="handleProvinceChange"
          >
            <el-option v-for="p in provinces" :key="p" :label="p" :value="p" />
          </el-select>
          <el-select
            v-model="selectedCity"
            placeholder="请选择城市"
            class="city-select"
            size="small"
            :loading="cityLoading"
            aria-label="选择城市"
            @change="handleCityChange"
          >
            <el-option
              v-for="city in cities"
              :key="city.code"
              :label="city.name"
              :value="city.name"
            />
          </el-select>
          <el-button type="primary" size="small" :icon="Refresh" :loading="loading" @click="fetchWeather">
            刷新
          </el-button>
          <el-tag v-if="stale" type="warning" size="small" class="stale-tag">上游异常，展示缓存数据</el-tag>
        </div>
        <!-- 错误态：加载失败时明确提示并可重试 -->
        <div v-if="weatherError" class="state-error" role="alert">
          <el-icon><WarningFilled /></el-icon>
          <span>天气数据加载失败，请稍后重试</span>
          <el-button size="small" type="primary" :loading="loading" @click="fetchWeather">重试</el-button>
        </div>
        <div v-else class="today-body">
          <template v-if="today">
            <div class="today-left">
              <div class="today-city">{{ selectedCity }}</div>
              <div class="today-date">{{ formatDate(today.fxDate) }}</div>
              <div class="today-temp">
                <span class="temp-max">{{ today.tempMax }}°</span>
                <span class="temp-sep">/</span>
                <span class="temp-min">{{ today.tempMin }}°</span>
              </div>
              <div class="today-text">{{ today.textDay }}</div>
            </div>
            <div class="today-right">
              <!-- 8 项指标：色相与图标统一在 METRIC_META 定义，模板只负责渲染 -->
              <div
                v-for="m in todayMetrics"
                :key="m.key"
                class="metric"
                :class="`metric--${m.tone}`"
              >
                <span class="metric-label">
                  <el-icon class="metric-icon" aria-hidden="true"><component :is="m.icon" /></el-icon>
                  {{ m.label }}
                </span>
                <span class="metric-value">{{ m.value }}</span>
              </div>
            </div>
          </template>
          <!-- 首屏加载骨架：与今日卡同构，替代空白等待 -->
          <template v-else>
            <div class="today-left sk-panel">
              <div class="sk-line" style="width: 52%"></div>
              <div class="sk-line sk-price" style="width: 78%"></div>
              <div class="sk-line" style="width: 40%; margin-top: 10px"></div>
            </div>
            <div class="today-right">
              <div v-for="n in 8" :key="'skm' + n" class="metric">
                <div class="sk-line" style="width: 46%"></div>
                <div class="sk-line" style="width: 72%; height: 16px"></div>
              </div>
            </div>
          </template>
        </div>
      </el-card>
      <!-- 农事提醒：把天气翻译成动作建议 -->
      <el-card id="weather-advice" class="weather-card advice-card">
        <template #header>
          <div class="card-header">
            <h2 class="card-title">农事提醒</h2>
            <el-button size="small" :loading="adviceLoading" @click="fetchAdvice">重新生成</el-button>
          </div>
        </template>
        <div class="card-cover advice-cover" style="background-image: url('/images/weather-advice.jpg')" aria-hidden="true"></div>
        <div class="advice-body">
          <!-- 首次加载：骨架行；刷新中：内容区转圈，避免布局跳动 -->
          <div v-if="adviceLoading && !adviceList.length && !adviceNotice" class="advice-skeleton" aria-busy="true">
            <div v-for="n in 3" :key="'ska' + n" class="sk-advice-row">
              <div class="sk-line" style="width: 30%"></div>
              <div class="sk-line" style="width: 88%; margin-top: 10px"></div>
              <div class="sk-line" style="width: 60%; margin-top: 10px"></div>
            </div>
          </div>
          <div v-else v-loading="adviceLoading" class="advice-content">
          <div v-if="adviceNotice" class="advice-notice">
            <el-icon><InfoFilled /></el-icon>
            <span>{{ adviceNotice }}</span>
          </div>
          <template v-else>
            <div v-if="!adviceList.length" class="advice-empty">
              <el-icon><CircleCheckFilled /></el-icon>
              <span>未来 3 天天气平稳，未触发农事风险规则。</span>
            </div>
            <div v-for="a in adviceList" :key="a.ruleId" class="advice-item" :class="'sev' + a.severity">
              <div class="advice-head">
                <el-tag size="small" :type="riskTag(a.riskType)">{{ a.riskLabel }}</el-tag>
                <span class="advice-product">{{ a.productName }}</span>
                <span class="advice-stage">{{ a.growthStage }}</span>
                <span class="advice-trigger">{{ a.triggerDetail }}</span>
              </div>
              <div class="advice-text">{{ a.adviceText }}</div>
            </div>
            <div v-if="weatherSummary" class="advice-summary">
              基于未来 {{ weatherSummary.days }} 天预报：最高 {{ weatherSummary.tempMax }}℃ / 最低 {{ weatherSummary.tempMin }}℃ / 累计降水 {{ weatherSummary.totalPrecip }}mm
            </div>
            <div v-if="adviceDisclaimer" class="advice-disclaimer">{{ adviceDisclaimer }}</div>
          </template>
        </div>
        </div>
      </el-card>

      <!-- AI 农事顾问（增强层：大模型 + 规则引擎保底） -->
      <AiAdvisor :city="selectedCity" />

      <!-- 七日预报列表：先给结论（逐日预报），趋势图作为下方佐证 -->
      <el-card id="weather-forecast" class="weather-card">
        <template #header>
          <div class="card-header">
            <h2 class="card-title">七日天气预报</h2>
          </div>
        </template>
        <div class="card-cover forecast-cover" style="background-image: url('/images/weather-7day.jpg')" aria-hidden="true"></div>
        <div v-if="daily.length" v-loading="loading" class="forecast-list">
          <div
            v-for="day in daily"
            :key="day.fxDate"
            class="forecast-item"
            :class="{ 'is-today': day.fxDate === today?.fxDate }"
          >
            <div class="forecast-date">
              <div class="fw-date">{{ formatDate(day.fxDate) }}</div>
              <div class="fw-week">{{ getWeekday(day.fxDate) }}</div>
            </div>
            <div class="forecast-weather">
              <span class="fw-text"><span class="fw-icon" aria-hidden="true">{{ weatherIcon(day.textDay) }}</span>{{ day.textDay }}</span>
              <span class="fw-night">夜间{{ weatherIcon(day.textNight) }} {{ day.textNight }}</span>
            </div>
            <div class="forecast-temp">
              <span class="fw-max">{{ day.tempMax }}°</span>
              <span class="fw-bar">
                <span
                  class="fw-bar-inner"
                  :style="barStyle(day)"
                ></span>
              </span>
              <span class="fw-min">{{ day.tempMin }}°</span>
            </div>
            <div class="forecast-wind">
              {{ day.windDirDay }} {{ day.windScaleDay }}级
            </div>
            <div class="forecast-precip">
              <el-icon><Umbrella /></el-icon>
              {{ day.precip }}mm
            </div>
          </div>
        </div>
        <!-- 首屏加载骨架：与预报行同构 -->
        <div v-else-if="loading && !weatherError" class="forecast-list" aria-busy="true">
          <div v-for="n in 7" :key="'skf' + n" class="forecast-item skeleton-row">
            <div class="sk-line" style="width: 64px"></div>
            <div class="sk-line" style="width: 30%"></div>
            <div class="sk-line" style="width: 40%"></div>
            <div class="sk-line" style="width: 22%"></div>
          </div>
        </div>
        <el-empty v-else-if="!loading && !cityLoading && !weatherError" description="暂无天气预报数据" />
      </el-card>

      <!-- 温度趋势图：作为上方逐日预报的曲线佐证 -->
      <el-card id="weather-chart" class="weather-card">
        <template #header>
          <div class="card-header">
            <h2 class="card-title">未来七日气温趋势</h2>
            <span class="header-sub">与上方预报同源</span>
          </div>
        </template>
        <div v-loading="loading" ref="chartRef" class="chart-container"></div>
      </el-card>
  </PageShell>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import {
  CircleCheckFilled,
  Pouring,
  InfoFilled,
  MoonNight,
  Refresh,
  Sunny,
  Sunset,
  Sunrise,
  Umbrella,
  View,
  WarningFilled,
  WindPower
} from '@element-plus/icons-vue';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsType } from 'echarts/core';

// 嵌入模式：作为「生产决策」页的子标签页时为 true，此时不渲染页头与横幅（由父级统一提供）
const props = defineProps<{ embedded?: boolean }>();
const embedded = computed(() => !!props.embedded);

// 按需引入图表组件（替代全量 import * as echarts）
echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);
import { ElMessage } from 'element-plus';
import axiosInstance from '../utils/axios';
import PageShell from '../components/PageShell.vue';
import AiAdvisor from '../components/AiAdvisor.vue';
import { useChartResize } from '../composables/useChartResize';
import { useCityOptions } from '../composables/useCityOptions';
import { useAuthGuard } from '../composables/useAuthGuard';
import { getChartTheme } from '../composables/useChartTheme';

const route = useRoute();
const guard = useAuthGuard();

interface DayWeather {
  fxDate: string;
  textDay: string;
  textNight: string;
  tempMax: number;
  tempMin: number;
  windDirDay: string;
  windScaleDay: string;
  windDirNight: string;
  windScaleNight: string;
  precip: number;
  humidity: number;
  uvIndex: string;
  vis: string;
  sunrise: string;
  sunset: string;
}

const { provinces, cities, loading: cityLoading, loadCities, hasCity } = useCityOptions({
  onError: () => ElMessage.error('城市列表加载失败')
});
const selectedProvince = ref('河北省');
const selectedCity = ref('石家庄');
const daily = ref<DayWeather[]>([]);
const updateTime = ref('');
// 服务端缓存状态：cacheAgeMinutes 为距上次上游更新的分钟数，stale 为上游异常时的过期缓存标记
const cacheAgeMinutes = ref(0);
const stale = ref(false);
const loading = ref(false);
const chartRef = ref<HTMLElement | null>(null);
let chartInstance: EChartsType | null = null;

const today = ref<DayWeather | null>(null);
// 天气加载失败标记：失败时展示错误态+重试，而非静默隐藏今日卡
const weatherError = ref(false);

// ---------- 今日天气指标卡 ----------
/**
 * 8 项指标的展示元数据：色相（tone）与图标在此集中定义，模板只负责渲染。
 *
 * 色相设计原则（低饱和，与全站钢蓝+农业绿色板同族）：
 *   风  → 青绿系（气流）
 *   雨  → 天蓝系（降水）
 *   湿  → 蓝青系（湿度）
 *   紫外 → 琥珀系（日照强度）
 *   雾  → 中性灰（能见度）
 *   日出 → 暖橙（晨光）
 *   日落 → 紫灰（暮色）
 * 每项一个专属色相，扫读时可靠颜色快速定位指标类型，不依赖逐字阅读。
 */
const METRIC_META = [
  { key: 'windDay', label: '白天风力', tone: 'wind', icon: WindPower },
  { key: 'windNight', label: '夜间风力', tone: 'wind-night', icon: MoonNight },
  { key: 'precip', label: '降水量', tone: 'rain', icon: Umbrella },
  { key: 'humidity', label: '相对湿度', tone: 'humidity', icon: Pouring },
  { key: 'uv', label: '紫外线', tone: 'uv', icon: Sunny },
  { key: 'vis', label: '能见度', tone: 'fog', icon: View },
  { key: 'sunrise', label: '日出', tone: 'sunrise', icon: Sunrise },
  { key: 'sunset', label: '日落', tone: 'sunset', icon: Sunset }
] as const;

const todayMetrics = computed(() => {
  const t = today.value;
  if (!t) return [];
  const values: Record<string, string> = {
    windDay: `${t.windDirDay} ${t.windScaleDay}级`,
    windNight: `${t.windDirNight} ${t.windScaleNight}级`,
    precip: `${t.precip} mm`,
    humidity: `${t.humidity}%`,
    uv: t.uvIndex || '—',
    vis: `${t.vis} km`,
    sunrise: t.sunrise,
    sunset: t.sunset
  };
  return METRIC_META.map(m => ({ ...m, value: values[m.key] ?? '—' }));
});

// ---------- 农事提醒 ----------
interface Advice {
  ruleId: number;
  productName: string;
  category: string;
  growthStage: string;
  riskType: string;
  riskLabel: string;
  severity: number;
  triggerDetail: string;
  adviceText: string;
}

const RISK_TAG: Record<string, string> = {
  frost: 'danger',
  rain: 'primary',
  heat: 'warning',
  wind: 'info'
};
const riskTag = (t: string) => RISK_TAG[t] || 'info';

// hero 按钮：平滑滚动到本页指定区块（reduced-motion 下由全局降级为瞬时）
const scrollTo = (id: string) => {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// 天气现象 → 图标（预报列表装饰，纯视觉不承载信息）
const weatherIcon = (text: string): string => {
  if (/雷/.test(text)) return '⛈️';
  if (/雪/.test(text)) return '❄️';
  if (/雨/.test(text)) return '🌧️';
  if (/雾|霾|沙/.test(text)) return '🌫️';
  if (/阴/.test(text)) return '☁️';
  if (/多云/.test(text)) return '⛅';
  if (/晴/.test(text)) return '☀️';
  return '🌤️';
};

const adviceLoading = ref(false);
const adviceList = ref<Advice[]>([]);
const adviceNotice = ref('');
const adviceDisclaimer = ref('');
const weatherSummary = ref<any>(null);

const fetchAdvice = async () => {
  if (!selectedCity.value) return;
  adviceLoading.value = true;
  try {
    const res: any = await axiosInstance.get('/agro/advice', { params: { city: selectedCity.value } });
    const d = res.data || {};
    adviceList.value = d.advice || [];
    adviceNotice.value = d.notice || '';
    adviceDisclaimer.value = d.disclaimer || '';
    weatherSummary.value = d.weatherSummary || null;
  } catch {
    adviceList.value = [];
    adviceNotice.value = '农事提醒获取失败，请稍后重试。';
  } finally {
    adviceLoading.value = false;
  }
};

const formatDate = (d: string) => {
  const [, m, day] = d.split('-');
  return `${Number(m)}月${Number(day)}日`;
};

const getWeekday = (d: string) => {
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return week[new Date(`${d}T00:00:00`).getDay()];
};

// 温度区间条：按七日整体范围归一化，直观对比每日温差
const barStyle = (day: DayWeather) => {
  if (!daily.value.length) return {};
  const max = Math.max(...daily.value.map(d => d.tempMax));
  const min = Math.min(...daily.value.map(d => d.tempMin));
  const span = max - min || 1;
  const left = ((day.tempMin - min) / span) * 100;
  const width = ((day.tempMax - day.tempMin) / span) * 100;
  return {
    left: `${left}%`,
    width: `${Math.max(width, 4)}%`
  };
};

const fetchCities = (province?: string) => loadCities(province || selectedProvince.value);

// 切换省份：重新拉取该省地级市，并选中第一个，随后刷新天气与农事提醒
const handleProvinceChange = async () => {
  await fetchCities(selectedProvince.value);
  if (!hasCity(selectedCity.value)) {
    selectedCity.value = cities.value[0]?.name || '';
  }
  if (selectedCity.value) {
    fetchWeather();
    fetchAdvice();
  }
};

const initChart = () => {
  if (!chartRef.value) return;
  chartInstance = echarts.init(chartRef.value);
};

const updateChart = () => {
  if (!chartInstance || !daily.value.length) return;

  const ct = getChartTheme();
  const dates = daily.value.map(d => formatDate(d.fxDate));
  const maxTemps = daily.value.map(d => d.tempMax);
  const minTemps = daily.value.map(d => d.tempMin);

  chartInstance.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' }
    },
    legend: {
      data: ['最高气温', '最低气温'],
      top: 0
    },
    grid: {
      left: 50,
      right: 30,
      top: 40,
      bottom: 30
    },
    xAxis: {
      type: 'category',
      data: dates,
      boundaryGap: false,
      axisLine: { lineStyle: { color: ct.axisLabel } },
      axisLabel: { color: ct.axisLabel }
    },
    yAxis: {
      type: 'value',
      name: '温度 (°C)',
      axisLabel: { color: ct.axisLabel },
      splitLine: { lineStyle: { color: ct.axisLine } }
    },
    series: [
      {
        name: '最高气温',
        type: 'line',
        data: maxTemps,
        smooth: true,
        symbolSize: 8,
        lineStyle: { width: 3, color: ct.seriesAccent },
        itemStyle: { color: ct.seriesAccent },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: ct.areaAccentFrom },
            { offset: 1, color: ct.areaAccent }
          ])
        },
        label: { show: true, color: ct.seriesAccent, fontSize: 11 }
      },
      {
        name: '最低气温',
        type: 'line',
        data: minTemps,
        smooth: true,
        symbolSize: 8,
        lineStyle: { width: 3, color: ct.seriesPrimary },
        itemStyle: { color: ct.seriesPrimary },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: ct.areaPrimaryFrom },
            { offset: 1, color: ct.areaPrimary }
          ])
        },
        label: { show: true, color: ct.seriesPrimary, fontSize: 11 }
      }
    ]
    // notMerge：切换城市时避免残留上一次的 series 与坐标轴
  }, true);
};

const fetchWeather = async () => {
  if (!selectedCity.value) {
    ElMessage.warning('请先选择城市');
    return;
  }
  loading.value = true;
  try {
    const res: any = await axiosInstance.get('/weather/forecast', {
      params: { city: selectedCity.value }
    });
    daily.value = res.data?.daily || [];
    updateTime.value = res.data?.updateTime || '';
    // 服务端缓存状态（方案 5.3：3-6 小时缓存，不按用户请求实时透传上游）
    cacheAgeMinutes.value = res.data?.cacheAgeMinutes || 0;
    stale.value = res.data?.stale || false;
    today.value = daily.value[0] || null;
    weatherError.value = false;
    await nextTick();
    updateChart();
  } catch {
    daily.value = [];
    today.value = null;
    weatherError.value = true;
  } finally {
    loading.value = false;
  }
};

const handleCityChange = () => {
  fetchWeather();
  fetchAdvice();
};

onMounted(async () => {
  if (!guard()) return;
  // 支持从市场详情页等位置携带 ?city=xxx 跳转过来：
  // 先反查该城市所属省份，再加载对应省份的城市列表，
  // 否则非河北省的城市（如郑州、北京）会被默认省份的列表过滤掉
  const queryCity = (route.query.city as string) || '';
  if (queryCity) {
    try {
      const res: any = await axiosInstance.get('/weather/locate', { params: { city: queryCity } });
      if (res.data?.province) selectedProvince.value = res.data.province;
    } catch {
      /* 反查失败时保持默认省份 */
    }
  }
  await fetchCities(selectedProvince.value);
  // 城市列表就绪后再取天气，避免默认城市不在列表中
  if (queryCity && cities.value.some(c => c.name === queryCity)) {
    selectedCity.value = queryCity;
  } else if (!cities.value.some(c => c.name === selectedCity.value)) {
    selectedCity.value = cities.value[0]?.name || '石家庄';
  }
  initChart();
  // ResizeObserver 自适应 + 卸载自动 dispose（替代 window.resize 监听）
  useChartResize(() => chartInstance, chartRef);
  await fetchWeather();
  fetchAdvice();
});
</script>

<style scoped>
/* 卡片圆角/阴影/表头分隔线由全局 .el-card 统一提供 */
.weather-card {
  margin-bottom: var(--space-block);
}

/* ---- 品牌横幅：骨架来自全局 .page-hero-* ，此处只换背景图 ---- */
.weather-hero {
  background:
    var(--hero-scrim),
    url('/images/bg-production.jpg') center 62% / cover no-repeat var(--brand-forest-mid);
}

/* .header-tools / .header-sub / .summary-text / .state-error / .empty-tip
   与骨架屏基类均已上提全局 style.css */

/* 骨架面板：不用今日卡的天空背景图，保持纯净骨架 */
.today-left.sk-panel {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 120px;
  background: var(--brand-soft);
  border-radius: var(--radius-lg);
}

.advice-skeleton {
  min-height: 80px;
}

.sk-advice-row {
  background: var(--card-background);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  margin-bottom: var(--space-3);
}

/* 骨架预报行：复用 forecast-item 网格，但无 hover/高亮态 */
.skeleton-row:hover {
  background: none;
}

/* 预报天气图标（装饰性） */
.fw-icon {
  margin-right: 6px;
}

/* ---- 地区选择条：控件排布与全局 .filter-bar 同语义 ---- */
.selector-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
  margin-bottom: var(--space-5);
}

.selector-label {
  font-size: var(--fs-md);
  font-weight: var(--fw-medium);
  color: var(--text-regular);
}

.province-select {
  width: 150px;
  max-width: 100%;
}

.city-select {
  width: 180px;
  max-width: 100%;
}

.summary-text .cache-tag {
  color: var(--down-text);
}

/* 板块配图：农事提醒 / 七日预报封面
   容器与源图同为 5:1（1440x288），aspect-ratio 自适应高度，任何屏宽下完整显示不裁切 */
.card-cover {
  position: relative;
  aspect-ratio: 5 / 1;
  border-radius: var(--radius-lg);
  background-size: cover;
  background-position: center;
  margin-bottom: var(--space-4);
  /* 图片未加载时的占位底色，避免出现空白框 */
  background-color: var(--brand-forest-mid);
}

/* 配图上的深森林绿遮罩：统一压暗降饱和，保留画面细节（不压成纯色块）。
   用 ::after 叠加，不额外占用 DOM。 */
.card-cover::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background: linear-gradient(
    100deg,
    rgba(22, 40, 31, 0.46) 0%,
    rgba(26, 46, 36, 0.24) 52%,
    rgba(31, 58, 46, 0.06) 100%
  );
}

/* 农事提醒配图取景偏上（主体人物在中上部），天气封面偏上（云层在上部） */
.advice-cover {
  background-position: center 42%;
}

.forecast-cover {
  background-position: center 55%;
}

.stale-tag {
  flex-shrink: 0;
}

/* ---- 今日概览：左侧实况面板 + 右侧指标网格 ---- */
.today-body {
  display: flex;
  gap: var(--space-6);
  align-items: stretch;
  flex-wrap: wrap;
}

.today-left {
  min-width: 220px;
  flex: 0 0 260px;
  text-align: center;
  padding: var(--space-4) var(--space-6);
  /* 实况面板：素净纸面色块，让等宽读数的数字成为主角 */
  background: var(--surface-soft);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
}

.today-city {
  font-family: var(--font-serif);
  font-size: var(--fs-2xl);
  font-weight: var(--fw-medium);
  letter-spacing: 0.02em;
  color: var(--text-primary);
}

.today-date {
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  margin-top: var(--space-1);
}

.today-temp {
  margin: var(--space-2) 0;
  display: flex;
  align-items: baseline;
  justify-content: center;
}

.temp-max {
  font-size: 44px;
  font-weight: var(--fw-bold);
  color: var(--up-text);
  line-height: 1.1;
}

.temp-sep {
  font-size: var(--fs-2xl);
  color: var(--text-secondary);
  margin: 0 var(--space-2);
}

.temp-min {
  font-size: 28px;
  font-weight: var(--fw-bold);
  color: var(--brand-blue);
}

.today-text {
  font-size: var(--fs-lg);
  color: var(--text-regular);
}

/* 指标网格：容器变窄时自动减列 */
.today-right {
  flex: 1;
  min-width: 260px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: var(--space-3);
  align-content: center;
}

/* 指标卡：每项一个语义色相的浅渐变 + 同色系图标
   浅底深字保证可读性（全部 ≥4.5:1），色相只做扫读定位，不承载数据 */
.metric {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-3);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

/* 悬停轻微抬起，明确这是可交互感知的信息块 */
.metric:hover {
  border-color: var(--border-strong);
}

/* 骨架态的 metric 不加色相（内容未就绪，色块会误导），退回中性底 */
.today-right .metric:not([class*='metric--']) {
  background: var(--surface-soft);
  border-color: transparent;
}

/* 标签行：图标 + 文字，图标承担语义识别 */
.metric-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: var(--fs-xs);
  color: var(--text-secondary);
}

.metric-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.metric-value {
  font-size: var(--fs-base);
  font-weight: var(--fw-semibold);
  color: var(--text-primary);
  line-height: var(--lh-tight);
}

/* ---- 8 项指标色相（低饱和，与全站钢蓝 + 农业绿同族） ---- */
/* 8 项指标：扁平色块 + 1px 同族边框（禁渐变，色相仍可区分） */
.metric--wind {
  background: var(--tint-wind);
  border-color: var(--tint-wind-line);
}
.metric--wind .metric-icon { color: var(--tint-wind-ink); }

.metric--wind-night {
  background: var(--tint-wind-night);
  border-color: var(--tint-wind-night-line);
}
.metric--wind-night .metric-icon { color: var(--tint-wind-night-ink); }

.metric--rain {
  background: var(--tint-rain);
  border-color: var(--tint-rain-line);
}
.metric--rain .metric-icon { color: var(--tint-rain-ink); }

.metric--humidity {
  background: var(--tint-humidity);
  border-color: var(--tint-humidity-line);
}
.metric--humidity .metric-icon { color: var(--tint-humidity-ink); }

.metric--uv {
  background: var(--tint-uv);
  border-color: var(--tint-uv-line);
}
.metric--uv .metric-icon { color: var(--tint-uv-ink); }

.metric--fog {
  background: var(--tint-fog);
  border-color: var(--tint-fog-line);
}
.metric--fog .metric-icon { color: var(--tint-fog-ink); }

.metric--sunrise {
  background: var(--tint-sunrise);
  border-color: var(--tint-sunrise-line);
}
.metric--sunrise .metric-icon { color: var(--tint-sunrise-ink); }

.metric--sunset {
  background: var(--tint-sunset);
  border-color: var(--tint-sunset-line);
}
.metric--sunset .metric-icon { color: var(--tint-sunset-ink); }

/* ---- 农事提醒：按严重度用左边框 + 底色区分，左侧色条即风险等级 ---- */
.advice-body {
  min-height: 80px;
}

.advice-notice {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--fs-sm);
  color: var(--warning-color);
  background: var(--warning-soft);
  border: 1px solid var(--warning-soft-border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
}

.advice-empty {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--fs-sm);
  color: var(--down-text);
  padding: var(--space-3) 0;
}

.advice-item {
  border-left: 4px solid var(--border-strong);
  border-radius: var(--radius-md);
  background: var(--surface-soft);
  padding: var(--space-3) var(--space-4);
  margin-bottom: var(--space-3);
}

.advice-item.sev3 {
  border-left-color: var(--up-text);
  background: var(--danger-soft);
}

.advice-item.sev2 {
  border-left-color: var(--warning-color);
  background: var(--warning-soft);
}

.advice-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
  margin-bottom: var(--space-2);
}

.advice-product {
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
  color: var(--text-primary);
}

.advice-stage {
  font-size: var(--fs-xs);
  color: var(--brand-blue);
  background: var(--brand-soft);
  border-radius: var(--radius-sm);
  padding: 1px var(--space-2);
}

.advice-trigger {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  margin-left: auto;
}

.advice-text {
  font-size: var(--fs-sm);
  color: var(--text-regular);
  line-height: var(--lh-relaxed);
}

.advice-summary {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  margin-top: var(--space-1);
}

.advice-disclaimer {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  margin-top: var(--space-2);
}

.chart-container {
  height: var(--chart-h-weather);
}

/* ---- 七日预报：栅格行，今天高亮，悬停有反馈 ---- */
.forecast-list {
  display: flex;
  flex-direction: column;
}

.forecast-item {
  display: grid;
  grid-template-columns: 110px 180px 1fr 160px 120px;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-2);
  border-bottom: 1px solid var(--border-color);
  transition: background-color 0.2s;
}

.forecast-item:last-child {
  border-bottom: none;
}

.forecast-item:hover {
  background-color: var(--surface-soft);
}

.forecast-item.is-today {
  background-color: var(--brand-soft);
}

.forecast-item.is-today:hover {
  background-color: var(--brand-soft-strong);
}

.fw-date {
  font-size: var(--fs-base);
  font-weight: var(--fw-semibold);
  color: var(--text-primary);
}

.fw-week {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  margin-top: 2px;
}

.forecast-weather {
  display: flex;
  flex-direction: column;
}

.fw-text {
  font-size: var(--fs-md);
  color: var(--text-primary);
}

.fw-night {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  margin-top: 2px;
}

.forecast-temp {
  display: flex;
  align-items: center;
  gap: 10px;
}

.fw-max {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: var(--fs-lg);
  font-weight: var(--fw-medium);
  color: var(--up-text);
  min-width: 42px;
  text-align: right;
}

.fw-min {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: var(--fs-lg);
  font-weight: var(--fw-regular);
  color: var(--brand-forest);
  min-width: 42px;
}

/* 温度区间条：灰绿→陶土渐变表示由低到高，与左侧低/右侧高读数对应 */
.fw-bar {
  position: relative;
  flex: 1;
  height: 6px;
  background: var(--border-color);
  border-radius: var(--radius-pill);
}

.fw-bar-inner {
  position: absolute;
  top: 0;
  height: 6px;
  border-radius: var(--radius-pill);
  background: linear-gradient(90deg, var(--brand-sage), var(--chart-up));
}

.forecast-wind,
.forecast-precip {
  font-size: var(--fs-sm);
  color: var(--text-regular);
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

/* ≤992：预报行折成两列，实况面板与指标网格取消左右并置 */
@media (max-width: 992px) {
  .forecast-item {
    grid-template-columns: 1fr 1fr;
    row-gap: var(--space-2);
  }

  .today-left {
    flex: 1 1 100%;
  }
}

/* ≤480：手机，预报行单列，实况面板通栏 */
@media (max-width: 480px) {
  .forecast-item {
    grid-template-columns: 1fr;
    row-gap: var(--space-1);
  }

  .today-body {
    gap: var(--space-4);
  }

  .today-left {
    width: 100%;
    padding: var(--space-4);
  }

  .temp-max {
    font-size: 36px;
  }

  /* 指标卡在窄屏改两列：minmax(120px) 在 390px 下会被压到过窄 */
  .today-right {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-2);
    min-width: 0;
  }

  .metric {
    padding: var(--space-2);
  }

  /* 手机上悬停抬起无意义，取消位移避免误触时的抖动 */
  .metric:hover {
    transform: none;
  }

  /* 卡片配图在窄屏压扁到 16:9，避免 5:1 太扁看不清内容 */
  .card-cover {
    aspect-ratio: 16 / 9;
  }
}
</style>