<template>
  <PageShell>
    <!-- 品牌横幅：写实农田背景 + 品牌渐变遮罩（视觉骨架来自全局 .page-hero） -->
        <section class="page-hero home-hero" aria-label="平台简介">
          <div class="page-hero-body">
            <p class="page-hero-kicker">农产品价格 · 农业气象 · 种植推荐</p>
            <h1 class="page-hero-title">在田间地头，看见数据的风向</h1>
            <p class="page-hero-sub">汇聚 30 个品种的实时行情、逐日气象与农事提醒，为生产经营提供参考</p>
            <div class="page-hero-actions">
              <el-button type="primary" size="large" @click="scrollToPrices">查看今日价格</el-button>
              <el-button size="large" class="page-hero-ghost" @click="router.push('/production/weather')">农业气象</el-button>
            </div>
            <!-- 数据带：等宽数字 + 数据青，一屏交代平台体量（静态文案，不含业务逻辑） -->
            <ul class="hero-stats" aria-label="平台数据概览">
              <li class="hs-item">
                <span class="hs-value">30</span>
                <span class="hs-label">个品种价格监测</span>
              </li>
              <li class="hs-item">
                <span class="hs-value">10</span>
                <span class="hs-label">个批发市场</span>
              </li>
              <li class="hs-item">
                <span class="hs-value">125</span>
                <span class="hs-label">个城市种植推荐</span>
              </li>
              <li class="hs-item">
                <span class="hs-value">161,840</span>
                <span class="hs-label">条历史报价</span>
              </li>
            </ul>
          </div>
        </section>

        <!-- 天气条：常驻一行，第一屏回答「今天天气如何、有什么要注意」 -->
        <div class="weather-strip" :class="{ failed: weatherError }">
          <span class="ws-city">{{ weatherCity }}</span>
          <template v-if="weatherLoading">
            <el-icon class="is-loading ws-loading"><Loading /></el-icon>
            <span class="ws-text muted">天气加载中…</span>
          </template>
          <template v-else-if="weatherError">
            <span class="ws-icon" aria-hidden="true">⚠️</span>
            <span class="ws-text error">{{ weatherError }}</span>
            <button type="button" class="ws-retry" @click="fetchWeatherStrip">重试</button>
          </template>
          <template v-else>
            <span class="ws-icon" aria-hidden="true">{{ weatherStrip.icon }}</span>
            <span class="ws-text">{{ weatherStrip.text }}</span>
            <span class="ws-temp">{{ weatherStrip.temp }}</span>
          </template>
          <span v-if="adviceCount > 0" class="ws-advice has">{{ adviceCount }} 条农事提醒</span>
          <span v-else-if="!weatherLoading && !weatherError" class="ws-advice">天气平稳</span>
          <router-link to="/production/weather" class="ws-link">查看详情 →</router-link>
        </div>

        <!-- P1 今日价格总览（主模块：顶部品牌渐变条强调） -->
        <el-card id="price-overview" class="home-card card-primary">
          <template #header>
            <div class="card-header">
              <h2 class="card-title">今日价格总览</h2>
              <div class="header-tools">
                <el-select
                  v-model="marketId"
                  size="small"
                  placeholder="按市场查看"
                  class="market-select"
                  clearable
                  @change="goMarket"
                >
                  <el-option v-for="m in markets" :key="m.marketId" :label="m.name" :value="m.marketId" />
                </el-select>
                <el-radio-group v-model="category" size="small" @change="fetchProducts">
                  <el-radio-button value="">全部</el-radio-button>
                  <el-radio-button value="grain">粮食</el-radio-button>
                  <el-radio-button value="veg">蔬菜</el-radio-button>
                  <el-radio-button value="fruit">水果</el-radio-button>
                </el-radio-group>
                <span v-if="summary" class="summary-text">
                  {{ summary.priceDate }} · {{ displaySummary.up }} 涨 {{ displaySummary.down }} 跌 {{ displaySummary.flat }} 平
                  <template v-if="displaySummary.topUp">
                    ，涨幅最大 {{ displaySummary.topUp.name }} +{{ displaySummary.topUp.changePctDod }}%
                  </template>
                </span>
              </div>
            </div>
          </template>

          <!-- 我的关注：第一屏优先展示用户自己关注的品种 -->
          <div v-if="focusProducts.length" class="focus-row">
            <span class="focus-label">我的关注</span>
            <button
              v-for="p in focusProducts"
              :key="p.productId"
              type="button"
              class="focus-chip"
              @click="router.push(`/price/${p.productId}`)"
            >
              {{ p.name }}
              <span class="fc-price">¥{{ p.latestPrice ?? '—' }}</span>
              <span v-if="p.changePctDod !== null" :class="p.changePctDod >= 0 ? 'up' : 'down'">
                {{ p.changePctDod >= 0 ? '+' : '' }}{{ p.changePctDod }}%
              </span>
            </button>
            <el-button size="small" text type="primary" @click="router.push('/my-focus')">管理关注</el-button>
          </div>

          <!-- 首屏加载：骨架屏替代空白等待 -->
          <div v-if="priceLoading && !products.length" class="price-grid" aria-busy="true">
            <div v-for="n in 6" :key="'sk' + n" class="skeleton-card">
              <div class="sk-line" style="width: 55%"></div>
              <div class="sk-line" style="width: 38%; margin-top: 8px"></div>
              <div class="sk-line sk-price" style="width: 48%"></div>
            </div>
          </div>
          <div v-else v-loading="priceLoading" class="price-grid" :aria-busy="priceLoading">
            <router-link
              v-for="p in filteredProducts"
              :key="p.productId"
              :to="`/price/${p.productId}`"
              class="price-card"
            >
              <!-- 作物图：与地区推荐共用映射（src/utils/cropImages.ts）；
                   本地先探一次，加载成功才挂 background-image，失败保留容器底色 -->
              <div class="pc-img" :style="priceImgStyle(p.name)" aria-hidden="true"></div>
              <div class="pc-body">
                <div class="pc-name">{{ p.name }}</div>
                <div class="pc-spec" v-if="p.spec">{{ p.spec }}</div>
                <div class="pc-price">
                  <span class="pc-value">¥{{ p.latestPrice ?? '—' }}</span>
                  <span class="pc-unit">/{{ p.baseUnit }}</span>
                </div>
                <div v-if="p.changePctDod !== null" class="pc-change" :class="p.changePctDod >= 0 ? 'up' : 'down'">
                  {{ p.changePctDod >= 0 ? '▲' : '▼' }} {{ Math.abs(p.changePctDod) }}%
                </div>
                <div v-else class="pc-change muted">—</div>
              </div>
            </router-link>
          </div>
          <!-- 错误态与空态分离：分得清「没加载出来」和「没数据」 -->
          <div v-if="loadState === 'error'" class="state-error" role="alert">
            <el-icon><WarningFilled /></el-icon>
            <span>价格数据加载失败，请稍后重试</span>
            <el-button size="small" type="primary" @click="fetchProducts">重试</el-button>
          </div>
          <div v-else-if="loadState === 'ready' && !priceLoading && !filteredProducts.length" class="empty-tip">
            暂无价格数据
          </div>
        </el-card>

        <!-- 数据洞察：产量图与地区推荐并列，桌面端双栏、移动端单列 -->
        <div class="insight-grid">
          <!-- 作物数据可视化模块 -->
          <el-card id="crop-chart" class="home-card">
            <template #header>
              <div class="card-header">
                <h2 class="card-title">作物产量数据可视化</h2>
                <span class="header-sub">统计局口径 · 可切图表与地区</span>
              </div>
            </template>
            <div class="chart-container">
              <CropChart />
            </div>
          </el-card>

          <!-- 地区推荐模块 -->
          <el-card id="region-recommend" class="home-card">
            <template #header>
              <div class="card-header">
                <h2 class="card-title">地区作物推荐</h2>
                <span class="header-sub">按气候与土壤匹配</span>
              </div>
            </template>
            <div class="recommend-container embedded-panel">
              <RegionRecommend />
            </div>
          </el-card>
        </div>

        <!-- 社区互动模块：首页只展示最近几条，完整论坛见「农友论坛」页 -->
        <el-card class="home-card">
          <template #header>
            <div class="card-header">
              <h2 class="card-title">社区互动</h2>
              <router-link to="/forum" class="forum-entry">进入论坛 →</router-link>
            </div>
          </template>
          <div class="post-container embedded-panel">
            <PostInteraction :limit="5" />
          </div>
        </el-card>

        <!-- 平台能力介绍：填充页面尾部空白，一屏传递产品价值 -->
        <section class="home-features" aria-label="平台能力">
          <h2 class="features-title">平台能为你做什么</h2>
          <p class="features-sub">从行情、气象到种植决策，一个平台看全农业生产关键数据</p>
          <div class="features-grid">
            <article class="feature-card">
              <span class="feature-icon fi-blue" aria-hidden="true">
                <el-icon><TrendCharts /></el-icon>
              </span>
              <h3 class="feature-name">实时价格行情</h3>
              <p class="feature-desc">覆盖 30 个品种、多家批发市场的每日报价与走势，涨跌变化一目了然</p>
              <button type="button" class="feature-link" @click="scrollToPrices">查看价格 →</button>
            </article>
            <article class="feature-card">
              <span class="feature-icon fi-amber" aria-hidden="true">
                <el-icon><Sunny /></el-icon>
              </span>
              <h3 class="feature-name">农业气象服务</h3>
              <p class="feature-desc">逐日天气预报与农事提醒，帮助合理安排灌溉、植保与采收时机</p>
              <button type="button" class="feature-link" @click="router.push('/production/weather')">查看天气 →</button>
            </article>
            <article class="feature-card">
              <span class="feature-icon fi-green" aria-hidden="true">
                <el-icon><DataLine /></el-icon>
              </span>
              <h3 class="feature-name">产量数据可视化</h3>
              <p class="feature-desc">全国及分省分品种的产量数据，多年趋势与结构对比一图看清</p>
              <button type="button" class="feature-link" @click="scrollTo('crop-chart')">查看图表 →</button>
            </article>
            <article class="feature-card">
              <span class="feature-icon fi-blue" aria-hidden="true">
                <el-icon><Place /></el-icon>
              </span>
              <h3 class="feature-name">地区种植推荐</h3>
              <p class="feature-desc">结合气候与土壤条件，为 125 个城市匹配适宜种植的作物与特产</p>
              <button type="button" class="feature-link" @click="scrollTo('region-recommend')">查看推荐 →</button>
            </article>
          </div>
        </section>
  </PageShell>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useUserStore } from '../stores/userStore';
