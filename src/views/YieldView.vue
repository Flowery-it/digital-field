<template>
  <PageShell :embedded="embedded">
    <PageHeader
      title="产量预估"
      subtitle="历史基线 × 天气修正 × 长势评级，测算区域口径产量与预计收入"
      :crumbs="[
        { label: '首页', to: '/home' },
        { label: '气象生产', to: '/production/overview' },
        { label: '产量预估' }
      ]"
    />

    <el-card class="yld-card">
          <template #header>
            <div class="card-header">
              <h2 class="card-title">AI 产量预估与收益测算</h2>
              <span class="header-sub">历史基线 × 天气修正 × 长势评级</span>
            </div>
          </template>

          <div class="yld-controls">
            <el-select v-model="form.crop" class="yc" placeholder="选择作物" filterable>
              <el-option v-for="c in CROP_OPTIONS" :key="c.value" :label="c.label" :value="c.value" />
            </el-select>
            <el-select v-model="form.province" class="yc" placeholder="选择省份" @change="onProvinceChange">
              <el-option v-for="p in provinces" :key="p" :label="p" :value="p" />
            </el-select>
            <el-select v-model="form.region" class="yc" placeholder="选择城市" filterable>
              <el-option v-for="c in cities" :key="c.name" :label="c.name" :value="c.name" />
            </el-select>
            <el-radio-group v-model="form.vigor">
              <el-radio-button label="好">长势好</el-radio-button>
              <el-radio-button label="一般">一般</el-radio-button>
              <el-radio-button label="差">偏差</el-radio-button>
            </el-radio-group>
            <el-button type="primary" :loading="loading" @click="load(true)">
              {{ hasPersisted ? '重新测算' : '开始测算' }}
            </el-button>
            <el-tag v-if="hasPersisted" type="info" size="default" class="yld-persist-tag">
              已留存 · 生成于 {{ persistTime }}
            </el-tag>
          </div>

          <p class="yld-hint">
            产量为<b>区域口径</b>（该区域该作物总产量）估算：历史基线取统计局分省产量近三年均值，
            天气修正来自未来 15 天预报并对全年影响收敛到 ±6%，收入按 7 日价格预测折算。
            <b>首次测算后结果将留存</b>，切换到其他页面再返回仍在此展示，直到你点击「重新测算」。
          </p>
        </el-card>

        <template v-if="result">
          <el-card class="yld-card">
            <div class="yld-hero">
              <div class="yh-left">
                <span class="yh-label">{{ result.region }} · {{ result.cropType }}</span>
                <div class="yh-numbers">
                  <div>
                    <span class="yh-value">{{ result.estimateYield }}</span>
                    <span class="yh-unit">万吨（预估产量）</span>
                  </div>
                  <div class="yh-change" :class="result.changePct >= 0 ? 'up' : 'down'">
                    {{ result.changePct >= 0 ? '+' : '' }}{{ result.changePct }}%
                    <span class="yh-sub">较历史基线 {{ result.baseline }} 万吨</span>
                  </div>
                </div>
              </div>
              <div class="yh-right">
                <div>
                  <span class="yh-value small">{{ result.revenueWan === null ? '—' : result.revenueWan }}</span>
                  <span class="yh-unit">万元（预计收入）</span>
                </div>
                <div class="yh-meta">预计 {{ result.harvestTime }} 上市</div>
              </div>
            </div>

            <div class="yld-factors">
              <div class="yf">
                <span class="yf-label">历史基线</span>
                <span class="yf-value">{{ result.baseline }} 万吨</span>
                <span class="yf-detail">{{ result.baselineYears.join(' / ') }} 年均值（口径「{{ result.cropName }}」）</span>
              </div>
              <div class="yf">
                <span class="yf-label">天气修正</span>
                <span class="yf-value">×{{ result.weather.factor }}</span>
                <span class="yf-detail">{{ result.weather.detail }}</span>
              </div>
              <div class="yf">
                <span class="yf-label">长势评级</span>
                <span class="yf-value">×{{ result.vigorFactor }}</span>
                <span class="yf-detail">{{ result.vigor }}（主观评级修正）</span>
              </div>
              <div class="yf" v-if="result.price">
                <span class="yf-label">价格预测</span>
                <span class="yf-value">{{ result.price.predictedPrice }} 元/公斤</span>
                <span class="yf-detail">{{ result.price.detail }}</span>
              </div>
            </div>
          </el-card>

          <el-card class="yld-card">
            <template #header>
              <div class="card-header">
                <h2 class="card-title">长势分析</h2>
                <el-tag size="small" :type="result.source === 'llm' ? 'success' : 'info'">
                  {{ result.source === 'llm' ? '大模型生成' : '规则引擎' }}
                </el-tag>
              </div>
            </template>
            <el-tooltip
              v-if="result.audit && !result.audit.passed"
              :content="`以下数字未在测算依据中找到：${result.audit.unverified.join('、')}`"
              placement="top"
            >
              <el-tag size="small" type="warning" class="mb8">部分数字待核对</el-tag>
            </el-tooltip>
            <p class="yld-text">{{ result.aiText }}</p>
            <p class="yld-caliber">口径说明：{{ result.caliber }}</p>
            <div class="yld-foot">
              <p class="yld-disclaimer">{{ result.disclaimer }}</p>
              <el-button size="small" type="primary" plain @click="openRecord">记录预估收益</el-button>
            </div>
          </el-card>
        </template>

        <el-empty v-else-if="!loading && generated" description="请选择作物与区域后开始测算" />

    <!-- 预估收益登记（BenefitRecordDialog：三处收益入口共用同一组件） -->
    <BenefitRecordDialog
      v-model:visible="recordVisible"
      title="记录预估收益"
      :summary="`${result?.region} · ${result?.cropType}`"
      amount-label="预估增收金额（元）"
      :default-amount="3000"
      :default-basis="recordBasisPrefill"
      :max="100000000"
      :step="500"
      :rows="4"
      note="区域口径的估算值，不代表单户实际收入。"
      :submitting="recording"
      @submit="submitRecord"
    />
  </PageShell>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import axiosInstance from '../utils/axios';
