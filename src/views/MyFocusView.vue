<template>
  <PageShell :loading="loading">
    <!-- 模块横幅：与全站横幅同骨架 -->
    <section class="page-hero focus-hero" aria-label="我的关注简介">
      <div class="page-hero-body">
        <p class="page-hero-kicker">作物档案 · 关注看板 · 收益台账</p>
        <h1 class="page-hero-title">我的农场与关注</h1>
        <p class="page-hero-sub">登记在种作物后，农事管家会结合天气、34 条农事规则与最新行情，每天生成个性化日报与风险预警</p>
      </div>
    </section>

    <!-- 我的农场 · AI 农事管家（作物档案与每日日报合并为一张卡，避免功能分散） -->
        <el-card class="focus-card">
          <template #header>
            <div class="card-header">
              <h2 class="card-title">我的农场 · AI 农事管家</h2>
              <div class="card-header-actions">
                <el-tag size="small" v-if="crops.length" type="success">{{ crops.length }} 种在种作物</el-tag>
                <el-button size="small" text type="primary" :loading="briefLoading" @click="refreshBrief">
                  {{ brief ? '重新生成日报' : '生成今日日报' }}
                </el-button>
              </div>
            </div>
          </template>

          <!-- 今日日报：读已留存结果；没有则引导用户主动生成（生成一次，持续留存） -->
          <div v-loading="briefLoading" class="butler-body">
            <div v-if="!crops.length" class="butler-empty">
              <figure class="butler-empty-figure">
                <img src="/images/empty-farm.jpg" alt="" aria-hidden="true" />
              </figure>
              先在下方登记作物，农事管家会结合天气、34 条农事规则和最新行情，每天生成个性化日报与风险预警。
            </div>
            <template v-else-if="brief">
              <div class="butler-meta">
                <el-tag size="small" :type="brief.source === 'llm' ? 'success' : 'info'">
                  {{ brief.source === 'llm' ? '大模型生成' : '本地规则引擎' }}
                </el-tag>
                <el-tooltip v-if="brief.audit && !brief.audit.passed" content="部分数字未在实况数据中找到，请注意核对" placement="top">
                  <el-tag size="small" type="warning">数字待核对</el-tag>
                </el-tooltip>
                <span class="butler-date">{{ brief.date }} · 已留存</span>
              </div>
              <p class="butler-text">{{ brief.brief }}</p>
              <el-collapse v-if="pushHistory.filter(p => p.pushDate !== brief.date).length" class="butler-history">
                <el-collapse-item title="往期日报">
                  <div v-for="h in pushHistory.filter(p => p.pushDate !== brief.date)" :key="h.id" class="history-item">
                    <span class="history-date">{{ h.pushDate }}</span>
                    <span class="history-text">{{ h.content }}</span>
                  </div>
                </el-collapse-item>
              </el-collapse>
            </template>
            <div v-else class="butler-empty">
              今日日报尚未生成。点击右上角「生成今日日报」开始生成（需约 1 分钟）；
              <b>生成后将一直留存</b>，切换到其他页面再返回仍在此展示，直到你主动重新生成。
            </div>
          </div>

          <!-- 种植区域：省 / 市两级下拉（全站唯一入口，避免重复填写） -->
          <div class="region-row">
            <span class="config-label">我的种植区域</span>
            <el-select v-model="config.province" class="province-select" size="small" placeholder="选择省份" @change="onProvinceChange">
              <el-option v-for="p in provinces" :key="p" :label="p" :value="p" />
            </el-select>
            <el-select v-model="config.region" class="city-select" size="small" filterable placeholder="选择城市" @change="saveConfig">
              <el-option v-for="c in cityOptions" :key="c" :label="c" :value="c" />
            </el-select>
            <span class="config-hint">用于农事提醒、农事管家日报与产量预估</span>
          </div>

          <!-- 作物档案：全部下拉选择，无需手输 -->
          <div class="crop-add">
            <el-select v-model="cropForm.cropType" class="crop-select" placeholder="选择作物" filterable allow-create default-first-option>
              <el-option v-for="c in CROP_OPTIONS" :key="c" :label="c" :value="c" />
            </el-select>
            <el-select v-model="cropForm.area" class="crop-select small" placeholder="面积（亩）" filterable allow-create default-first-option clearable>
              <el-option v-for="a in AREA_OPTIONS" :key="a" :label="`${a} 亩`" :value="String(a)" />
            </el-select>
            <el-select v-model="cropForm.currentStage" class="crop-select" placeholder="生育期" filterable clearable>
              <el-option v-for="s in STAGE_OPTIONS" :key="s" :label="s" :value="s" />
            </el-select>
            <el-button type="primary" :loading="cropAdding" @click="addCrop">登记作物</el-button>
          </div>

          <div v-if="crops.length" class="crop-list">
            <div v-for="c in crops" :key="c.id" class="crop-item">
              <span class="crop-name">{{ c.cropType }}</span>
              <span class="crop-meta">
                {{ c.region }}<template v-if="c.area"> · {{ c.area }} 亩</template><template v-if="c.currentStage"> · {{ c.currentStage }}</template>
              </span>
              <el-button size="small" text type="primary" @click="applyToProduction(c)">去施肥建议</el-button>
              <el-button size="small" text type="danger" @click="deleteCrop(c.id)">删除</el-button>
            </div>
          </div>
        </el-card>

        <!-- 关注看板 -->
        <el-card class="focus-card">
          <template #header>
            <div class="card-header">
              <h2 class="card-title">关注看板</h2>
              <span class="header-sub">数据日期 {{ priceDate || '—' }}</span>
            </div>
          </template>

          <!-- 区域农事提醒预览：方案 P5 与 P4 的联动 -->
          <div class="region-advice" v-if="config.region">
            <div class="ra-head">
              <span class="ra-title">{{ config.region }} · 农事提醒预览</span>
              <el-button size="small" text type="primary" @click="router.push({ path: '/production/weather', query: { city: config.region } })">
                查看完整预报 →
              </el-button>
            </div>
            <div v-loading="adviceLoading" class="ra-list">
              <div v-if="!adviceList.length" class="ra-empty">未来几天天气平稳，未触发农事风险规则。</div>
              <div v-for="a in adviceList.slice(0, 3)" :key="a.ruleId" class="ra-item" :class="'sev' + a.severity">
                <el-tag size="small" :type="riskTag(a.riskType)">{{ a.riskLabel }}</el-tag>
                <span class="ra-product">{{ a.productName }}</span>
                <span class="ra-stage">{{ a.growthStage }}</span>
                <span class="ra-text">{{ a.adviceText }}</span>
              </div>
            </div>
          </div>
          <button v-else type="button" class="region-advice empty" @click="scrollToConfig">
            尚未设置种植区域，设置后将在此显示农事提醒 →
          </button>

          <!-- 关注品种价格 -->
          <div class="section-title">关注的品种</div>
          <el-empty v-if="!followedProducts.length" description="还没有关注任何品种，去下方「关注设置」勾选吧">
            <el-button size="small" type="primary" @click="scrollToConfig">去关注设置</el-button>
          </el-empty>
          <div v-else class="focus-grid">
            <button
              v-for="p in followedProducts"
              :key="p.productId"
              type="button"
              class="focus-card-item"
              @click="router.push(`/price/${p.productId}`)"
            >
              <span class="fc-name">{{ p.name }}</span>
              <span class="fc-source" v-if="p.marketName">参考：{{ p.marketName }}</span>
              <span class="fc-source muted" v-else>全国均价</span>
              <span class="fc-price">
                <span class="fc-value" :class="{ na: p.displayPrice === null }">¥{{ p.displayPrice ?? '—' }}</span>
                <span class="fc-unit">/{{ p.baseUnit }}</span>
              </span>
              <span v-if="p.changePctDod !== null" class="fc-change" :class="p.changePctDod >= 0 ? 'up' : 'down'">
                {{ p.changePctDod >= 0 ? '▲' : '▼' }} {{ Math.abs(p.changePctDod) }}%
              </span>
              <span v-else class="fc-change muted">—</span>
            </button>
          </div>

          <!-- 参考市场报价 -->
          <template v-if="followedMarkets.length">
            <div class="section-title">参考市场报价</div>
            <div v-for="m in followedMarkets" :key="m.marketId" class="market-block">
              <div class="mb-head">
                <button type="button" class="mb-name" @click="router.push(`/market/${m.marketId}`)">{{ m.name }}</button>
                <el-tag size="small" :type="typeTag(m.marketType)">{{ m.marketType }}</el-tag>
              </div>
              <el-table :data="m.rows" size="small" style="width: 100%">
                <el-table-column label="品种" min-width="110">
                  <template #default="{ row }">
                    <button type="button" class="cell-link" @click="router.push(`/price/${row.productId}`)">{{ row.name }}</button>
                  </template>
                </el-table-column>
                <el-table-column label="均价" width="100">
                  <template #default="{ row }">
                    <span class="cell-price">¥{{ row.priceAvg ?? '—' }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="较昨日" width="100">
                  <template #default="{ row }">
                    <span v-if="row.changePctDod !== null" :class="pctClass(row.changePctDod)">
                      {{ row.changePctDod > 0 ? '+' : '' }}{{ row.changePctDod }}%
                    </span>
                    <span v-else class="cell-na">—</span>
                  </template>
                </el-table-column>
              </el-table>
              <div v-if="!m.rows.length" class="mb-empty">该市场暂无关注品种的报价</div>
            </div>
          </template>
        </el-card>

        <!-- AI 助农累计收益 -->
        <el-card class="focus-card">
          <template #header>
            <div class="card-header">
              <h2 class="card-title">AI 助农累计收益</h2>
              <div class="card-header-actions">
                <el-tag v-if="reportPersisted" size="small" type="info">{{ report.year }} 年度报告已留存</el-tag>
                <el-button size="small" text type="primary" :loading="reportLoading" @click="genReport">
                  {{ reportPersisted ? '重新生成年度报告' : '生成年度报告' }}
                </el-button>
              </div>
            </div>
          </template>

          <div class="benefit-total">
            <span class="benefit-value">¥{{ benefit?.total ?? 0 }}</span>
            <span class="benefit-label">累计估算增收/节本（{{ benefit?.count ?? 0 }} 笔，台账可验算）</span>
          </div>

          <div v-if="benefit?.byModule?.length" class="benefit-modules">
            <div v-for="m in benefit.byModule" :key="m.module" class="benefit-module">
              <span>{{ m.label }}</span>
              <span class="benefit-module-amount">¥{{ m.amount }}（{{ m.count }} 笔）</span>
            </div>
          </div>

          <div v-if="benefit?.recent?.length" class="benefit-recent">
            <div class="section-title">最近记录</div>
            <div v-for="r in benefit.recent" :key="r.id" class="benefit-row">
              <el-tag size="small" type="info">{{ r.moduleLabel }}</el-tag>
              <span class="benefit-row-item">{{ r.item }}</span>
              <span class="benefit-row-amount" :class="r.amountYuan >= 0 ? 'up' : 'down'">
                {{ r.amountYuan >= 0 ? '+' : '-' }}¥{{ Math.abs(r.amountYuan) }}
              </span>
            </div>
          </div>

          <p class="benefit-note">{{ benefit?.estimateNotice || '以上金额为平台按公开口径估算的增收/节本，非实际到账收入。' }}</p>
        </el-card>

        <!-- 关注设置 -->
        <el-card class="focus-card" ref="configCard">
          <template #header>
            <div class="card-header">
              <h2 class="card-title">关注设置</h2>
              <el-button size="small" text type="danger" @click="resetConfig">重置</el-button>
            </div>
          </template>

          <!-- 种植区域已上移至「我的农场 · AI 农事管家」卡片顶部统一设置，避免两处重复填写 -->

          <div class="config-row column">
            <span class="config-label">关注品种（{{ config.products.length }}）</span>
            <div class="product-check">
              <div v-for="cat in CATEGORY_LIST" :key="cat.value" class="cat-group">
                <span class="cat-name">{{ cat.label }}</span>
                <el-checkbox-group v-model="config.products" @change="saveConfig">
                  <el-checkbox v-for="p in productsByCategory(cat.value)" :key="p.productId" :value="p.productId">
                    {{ p.name }}
                  </el-checkbox>
                </el-checkbox-group>
              </div>
            </div>
          </div>

          <div class="config-row column">
            <span class="config-label">排序（置顶的品种排在前面）</span>
            <div class="sort-list" v-if="orderedProducts.length">
              <div v-for="(p, idx) in orderedProducts" :key="p.productId" class="sort-item">
                <span class="sort-name">{{ p.name }}</span>
                <div class="sort-btns">
                  <el-button size="small" aria-label="上移" :disabled="idx === 0" @click="moveProduct(idx, -1)">↑</el-button>
                  <el-button size="small" aria-label="下移" :disabled="idx === orderedProducts.length - 1" @click="moveProduct(idx, 1)">↓</el-button>
                  <el-button size="small" text type="danger" @click="removeProduct(p.productId)">取消关注</el-button>
                </div>
              </div>
            </div>
            <div v-else class="config-hint">还没有关注品种</div>
          </div>

          <div class="config-row column">
            <span class="config-label">参考市场（{{ config.markets.length }}）</span>
            <el-checkbox-group v-model="config.markets" @change="saveConfig">
              <el-checkbox v-for="m in markets" :key="m.marketId" :value="m.marketId" class="market-check">
                {{ m.name }}
              </el-checkbox>
            </el-checkbox-group>
            <span class="config-hint">最多展示 3 个参考市场的关注品种报价</span>
          </div>
        </el-card>

    <!-- 年度 AI 助农报告 -->
    <el-dialog v-model="reportVisible" title="年度 AI 助农报告" width="560px">
      <div v-if="report" class="report-body">
        <div class="report-meta">
          <el-tag size="small" :type="report.source === 'llm' ? 'success' : 'info'">
            {{ report.source === 'llm' ? '大模型生成' : '本地台账' }}
          </el-tag>
          <el-tooltip v-if="report.audit && !report.audit.passed" content="部分数字未在台账中找到，请注意核对" placement="top">
            <el-tag size="small" type="warning">数字待核对</el-tag>
          </el-tooltip>
          <span class="report-year">{{ report.year }} 年度{{ reportTime ? ` · 生成于 ${reportTime}` : '' }}</span>
        </div>
        <p class="report-text">{{ report.report }}</p>
        <p class="report-note">{{ report.estimateNotice }}</p>
      </div>
    </el-dialog>
  </PageShell>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import axiosInstance from '../utils/axios';
import { useUserStore } from '../stores/userStore';
import PageShell from '../components/PageShell.vue';
import { useAuthGuard } from '../composables/useAuthGuard';
import {
  loadFocusConfig,
  saveFocusConfig,
  clearFocusConfig,
  type FocusConfig
} from '../utils/focusConfig';

const router = useRouter();
const userStore = useUserStore();
const guard = useAuthGuard();

const CATEGORY_LIST = [
  { value: 'grain', label: '粮食作物' },
  { value: 'veg', label: '蔬菜' },
  { value: 'fruit', label: '水果' }
];

const loading = ref(false);
const adviceLoading = ref(false);
const configCard = ref<HTMLElement | null>(null);

const config = ref<FocusConfig>({ products: [], region: '', province: '河北省', markets: [] });
const allProducts = ref<any[]>([]);
const markets = ref<any[]>([]);
const priceDate = ref('');
const adviceList = ref<any[]>([]);

// 关注品种的展示数据：优先取参考市场报价，取不到回退全国均价
const followedProducts = ref<any[]>([]);
const followedMarkets = ref<any[]>([]);

// ---- AI 农事管家（M2）----
// 可枚举配置项一律下拉选择：作物/生育期为平台枚举，面积提供常用档位并允许自填
const CROP_OPTIONS = [
  '冬小麦', '小麦', '玉米', '水稻', '大豆', '花生', '马铃薯', '甘薯', '绿豆',
  '油菜', '棉花', '甘蔗', '蔬菜', '苹果', '柑橘', '葡萄', '桃', '梨', '西瓜', '草莓'
];
const STAGE_OPTIONS = [
  '播种期', '育苗期', '苗期', '出苗期', '定植期', '分蘖期', '拔节期', '抽雄期',
  '孕穗期', '抽穗期', '开花期', '现蕾期', '下针期', '幼果期', '灌浆期', '鼓粒期',
  '结荚期', '块茎膨大期', '膨大期', '转色期', '成熟期', '采收期'
];
const AREA_OPTIONS = [10, 20, 30, 50, 80, 100, 200, 300, 500, 1000];

const crops = ref<any[]>([]);
const cropAdding = ref(false);
const cropForm = ref({ cropType: '', area: '', currentStage: '' });
const brief = ref<any>(null);
const briefLoading = ref(false);
const pushHistory = ref<any[]>([]);

// 城市下拉数据来自天气服务（与气象生产同源，覆盖 32 个省级行政区）
const citiesOptions = ref<{ name: string; code: string }[]>([]);
const provinces = ref<string[]>([]);

// 按省份加载城市；首屏用配置里的省份
const loadCities = async (province: string) => {
  try {
    const res: any = await axiosInstance.get('/weather/cities', { params: { province } });
    citiesOptions.value = res.data?.cities || [];
    provinces.value = res.data?.provinces || [];
  } catch {
    citiesOptions.value = [];
  }
};

const onProvinceChange = async () => {
  config.value.region = '';
  await loadCities(config.value.province);
  saveConfig();
};

const cityOptions = computed(() => {
  const set = new Set<string>();
  citiesOptions.value.forEach(c => set.add(c.name));
  config.value.region && set.add(config.value.region);
  return Array.from(set);
});

const fetchCrops = async () => {
  try {
    const res: any = await axiosInstance.get('/agro/my-crops');
    crops.value = res.data || [];
  } catch {
    crops.value = [];
  }
};

const addCrop = async () => {
  if (!cropForm.value.cropType.trim()) {
    ElMessage.warning('请先选择作物');
    return;
  }
  if (!config.value.region) {
    ElMessage.warning('请先在上方选择种植区域');
    return;
  }
  cropAdding.value = true;
  try {
    await axiosInstance.post('/agro/my-crops', {
      cropType: cropForm.value.cropType.trim(),
      region: config.value.region,
      area: cropForm.value.area ? Number(cropForm.value.area) : undefined,
      currentStage: cropForm.value.currentStage || undefined
    });
    cropForm.value = { cropType: '', area: '', currentStage: '' };
    ElMessage.success('登记成功，农事管家已纳入该作物');
    await fetchCrops();
    await fetchBrief();
  } catch {
    /* 拦截器已提示错误 */
  } finally {
    cropAdding.value = false;
  }
};

// 从作物档案直达施肥打药建议（带上作物与区域，少一步输入）
const applyToProduction = (crop: any) => {
  router.push({
    path: '/production/fertilize',
    query: { crop: crop.cropType, region: crop.region, stage: crop.currentStage || '' }
  });
};

const deleteCrop = async (id: number) => {
  try {
    await axiosInstance.delete(`/agro/my-crops/${id}`);
    ElMessage.success('已删除');
    await fetchCrops();
    await fetchBrief();
  } catch {
    /* 拦截器已提示错误 */
  }
};

// 只读：读取今日已留存的日报（不调大模型，切页再返回即时展示）
const fetchBrief = async () => {
  if (!crops.value.length) {
    brief.value = null;
    return;
  }
  try {
    const res: any = await axiosInstance.get('/agro/daily-brief');
    if (res.data?.found) {
      brief.value = {
        date: res.data.date,
        brief: res.data.brief,
        source: res.data.source,
        generatedAt: res.data.generatedAt
      };
    } else {
      brief.value = null;
    }
  } catch {
    brief.value = null;
  }
};

// 用户主动触发：生成（或重新生成）今日日报，服务端持久化到 advisory_push
const refreshBrief = async () => {
  if (!crops.value.length) {
    ElMessage.warning('请先在下方登记作物');
    return;
  }
  briefLoading.value = true;
  try {
    const res: any = await axiosInstance.post('/agro/daily-brief/refresh', {}, { timeout: 200000 });
    if (res.data?.found) {
      brief.value = {
        date: res.data.date,
        brief: res.data.brief,
        source: res.data.source,
        fallbackReason: res.data.fallbackReason
      };
      ElMessage.success('日报已生成并留存，切页再返回仍会展示');
      await fetchPushHistory();
    } else {
      ElMessage.info('暂无作物档案，请先登记作物');
    }
  } catch {
    ElMessage.error('日报生成失败，请稍后重试');
  } finally {
    briefLoading.value = false;
  }
};

const fetchPushHistory = async () => {
  try {
    const res: any = await axiosInstance.get('/agro/push-history', { params: { limit: 7 } });
    pushHistory.value = res.data || [];
  } catch {
    pushHistory.value = [];
  }
};

// ---- AI 助农收益台账（M3）----
const benefit = ref<any>(null);
const reportVisible = ref(false);
const reportLoading = ref(false);
const report = ref<any>(null);
const reportPersisted = ref(false);
const reportTime = ref('');

const fetchBenefit = async () => {
  try {
    const res: any = await axiosInstance.get('/benefit/summary');
    benefit.value = res.data;
  } catch {
    benefit.value = null;
  }
};

// 只读：读取已留存的年度报告（不调大模型）
const loadReport = async (year?: number) => {
  try {
    const res: any = await axiosInstance.get('/benefit/annual-report', {
      params: year ? { year } : undefined
    });
    if (res.data?.found) {
      report.value = res.data.payload;
      reportPersisted.value = true;
      reportTime.value = res.data.generatedAt
        ? new Date(res.data.generatedAt).toLocaleString('zh-CN', { hour12: false })
        : '';
    } else {
      report.value = null;
      reportPersisted.value = false;
    }
  } catch {
    report.value = null;
    reportPersisted.value = false;
  }
};

// 用户主动触发：生成（或重新生成）年度报告，服务端持久化
const genReport = async () => {
  reportLoading.value = true;
  try {
    const res: any = await axiosInstance.post('/benefit/annual-report', {}, { timeout: 200000 });
    if (res.data?.found) {
      report.value = res.data.payload;
      reportPersisted.value = true;
      reportTime.value = res.data.generatedAt
        ? new Date(res.data.generatedAt).toLocaleString('zh-CN', { hour12: false })
        : '';
      reportVisible.value = true;
      ElMessage.success('年度报告已生成并留存');
    }
  } catch {
    /* 拦截器已提示错误 */
  } finally {
    reportLoading.value = false;
  }
};

const orderedProducts = computed(() =>
  config.value.products
    .map(id => allProducts.value.find(p => p.productId === id))
    .filter(Boolean) as any[]
);

const productsByCategory = (cat: string) => allProducts.value.filter(p => p.category === cat);

const pctClass = (v: number) => (v >= 0 ? 'up' : 'down');
const typeTag = (t: string) => (t === '产地型' ? 'success' : t === '集散型' ? 'warning' : 'primary');
const riskTag = (t: string) => ({ frost: 'danger', rain: 'primary', heat: 'warning', wind: 'info' } as Record<string, string>)[t] || 'info';

const scrollToConfig = () => {
  configCard.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// ---- 本地持久化（关注关系存本地；province 为 2026-10-16 新增，兼容旧配置） ----
const loadConfig = () => {
  config.value = loadFocusConfig(userStore.username);
};

const saveConfig = () => {
  saveFocusConfig(userStore.username, config.value);
  refreshDashboard();
};

// 重置关注设置：先二次确认（说明重置后果），确认后才清空
const resetConfig = async () => {
  try {
    await ElMessageBox.confirm(
      '确定重置关注设置吗？重置后需重新勾选关注品种与参考市场。',
      '重置关注设置',
      {
        confirmButtonText: '重置',
        cancelButtonText: '取消',
        type: 'warning'
      }
    );
  } catch {
    // 用户取消，不执行重置
    return;
  }

  config.value = { products: [], region: '', province: config.value.province, markets: [] };
  clearFocusConfig(userStore.username);
  refreshDashboard();
  ElMessage.success('已重置关注设置');
};

const moveProduct = (idx: number, dir: number) => {
  const arr = config.value.products;
  const target = idx + dir;
  if (target < 0 || target >= arr.length) return;
  const a = arr[idx];
  const b = arr[target];
  if (a === undefined || b === undefined) return;
  arr[idx] = b;
  arr[target] = a;
  saveConfig();
};

const removeProduct = (productId: string) => {
  config.value.products = config.value.products.filter(id => id !== productId);
  saveConfig();
};

// ---- 数据拉取 ----
const fetchAdvice = async () => {
  if (!config.value.region) {
    adviceList.value = [];
    return;
  }
  adviceLoading.value = true;
  try {
    const res: any = await axiosInstance.get('/agro/advice', { params: { city: config.value.region } });
    // 拦截器返回完整 body，payload 在 res.data，字段名为 advice（与 WeatherView 一致）
    adviceList.value = res.data?.advice || [];
  } catch {
    adviceList.value = [];
  } finally {
    adviceLoading.value = false;
  }
};

const refreshDashboard = async () => {
  // 关注品种价格：全国均价 + 各参考市场报价交叉
  const followedIds = config.value.products;
  const marketIds = config.value.markets.slice(0, 3);

  const [productsRes, ...marketDetails] = await Promise.all([
    axiosInstance.get('/price/products').catch(() => null),
    ...marketIds.map(id => axiosInstance.get(`/market/detail/${id}`).catch(() => null))
  ]);

  priceDate.value = productsRes?.data?.priceDate || '';
  const latestMap: Record<string, any> = {};
  (productsRes?.data?.products || []).forEach((p: any) => { latestMap[p.productId] = p; });

  // 参考市场报价：仅保留关注品种
  followedMarkets.value = marketIds.map((id, i) => {
    const d = marketDetails[i]?.data;
    const rows = (d?.quotes || [])
      .filter((q: any) => followedIds.includes(q.productId))
      .map((q: any) => ({
        productId: q.productId,
        name: q.name,
        priceAvg: q.priceAvg,
        changePctDod: q.changePctDod
      }));
    return {
      marketId: id,
      name: d?.market?.name || id,
      marketType: d?.market?.marketType || '',
      rows
    };
  });

  // 品种卡片：优先用第一个有报价的参考市场，否则全国均价
  followedProducts.value = followedIds.map(id => {
    const base = latestMap[id] || {};
    let displayPrice = base.latestPrice ?? null;
    let changePctDod = base.changePctDod ?? null;
    let marketName = '';
    for (const m of followedMarkets.value) {
      const hit = m.rows.find((r: any) => r.productId === id);
      if (hit && hit.priceAvg !== null && hit.priceAvg !== undefined) {
        displayPrice = hit.priceAvg;
        changePctDod = hit.changePctDod;
        marketName = m.name;
        break;
      }
    }
    return {
      productId: id,
      name: base.name || id,
      baseUnit: base.baseUnit || 'kg',
      displayPrice,
      changePctDod,
      marketName
    };
  });

  fetchAdvice();
};

const fetchBaseData = async () => {
  const [productsRes, marketsRes]: any[] = await Promise.all([
    axiosInstance.get('/price/products').catch(() => null),
    axiosInstance.get('/price/markets').catch(() => null)
  ]);
  allProducts.value = productsRes?.data?.products || [];
  markets.value = marketsRes?.data || [];
};

onMounted(async () => {
  if (!guard()) return;
  loading.value = true;
  try {
    await fetchBaseData();
    loadConfig();
    await loadCities(config.value.province);
    await refreshDashboard();
    // 农事管家与收益台账：并行拉取，单点失败不影响主看板
    await Promise.all([fetchCrops(), fetchBenefit(), fetchPushHistory()]);
    await fetchBrief();
    await loadReport();
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
/* ---- 模块横幅：骨架来自全局 .page-hero-* ，此处只换背景图 ---- */
.focus-hero {
  background:
    var(--hero-scrim),
    url('/images/bg-focus.jpg') center 48% / cover no-repeat var(--surface-soft);
}

.focus-card {
  margin-bottom: var(--space-block);
}

/* 区域农事提醒预览 */
.region-advice {
  background: var(--brand-soft);
  border: 1px solid var(--brand-soft-border);
  border-radius: var(--radius-lg);
  padding: 14px 16px;
  margin-bottom: var(--space-5);
}

.region-advice.empty {
  background: var(--warning-soft);
  border-color: var(--warning-soft-border);
  /* 深警告色：白底对比度 4.6:1（原 #b88230 约 3.5:1，不达 AA） */
  color: var(--warning-color);
  cursor: pointer;
  font-size: var(--fs-sm);
  font-family: inherit;
  line-height: inherit;
  text-align: left;
  width: 100%;
}

.ra-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.ra-title {
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
  color: var(--text-primary);
}

.ra-list {
  min-height: 60px;
}

.ra-empty {
  font-size: var(--fs-sm);
  color: var(--text-secondary);
}

.ra-item {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: var(--fs-sm);
  padding: 6px 0;
  border-top: 1px dashed var(--border-color);
}

.ra-item:first-of-type {
  border-top: none;
}

.ra-product {
  font-weight: var(--fw-semibold);
  color: var(--text-primary);
}

.ra-stage {
  color: var(--text-secondary);
}

.ra-text {
  color: var(--text-regular);
  flex: 1;
  min-width: 200px;
}

/* 关注品种卡片（button 化：键盘可达） */
.focus-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 14px;
}

.focus-card-item {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 14px;
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;
  background: var(--card-background);
  text-align: left;
  width: 100%;
  font-family: inherit;
  color: inherit;
}

.focus-card-item:hover {
  border-color: var(--brand-blue);
  box-shadow: var(--shadow-hover);
  transform: translateY(-2px);
}

.focus-card-item:active {
  transform: translateY(0);
}

.fc-name {
  display: block;
  font-size: var(--fs-base);
  font-weight: var(--fw-semibold);
  color: var(--text-primary);
}

.fc-source {
  display: block;
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  margin-top: 2px;
}

.fc-source.muted {
  color: var(--text-secondary);
}

.fc-price {
  display: block;
  margin-top: 10px;
}

.fc-value {
  font-size: var(--fs-3xl);
  font-weight: var(--fw-semibold);
  color: var(--brand-blue);
}

.fc-value.na {
  color: var(--text-secondary);
}

.fc-unit {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  margin-left: 2px;
}

.fc-change {
  display: block;
  font-size: var(--fs-xs);
  margin-top: 4px;
}

.fc-change.muted {
  color: var(--text-secondary);
}

/* 参考市场 */
.market-block {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 12px 14px;
  margin-bottom: 14px;
}

.mb-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

/* 市场名跳转（button 化：键盘可达） */
.mb-name {
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
  color: var(--brand-blue);
  cursor: pointer;
  background: none;
  border: none;
  padding: 0;
  font-family: inherit;
}

.mb-name:hover {
  text-decoration: underline;
}

.mb-empty {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  padding: 8px 0;
}

/* 设置区 */
.config-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 0;
  border-bottom: 1px dashed var(--border-color);
}

.config-row.column {
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.config-label {
  font-size: var(--fs-sm);
  font-weight: var(--fw-semibold);
  color: var(--text-primary);
  flex-shrink: 0;
}

.config-hint {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
}

.product-check {
  width: 100%;
}

.cat-group {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 8px;
}

.cat-name {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  width: 60px;
  flex-shrink: 0;
  padding-top: 5px;
}

.sort-list {
  width: 100%;
}

.sort-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  margin-bottom: 6px;
}

.sort-name {
  font-size: var(--fs-sm);
  color: var(--text-primary);
}

.sort-btns {
  display: flex;
  gap: 6px;
}

.market-check {
  width: 240px;
  max-width: 100%;
  margin-right: 0;
}

/* .up / .down / .cell-price 已上提全局；.cell-link 保留本地 button 重置版 */

/* 表格内跳转链接（button 化：键盘可达） */
.cell-link {
  color: var(--brand-blue);
  cursor: pointer;
  background: none;
  border: none;
  padding: 0;
  font-size: inherit;
  font-family: inherit;
}

.cell-link:hover {
  text-decoration: underline;
}

/* .cell-na 已上提全局 style.css */

/* 移动端：设置区收为单列，固定宽控件自适应 */
@media (max-width: 768px) {
  .focus-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .config-row {
    flex-direction: column;
    align-items: stretch;
  }

  .market-check {
    width: 100%;
  }

  .cat-group {
    flex-direction: column;
    gap: 4px;
  }
}

/* 触屏设备：品种卡片触控热区 ≥40px */
@media (pointer: coarse) {
  .focus-card-item {
    min-height: 40px;
  }
}

/* AI 农事管家日报 */
.butler-body {
  min-height: 60px;
}

.butler-empty {
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  line-height: 1.8;
}

/* 未登记作物时的引导插画：与社区/404 空态同一套插画语言 */
.butler-empty-figure {
  display: flex;
  justify-content: center;
  margin: 0 0 var(--space-3);
}

.butler-empty-figure img {
  width: 132px;
  height: 132px;
  object-fit: cover;
  border-radius: var(--radius-lg);
}

.butler-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.butler-date {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  margin-left: auto;
}

.butler-text {
  font-size: var(--fs-sm);
  color: var(--text-regular);
  line-height: 1.9;
  margin: 0;
  white-space: pre-wrap;
}

.butler-history {
  margin-top: 12px;
}

.history-item {
  display: flex;
  gap: 10px;
  padding: 8px 0;
  border-top: 1px dashed var(--border-color);
  font-size: var(--fs-sm);
}

.history-date {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.history-text {
  color: var(--text-regular);
  line-height: 1.7;
}

/* 我的作物 */
.region-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 12px 0;
  border-bottom: 1px dashed var(--border-color);
  margin-bottom: 14px;
}

.province-select {
  width: 130px;
}

.city-select {
  width: 150px;
}

.crop-add {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.crop-select {
  width: 150px;
}

.crop-select.small {
  width: 120px;
}

.crop-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  margin-bottom: 8px;
}

.crop-name {
  font-weight: var(--fw-semibold);
  color: var(--text-primary);
}

.crop-meta {
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  flex: 1;
}

/* AI 助农累计收益 */
.benefit-total {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 8px 0 16px;
}

.benefit-value {
  font-size: var(--fs-3xl);
  font-weight: var(--fw-semibold);
  color: var(--brand-blue);
}

.benefit-label {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
}

.benefit-modules {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}

.benefit-module {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: var(--fs-sm);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 8px 12px;
}

.benefit-module-amount {
  font-weight: var(--fw-semibold);
  color: var(--text-primary);
  white-space: nowrap;
}

.benefit-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  border-top: 1px dashed var(--border-color);
  font-size: var(--fs-sm);
}

.benefit-row-item {
  flex: 1;
  color: var(--text-regular);
}

.benefit-row-amount {
  font-weight: var(--fw-semibold);
}

.benefit-note {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  margin: 12px 0 0;
}

/* 年度报告对话框 */
.report-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.report-year {
  font-size: var(--fs-sm);
  color: var(--text-secondary);
}

.report-text {
  font-size: var(--fs-sm);
  color: var(--text-regular);
  line-height: 1.9;
  margin: 0;
  white-space: pre-wrap;
}

.report-note {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  margin: 12px 0 0;
}

@media (max-width: 768px) {
  .benefit-total {
    flex-direction: column;
    gap: 4px;
  }
}
</style>