import { WarningFilled, TrendCharts, Sunny, DataLine, Place, Loading } from '@element-plus/icons-vue';
import PageShell from '../components/PageShell.vue';
import CropChart from '../components/CropChart.vue';
import RegionRecommend from '../components/RegionRecommend.vue';
import PostInteraction from '../components/PostInteraction.vue';
import axiosInstance from '../utils/axios';
import { cropImage } from '../utils/cropImages';
import { loadFocusConfig } from '../utils/focusConfig';
import { useAuthGuard } from '../composables/useAuthGuard';

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();
const guard = useAuthGuard();

// hero 按钮 / 平台能力卡：平滑滚动到本页指定区块（reduced-motion 下由全局降级为瞬时）
const scrollTo = (id: string) => {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const scrollToPrices = () => scrollTo('price-overview');

interface ProductItem {
  productId: string;
  name: string;
  category: string;
  spec: string;
  baseUnit: string;
  latestPrice: number | null;
  changePctDod: number | null;
}

const category = ref('');
const priceLoading = ref(false);
const products = ref<ProductItem[]>([]);
const summary = ref<any>(null);
const markets = ref<any[]>([]);
const marketId = ref('');

// 价格区四态状态机：loading / error / ready（对齐 CropChart 范式）
type LoadState = 'loading' | 'error' | 'ready';
const loadState = ref<LoadState>('loading');

// 我的关注（localStorage，与 MyFocusView 共享同一份配置）
interface FocusConfig {
  products: string[];
  region: string;
  markets: string[];
}
const focusConfig = ref<FocusConfig>({ products: [], region: '', markets: [] });
const focusProducts = ref<ProductItem[]>([]);

// 天气条农事提醒计数：第一屏直接回答「今天有什么要注意」
const adviceCount = ref(0);

// 天气条默认值，接口失败时保持可用
const weatherCity = ref('石家庄');
const weatherStrip = ref({ icon: '☀️', text: '晴', temp: '--°/--°' });
// 天气接口失败标记：降级展示时给出可感知提示
const weatherFailed = ref(false);
// 加载态与错误文案（此前只有 failed 布尔，失败原因不可见、也无法重试）
const weatherLoading = ref(false);
const weatherError = ref('');

// 类别筛选与 URL query 同步：视图可分享、刷新不丢失
watch(category, (v) => {
  const query = { ...route.query };
  if (v) {
    query.category = v;
  } else {
    delete query.category;
  }
  router.replace({ query });
});

const filteredProducts = computed(() =>
  category.value ? products.value.filter(p => p.category === category.value) : products.value
);

/**
 * 价格卡背景图：整批一次性预探测，而非每张卡各挂一次。
 * 理由：价格卡最多 30 张，逐个探测会产生 30 个并发请求；
 * 这里对当前列表里的图做一轮探测并缓存结果，命中缓存的直接返回。
 * 探测失败的图不挂 background-image，由 .pc-img 自身底色兜底（不出现裂图/空白）。
 */
const priceImgOk = ref<Record<string, boolean>>({});
const probeImage = (url: string) =>
  new Promise<boolean>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });

watch(
  filteredProducts,
  async (list) => {
    const urls = [...new Set(list.map(p => cropImage(p.name)))];
    const results = await Promise.all(urls.map(probeImage));
    const next: Record<string, boolean> = {};
    urls.forEach((u, i) => {
      next[u] = results[i] === true;
    });
    priceImgOk.value = next;
  },
  { immediate: true }
);

/** 供模板展开到 :style：加载成功才给 backgroundImage */
const priceImgStyle = (name: string) => {
  const url = cropImage(name);
  return priceImgOk.value[url] === true ? { backgroundImage: `url("${encodeURI(url)}")` } : {};
};

// 筛选口径一致：勾选类别时，涨跌统计按当前筛选结果计算，而非沿用全量口径
const displaySummary = computed(() => {
  if (!category.value) {
    return summary.value || { priceDate: '', up: 0, down: 0, flat: 0, topUp: null };
  }
  const list = filteredProducts.value;
  let up = 0;
  let down = 0;
  let flat = 0;
  for (const p of list) {
    const c = p.changePctDod;
    if (c === null || c === undefined) continue;
    if (c > 0) up++;
    else if (c < 0) down++;
    else flat++;
  }
  const top = [...list]
    .filter(p => p.changePctDod !== null && p.changePctDod > 0)
    .sort((a, b) => (b.changePctDod || 0) - (a.changePctDod || 0))[0];
  return {
    priceDate: summary.value?.priceDate || '',
    up,
    down,
    flat,
    topUp: top || null
  };
});