import PageShell from '../components/PageShell.vue';
import PageHeader from '../components/PageHeader.vue';
import BenefitRecordDialog from '../components/BenefitRecordDialog.vue';
import { useCityOptions } from '../composables/useCityOptions';
import { useAuthGuard } from '../composables/useAuthGuard';
import { formatDateTime } from '../utils/formatTime';

const props = defineProps<{ embedded?: boolean }>();
const embedded = computed(() => !!props.embedded);

const guard = useAuthGuard();
const { provinces, cities, loadCities, hasCity } = useCityOptions();

const CROP_OPTIONS = [
  { value: '冬小麦', label: '冬小麦' }, { value: '小麦', label: '小麦' },
  { value: '玉米', label: '玉米' }, { value: '水稻', label: '水稻' },
  { value: '大豆', label: '大豆' }, { value: '花生', label: '花生' },
  { value: '马铃薯', label: '马铃薯' }, { value: '油菜', label: '油菜' },
  { value: '棉花', label: '棉花' }, { value: '甘蔗', label: '甘蔗' },
  { value: '蔬菜', label: '蔬菜' }, { value: '柑橘', label: '柑橘' },
  { value: '水果', label: '水果' }
];

const form = ref({ crop: '冬小麦', province: '北京市', region: '北京', vigor: '一般' });
const result = ref<any>(null);
const loading = ref(false);
const generated = ref(false);
const hasPersisted = ref(false);
const persistTime = ref('');

const fetchCities = async () => {
  await loadCities(form.value.province);
  if (cities.value.length && !hasCity(form.value.region)) {
    const first = cities.value[0];
    if (first) form.value.region = first.name;
  }
};

const onProvinceChange = () => {
  form.value.region = '';
  fetchCities();
};

// 只读：命中已留存测算结果则展示（不调大模型）
const loadPersisted = async () => {
  if (!form.value.region) return;
  try {
    const res: any = await axiosInstance.get('/yield/estimate', {
      params: {
        crop: form.value.crop,
        region: form.value.region,
        vigor: form.value.vigor
      }
    });
    if (res.data?.found) {
      result.value = res.data.payload;
      hasPersisted.value = true;
      persistTime.value = formatDateTime(res.data.generatedAt);
      generated.value = true;
    } else {
      result.value = null;
      hasPersisted.value = false;
      generated.value = false;
    }
  } catch {
    /* 读取失败静默 */
  }
};