// 读取本地关注配置；天气城市优先跟随用户设置的种植区域
const loadFocus = () => {
  const cfg = loadFocusConfig(userStore.username);
  focusConfig.value = { products: cfg.products, region: cfg.region, markets: cfg.markets };
  if (cfg.region) weatherCity.value = normalizeCity(cfg.region);
};

/**
 * 城市名归一（前端兜底，与后端 weatherService 同口径）
 * 旧版关注设置的区域来自市场表，存的是「石家庄市」这类带后缀行政名，
 * 与天气服务索引（「石家庄」）不一致——这正是首页天气此前整体不显示的根因。
 * 后端已做服务端归一，这里再清洗一次，保证界面与下游参数都是规范名。
 */
const normalizeCity = (name: string) => {
  const s = String(name || '').trim();
  if (!s) return '';
  const stripped = s.replace(/(市辖区|地区|自治州|盟)$/u, '').replace(/市$/u, '');
  return stripped || s;
};

// 关注品种按用户自定义排序取前 6 个
const applyFocus = () => {
  focusProducts.value = focusConfig.value.products
    .map(id => products.value.find(p => p.productId === id))
    .filter(Boolean)
    .slice(0, 6) as ProductItem[];
};

const fetchProducts = async () => {
  loadState.value = 'loading';
  priceLoading.value = true;
  try {
    const [productsRes, summaryRes]: any[] = await Promise.all([
      axiosInstance.get('/price/products'),
      axiosInstance.get('/price/summary')
    ]);
    products.value = productsRes.data?.products || [];
    summary.value = summaryRes.data || null;
    applyFocus();
    loadState.value = 'ready';
  } catch {
    // 区分「加载失败」与「暂无数据」
    loadState.value = 'error';
  } finally {
    priceLoading.value = false;
  }
};

// 天气文本 → 图标映射（修复图标恒为 ☀️ 的问题）
const WEATHER_ICONS: Record<string, string> = {
  '晴': '☀️', '多云': '⛅', '阴': '☁️',
  '小雨': '🌧️', '中雨': '🌧️', '大雨': '🌧️', '暴雨': '⛈️',
  '雷阵雨': '⛈️', '雨夹雪': '🌨️',
  '小雪': '🌨️', '中雪': '🌨️', '大雪': '❄️',
  '雾': '🌫️', '霾': '🌫️'
};
const mapWeatherIcon = (text: string) => WEATHER_ICONS[text] || '🌤️';

/**
 * 拉取天气条数据
 * ---------------------------------------------------------------
 * 修复要点（首页天气此前整体不显示的根因链）：
 *   1. 城市口径不一致 → 后端 weatherService 已做归一化（石家庄市 ⇄ 石家庄）；
 *   2. 这里对失败**分类**并给出可读提示，不再静默降级：
 *      404 城市未收录 / 502 上游或 Key 异常 / 其他为网络异常；
 *   3. 字段逐项校验，温度缺失显示「--」而不是 NaN；
 *   4. 加载态与失败态分离，避免出现「假晴」的误导性默认值。
 */
const fetchWeatherStrip = async () => {
  weatherLoading.value = true;
  weatherError.value = '';
  try {
    const res: any = await axiosInstance.get('/weather/forecast', { params: { city: weatherCity.value } });
    const daily = res.data?.daily;
    const today = Array.isArray(daily) ? daily[0] : null;
    if (!today) {
      weatherError.value = '暂无该城市的预报数据';
      return;
    }
    const tMin = Number(today.tempMin);
    const tMax = Number(today.tempMax);
    weatherStrip.value = {
      icon: mapWeatherIcon(String(today.textDay || '')),
      text: String(today.textDay || '—'),
      temp: `${Number.isFinite(tMin) ? tMin : '--'}° / ${Number.isFinite(tMax) ? tMax : '--'}°`
    };
  } catch (err: any) {
    const status = err?.response?.status;
    const msg = String(err?.response?.data?.message || '');
    if (status === 404) {
      weatherError.value = `「${weatherCity.value}」未收录到城市编码，请在「我的关注」重新选择区域`;
    } else if (status === 502) {
      weatherError.value = msg.includes('API Key') ? '天气服务未配置 API Key' : '天气服务暂不可用，请稍后重试';
    } else {
      weatherError.value = '网络异常，天气未能加载';
    }
    weatherFailed.value = true;
  } finally {
    weatherLoading.value = false;
  }

  // 农事提醒计数：与天气页共享服务端缓存，不产生额外上游调用
  try {
    const res: any = await axiosInstance.get('/agro/advice', { params: { city: weatherCity.value } });
    adviceCount.value = (res.data?.advice || []).length;
  } catch {
    /* 提醒计数失败时保持 0，不干扰天气主展示 */
  }
};

const fetchMarkets = async () => {
  try {
    const res: any = await axiosInstance.get('/price/markets');
    markets.value = res.data || [];
  } catch {
    /* 市场选择器失败不影响主流程 */
  }
};

const goMarket = (id: string) => {
  if (id) router.push(`/market/${id}`);
};

onMounted(() => {
  if (!guard()) return;
  // 从 URL 恢复类别筛选
  if (typeof route.query.category === 'string') {
    category.value = route.query.category;
  }
  loadFocus();
  fetchProducts();
  fetchWeatherStrip();
  fetchMarkets();
});
</script>

<style scoped>
/* ---- 品牌横幅：横幅骨架来自全局 .page-hero-* ，此处只换背景图 ---- */
.home-hero {
  background:
    var(--hero-scrim),
    url('/images/bg-home.jpg') center 45% / cover no-repeat var(--brand-forest-mid);
}

/* ---- 横幅数据带：等宽数字 + 数据青，横向排布在标题下方 ---- */
.hero-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, auto));
  justify-content: start;
  gap: var(--space-12);
  margin: var(--space-12) 0 0;
  padding: var(--space-5) 0 0;
  list-style: none;
  border-top: 1px solid rgba(245, 242, 233, 0.26);
}

.hs-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.hs-value {
  font-family: var(--font-mono);
  font-size: clamp(22px, 2.1vw, 30px);
  font-weight: var(--fw-regular);
  line-height: 1.1;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
  color: var(--brand-teal);
}