const load = async (force = false) => {
  if (!form.value.region) {
    ElMessage.warning('请先选择城市');
    return;
  }
  loading.value = true;
  generated.value = true;
  try {
    if (force) {
      const res: any = await axiosInstance.post(
        '/yield/estimate/refresh',
        {
          crop: form.value.crop,
          region: form.value.region,
          vigor: form.value.vigor
        },
        { timeout: 200000 }
      );
      if (res.data?.found) {
        result.value = res.data.payload;
        hasPersisted.value = true;
        persistTime.value = formatDateTime(res.data.generatedAt);
        ElMessage.success('测算结果已留存，切页再返回仍会展示');
      }
    } else {
      await loadPersisted();
    }
  } catch {
    result.value = null;
    hasPersisted.value = false;
  } finally {
    loading.value = false;
  }
};

const recordVisible = ref(false);
const recording = ref(false);

// 每次打开对话框时的默认估算依据（组件打开时读取）
const recordBasisPrefill = computed(() =>
  result.value
    ? `${result.value.region}${result.value.cropType}：基线 ${result.value.baseline} 万吨，天气修正 ×${result.value.weather.factor}，` +
      `长势评级 ${result.value.vigor}，预估产量 ${result.value.estimateYield} 万吨（${result.value.changePct >= 0 ? '+' : ''}${result.value.changePct}%）`
    : ''
);

const openRecord = () => {
  if (!result.value) return;
  recordVisible.value = true;
};

const submitRecord = async (amount: number, basis: string) => {
  if (!basis) {
    ElMessage.warning('估算依据不能为空');
    return;
  }
  recording.value = true;
  try {
    await axiosInstance.post('/benefit/record', {
      module: 'forecast',
      item: `${result.value.region}-${result.value.cropType}`,
      amountYuan: amount,
      basis
    });
    ElMessage.success('已登记到「AI 助农收益台账」');
    recordVisible.value = false;
  } catch {
    /* 拦截器已提示 */
  } finally {
    recording.value = false;
  }
};

onMounted(async () => {
  if (!guard()) return;
  await fetchCities();
  await loadPersisted();
});
</script>

<style scoped>
.yld-card {
  margin-bottom: var(--space-block);
}

.yld-controls {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
}

.yc {
  width: 160px;
}

.yld-hint {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  margin: 12px 0 0;
  line-height: 1.7;
}

.yld-persist-tag {
  height: 32px;
  line-height: 30px;
}

.yld-hero {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 20px;
  flex-wrap: wrap;
}

.yh-label {
  font-size: var(--fs-sm);
  color: var(--text-secondary);
}

.yh-numbers {
  display: flex;
  align-items: baseline;
  gap: 16px;
  flex-wrap: wrap;
  margin-top: 6px;
}

.yh-value {
  font-size: 36px;
  font-weight: var(--fw-semibold);
  color: var(--brand-blue);
  line-height: 1.1;
}

.yh-value.small {
  font-size: 26px;
}

.yh-unit {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  margin-left: 6px;
}

.yh-change {
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
}

.yh-change.up {
  color: var(--up-text);
}

.yh-change.down {
  color: var(--down-text);
}

.yh-sub {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  font-weight: normal;
  margin-left: 6px;
}

.yh-right {
  text-align: right;
}

.yh-meta {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  margin-top: 6px;
}

.yld-factors {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 14px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px dashed var(--border-color);
}

.yf {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.yf-label {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
}

.yf-value {
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
  color: var(--text-primary);
}

.yf-detail {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  line-height: 1.6;
}

.yld-text {
  font-size: var(--fs-sm);
  color: var(--text-regular);
  line-height: 1.9;
  margin: 0;
  white-space: pre-wrap;
}

.mb8 {
  margin-bottom: 8px;
  display: inline-block;
}

.yld-caliber {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  margin: 12px 0 0;
}

.yld-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px dashed var(--border-color);
}

.yld-disclaimer {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  margin: 0;
  flex: 1;
  min-width: 240px;
}

@media (max-width: 768px) {
  .yc {
    width: 100%;
  }

  .yh-right {
    text-align: left;
  }
}
</style>