.hs-label {
  font-family: var(--font-sans);
  font-size: var(--fs-xs);
  letter-spacing: 0.06em;
  color: rgba(245, 242, 233, 0.7);
}

/* 数据洞察双栏：桌面端产量图与地区推荐并列，平板与手机回退单列。
   align-items: stretch —— 两张卡等高，卡内图表区才能吃掉多余高度；
   之前用 start 导致图表卡按内容高度收缩、与右侧卡片不等高，底部大片留白。 */
.insight-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
  gap: var(--space-block);
  align-items: stretch;
}

/* 双栏内的卡片自身不加下边距（间距由 grid gap 统一提供），
   并改为纵向 flex，让图表卡能撑满等高后的行高 */
.insight-grid > .home-card {
  margin-bottom: 0;
}

/* el-card__body 是卡内唯一可伸展的容器，图表卡靠它把高度传下去。
   注意：deep() 不可省——el-card / el-card__body 是子组件内部元素，
   普通后代选择器在 scoped 下选不中。 */
.insight-grid :deep(> .el-card) {
  display: flex;
  flex-direction: column;
}

.insight-grid :deep(> .el-card > .el-card__body) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* 图表区：不再写死高度，改为「吃掉父级剩余空间 + 一个下限」。
   flex:1 让它随卡片等高而拉伸；min-height 保证控件行换行时不被压扁。 */
.chart-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: var(--chart-h-crop);
}

/* ---- 天气条：纸面色条 + 左侧苔藓绿细线，失败时左侧转警示色 ---- */
.weather-strip {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  background: var(--surface-soft);
  border: 1px solid var(--border-color);
  border-left: 2px solid var(--brand-moss);
  color: var(--text-regular);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-5);
  margin-bottom: var(--space-block);
  font-family: var(--font-sans);
  font-size: var(--fs-md);
  text-decoration: none;
  box-shadow: none;
  transition: border-color 0.24s ease, background-color 0.24s ease;
}

.weather-strip:not(.failed):hover {
  background: var(--card-background);
  border-color: var(--border-strong);
  border-left-color: var(--brand-forest);
}

/* 失败态：不再假装"天气平稳"，用警示底色明确告知 */
.weather-strip.failed {
  background: var(--danger-soft);
  border-color: var(--danger-soft-border);
  border-left-color: var(--danger-color);
}

.ws-city {
  font-family: var(--font-serif);
  font-size: var(--fs-base);
  font-weight: var(--fw-medium);
  letter-spacing: 0.04em;
  color: var(--text-primary);
  flex-shrink: 0;
}

.ws-icon {
  font-size: 16px;
}

.ws-temp {
  font-size: var(--fs-xl);
  font-weight: var(--fw-regular);
  color: var(--text-primary);
}

.ws-text.muted {
  color: var(--text-secondary);
}

.ws-text.error {
  font-size: var(--fs-sm);
  color: var(--danger-color);
}

.ws-loading {
  font-size: 18px;
}

/* 失败时的重试按钮（键盘可达） */
.ws-retry {
  background: transparent;
  border: 1px solid var(--danger-color);
  color: var(--danger-color);
  border-radius: var(--radius-xs);
  padding: 2px 10px;
  font-size: var(--fs-xs);
  font-family: inherit;
  cursor: pointer;
  transition: background-color 0.24s ease, color 0.24s ease;
}

.ws-retry:hover {
  background: var(--danger-color);
  color: #FFFFFF;
}

.ws-link {
  margin-left: auto;
  font-size: var(--fs-xs);
  letter-spacing: 0.04em;
  color: var(--text-secondary);
  text-decoration: none;
  white-space: nowrap;
  border-bottom: 1px solid var(--border-strong);
  padding-bottom: 1px;
  transition: color 0.24s ease, border-color 0.24s ease;
}

.ws-link:hover {
  color: var(--brand-forest);
  border-bottom-color: var(--brand-forest);
}

/* 农事提醒计数：无提醒为中性底色，有提醒才升级为警示色，避免常态性报警 */
.ws-advice {
  font-size: var(--fs-xs);
  letter-spacing: 0.02em;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xs);
  padding: 2px 8px;
  white-space: nowrap;
  color: var(--text-secondary);
}

.ws-advice.has {
  background: var(--up-badge-bg);
  border-color: var(--up-badge-bg);
  color: #FFFFFF;
  font-weight: var(--fw-medium);
}

/* 骨架屏卡片：.sk-line / .sk-price / sk-shimmer 动画均来自全局 */
.skeleton-card {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  background: var(--card-background);
}

/* 我的关注行：首屏优先展示用户自己关注的品种 */
.focus-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
  padding: var(--space-3);
  background: var(--surface-soft);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  margin-bottom: var(--space-5);
}

.focus-label {
  font-family: var(--font-sans);
  font-size: var(--fs-xs);
  font-weight: var(--fw-medium);
  letter-spacing: 0.08em;
  color: var(--brand-moss-deep);
  flex-shrink: 0;
}

.focus-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-sans);
  font-size: var(--fs-xs);
  background: var(--card-background);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xs);
  padding: 4px 10px;
  color: var(--text-regular);
  cursor: pointer;
  transition: border-color 0.24s ease, color 0.24s ease;
}

.focus-chip:hover {
  border-color: var(--brand-forest);
  color: var(--brand-forest);
}

.fc-price {
  font-weight: var(--fw-medium);
  color: var(--text-primary);
}

/* 卡片圆角/边框由全局 .el-card 统一提供 */
.home-card {
  margin-bottom: var(--space-block);
}

/* 主模块强调：顶部 2px 深绿实线（不用渐变） */
.card-primary {
  position: relative;
  overflow: hidden;
}

.card-primary::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--brand-forest);
}

/* .card-header / .card-title / .header-tools / .header-sub / .up / .down /
   .state-error / .empty-tip / .sk-line 均已上提至全局 style.css，此处不再重复定义 */

.header-tools :deep(.el-radio-group) {
  flex-wrap: wrap;
}

.market-select {
  width: 170px;
  max-width: 100%;
}

.summary-text {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
}

/* 价格卡片网格（router-link，键盘可达） */
.price-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(172px, 1fr));
  gap: var(--space-4);
  min-height: 120px;
}

/* 价格卡片：顶部作物图 + 白色内容区（细线方框，不做悬浮位移） */
.price-card {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 0;
  cursor: pointer;
  transition: border-color 0.24s ease;
  background: var(--card-background);
  text-decoration: none;
  color: inherit;
  display: flex;
  flex-direction: column;
}

.pc-img {
  height: 88px;
  flex-shrink: 0;
  /* 图片未就绪/探测失败时的占位底色，避免出现空白或裂图 */
  background-color: var(--background-alt);
  background-size: cover;
  background-position: center;
  /* 配图统一压暗降饱和，与全站摄影调性一致 */
  filter: saturate(0.82) brightness(0.94);
}

.pc-body {
  /* flex: 1 1 auto：basis 用 auto，让内容高度参与 grid 行高计算；
     若写 flex: 1（basis 0），卡片只剩图条高度、正文被 overflow:hidden 裁掉 */
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  padding: var(--space-3) var(--space-4) var(--space-4);
}

.price-card:hover {
  border-color: var(--brand-forest);
}

/* 按下回落：触屏与鼠标均有「按下去」的实体感 */
.price-card:active {
  background: var(--surface-soft);
}

.pc-name {
  font-family: var(--font-serif);
  font-size: var(--fs-base);
  font-weight: var(--fw-medium);
  letter-spacing: 0.02em;
  color: var(--text-primary);
}

.pc-spec {
  font-family: var(--font-sans);
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  margin-top: 2px;
}

.pc-price {
  /* 价格锚定卡片底部：同行卡片高度一致时视觉更整齐 */
  margin-top: auto;
  padding-top: 10px;
}

.pc-value {
  font-size: var(--fs-3xl);
  font-weight: var(--fw-regular);
  color: var(--brand-forest);
  letter-spacing: -0.02em;
}

.pc-unit {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-secondary);
  margin-left: 2px;
}

.pc-change {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  margin-top: var(--space-1);
}

.pc-change.muted {
  color: var(--text-secondary);
}

/* .chart-container（图表区拉伸规则）已在上方 .insight-grid 段落统一定义，此处不重复 */

.recommend-container,
.post-container {
  min-height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 推荐区填满卡片区域：取消垂直居中，子组件拉伸占满 */
.recommend-container {
  align-items: stretch;
}

/* 帖子区不居中：列表自上而下更符合浏览习惯 */
.post-container {
  align-items: flex-start;
}

/* 进入论坛入口 */
.forum-entry {
  font-size: var(--fs-md);
  color: var(--brand-blue);
  text-decoration: none;
  font-weight: var(--fw-semibold);
}

.forum-entry:hover {
  text-decoration: underline;
}

/* 卡片嵌套消除：嵌入模块的内层卡片改为浅色面板，去掉双层边框 */
.embedded-panel :deep(.el-card) {
  border: 1px solid var(--border-color);
  box-shadow: none;
  background: var(--surface-soft);
}

/* ---- 平台能力介绍区：页面收尾，靠留白与底色分区 ----
   苔藓灰绿色块 + 右侧加深的绿渐变，与横幅的绿色调呼应 */
.home-features {
  margin-top: var(--space-16);
  padding: var(--space-16) clamp(20px, 3vw, 56px) var(--space-20);
  background:
    radial-gradient(96% 130% at 100% 0%, rgba(110, 139, 90, 0.42), rgba(216, 224, 194, 0) 70%),
    var(--background-alt);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
}

.features-title {
  font-family: var(--font-serif);
  font-size: var(--fs-section);
  font-weight: var(--fw-regular);
  letter-spacing: var(--ls-tight);
  color: var(--text-primary);
  text-align: left;
  margin: 0 0 var(--space-3);
}

.features-sub {
  font-family: var(--font-serif);
  font-size: var(--fs-base);
  line-height: var(--lh-relaxed);
  color: var(--text-regular);
  text-align: left;
  margin: 0 0 var(--space-12);
  max-width: 52ch;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-5);
}

.feature-card {
  background: var(--card-background);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: var(--space-6);
  box-shadow: none;
  transition: border-color 0.24s ease;
  display: flex;
  flex-direction: column;
}

.feature-card:hover {
  border-color: var(--brand-moss);
}

/* 图标：细线方框，不做实心色块 */
.feature-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-xs);
  border: 1px solid var(--border-color);
  margin-bottom: var(--space-4);
  font-size: 19px;
  flex-shrink: 0;
}

.fi-blue,
.fi-green,
.fi-amber {
  background: transparent;
  color: var(--brand-moss-deep);
}

.feature-name {
  font-family: var(--font-serif);
  font-size: var(--fs-lg);
  font-weight: var(--fw-medium);
  letter-spacing: var(--ls-tight);
  color: var(--text-primary);
  margin: 0 0 var(--space-2);
}

.feature-desc {
  font-family: var(--font-serif);
  font-size: var(--fs-sm);
  color: var(--text-regular);
  line-height: var(--lh-relaxed);
  margin: 0 0 var(--space-5);
  /* 说明文字占满剩余高度，让底部链接在同一行对齐 */
  flex: 1;
}

.feature-link {
  align-self: flex-start;
  padding: 0 0 2px;
  border: none;
  border-bottom: 1px solid var(--border-strong);
  background: none;
  font-family: var(--font-sans);
  font-size: var(--fs-sm);
  letter-spacing: 0.02em;
  color: var(--brand-forest);
  cursor: pointer;
  transition: border-color 0.24s ease;
}

.feature-link:hover {
  border-bottom-color: var(--brand-forest);
}

/* ≤1200：数据洞察双栏收窄，避免图表被压扁 */
@media (max-width: 1200px) {
  .insight-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .features-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* ≤768：平板与手机，价格卡两列、横幅与能力区单列 */
@media (max-width: 768px) {
  .price-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-3);
  }

  /* 数据带：手机上两列排布，数字不挤成一行 */
  .hero-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-5) var(--space-6);
    margin-top: var(--space-8);
  }

  .home-features {
    margin-top: var(--space-12);
    padding: var(--space-8) var(--space-5) var(--space-10);
  }

  .features-sub {
    margin-bottom: var(--space-8);
  }

  .weather-strip {
    padding: var(--space-3) var(--space-4);
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .ws-link {
    margin-left: 0;
  }
}

/* ≤480：手机，能力卡单列、天气条链接独占一行 */
@media (max-width: 480px) {
  .features-grid {
    grid-template-columns: 1fr;
  }

  .price-card {
    /* 窄屏放宽卡片可点区域，名称过长时截断为两行 */
    min-height: 40px;
  }

  .pc-name {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .hero-stats {
    gap: var(--space-4) var(--space-5);
  }

  .ws-link {
    width: 100%;
    text-align: right;
  }
}
</style>
