<template>
  <PageShell :embedded="embedded">
    <PageHeader
      title="施肥打药"
      subtitle="选作物与生育期，给出标准方案用量、气象调整与病虫害预警"
      :crumbs="[
        { label: '首页', to: '/home' },
        { label: '气象生产', to: '/production/overview' },
        { label: '施肥打药' }
      ]"
    />

    <!-- 操作区：全部为下拉选择，零手输 -->
    <el-card class="fert-card">
          <template #header>
            <div class="card-header">
              <h2 class="card-title">AI 精准施肥打药</h2>
              <span class="header-sub">选作物 → 选生育期 → 选区域 → 填面积</span>
            </div>
          </template>

          <div class="fert-controls">
            <el-select v-model="form.crop" class="fc" placeholder="选择作物" filterable @change="onCropChange">
              <el-option v-for="c in CROP_OPTIONS" :key="c.value" :label="c.label" :value="c.value" />
            </el-select>
            <el-select v-model="form.stage" class="fc" placeholder="选择生育期" filterable clearable @change="load">
              <el-option v-for="s in stageOptions" :key="s" :label="s" :value="s" />
            </el-select>
            <el-select v-model="form.province" class="fc" placeholder="选择省份" @change="onProvinceChange">
              <el-option v-for="p in provinces" :key="p" :label="p" :value="p" />
            </el-select>
            <el-select v-model="form.region" class="fc" placeholder="选择城市" filterable>
              <el-option v-for="c in cities" :key="c.name" :label="c.name" :value="c.name" />
            </el-select>
            <el-select v-model="form.area" class="fc small" placeholder="面积（亩）" filterable allow-create default-first-option>
              <el-option v-for="a in AREA_OPTIONS" :key="a" :label="`${a} 亩`" :value="String(a)" />
            </el-select>
            <el-button type="primary" :loading="loading" @click="load(true)">
              {{ hasPersisted ? '重新生成' : '生成建议' }}
            </el-button>
            <el-tag v-if="hasPersisted" type="info" size="default" class="fert-persist-tag">
              已留存 · 生成于 {{ persistTime }}
            </el-tag>
          </div>

          <p class="fert-hint">
            用量为公开农业技术资料整理的<b>通用参考值</b>，非当地测土配方检测结果；气象调整会结合未来 15 天预报实时修正。
            <b>首次生成后结果将留存</b>，切换到其他页面再返回仍在此展示，直到你点击「重新生成」；仅调整面积时不会重新生成（按面积实时折算总量）。
          </p>
        </el-card>

        <el-alert
          v-if="result && !result.weatherAvailable"
          :title="result.weatherNotice || '天气数据暂不可用'"
          type="warning"
          show-icon
          :closable="false"
          class="fert-alert"
        />

        <template v-if="result">
          <!-- 概览 -->
          <el-card class="fert-card">
            <template #header>
              <div class="card-header">
                <h2 class="card-title">{{ result.cropType }} · {{ result.stage }}</h2>
                <span class="header-sub">{{ result.profileLabel }}标准方案 · {{ result.region || '未指定区域' }}</span>
              </div>
            </template>

            <div class="fert-stats">
              <div class="fs">
                <span class="fs-value">{{ result.baseFertilizer.n }}/{{ result.baseFertilizer.p }}/{{ result.baseFertilizer.k }}</span>
                <span class="fs-label">折纯氮/磷/钾（{{ result.baseFertilizer.unit }}）</span>
              </div>
              <div class="fs">
                <span class="fs-value">{{ result.fertilizerTotal ? result.fertilizerTotal.n : '—' }}</span>
                <span class="fs-label">折纯氮合计{{ result.fertilizerTotal ? `（${result.fertilizerTotal.unit}）` : '（未填面积）' }}</span>
              </div>
              <div class="fs">
                <span class="fs-value" :class="result.estimate.saveRate ? 'good' : ''">{{ result.estimate.saveRate }}%</span>
                <span class="fs-label">预计节省肥料用量（估算）</span>
              </div>
              <div class="fs">
                <span class="fs-value">{{ result.weatherHits.length }}</span>
                <span class="fs-label">命中气象调整规则</span>
              </div>
            </div>

            <div class="fert-material">
              <span class="fl-label">物料配比</span>
              <span>{{ result.baseFertilizer.material }}</span>
            </div>
          </el-card>

          <div class="fert-grid">
            <!-- AI 作业指导 -->
            <el-card class="fert-card">
              <template #header>
                <div class="card-header">
                  <h2 class="card-title">今日作业指导</h2>
                  <el-tag size="small" :type="result.source === 'llm' ? 'success' : 'info'">
                    {{ result.source === 'llm' ? '大模型生成' : '规则引擎' }}
                  </el-tag>
                </div>
              </template>
              <el-tooltip
                v-if="result.audit && !result.audit.passed"
                :content="`以下数字未在依据数据中找到：${result.audit.unverified.join('、')}`"
                placement="top"
              >
                <el-tag size="small" type="warning" class="mb8">部分数字待核对</el-tag>
              </el-tooltip>
              <p class="fert-text">{{ result.aiText }}</p>
              <div class="fert-tasks">
                <div class="section-title">农事要点</div>
                <ul>
                  <li v-for="(t, i) in result.stageData.tasks" :key="i">{{ t }}</li>
                </ul>
              </div>
            </el-card>

            <!-- 气象调整 -->
            <el-card class="fert-card">
              <template #header>
                <div class="card-header">
                  <h2 class="card-title">气象调整</h2>
                  <span class="header-sub">未来 15 天预报驱动</span>
                </div>
              </template>
              <div v-if="result.adjustments.length" class="adj-list">
                <div v-for="(a, i) in result.adjustments" :key="i" class="adj-item">
                  <el-tag size="small" type="warning">{{ a.label }}</el-tag>
                  <span class="adj-text">{{ a.action }}</span>
                </div>
              </div>
              <div v-else class="fert-empty">
                {{ result.weatherAvailable ? '未来预报未触发减量/避害规则，按常规方案执行。' : '暂无该区域预报，无法生成气象调整。' }}
              </div>
              <p v-if="result.estimate.basis" class="fert-basis">{{ result.estimate.basis }}。{{ result.estimate.notice }}</p>
            </el-card>

            <!-- 病虫害预警 -->
            <el-card class="fert-card">
              <template #header>
                <div class="card-header">
                  <h2 class="card-title">病虫害风险预警</h2>
                  <span class="header-sub">按气象条件自动评估</span>
                </div>
              </template>
              <div class="pest-list">
                <div v-for="p in result.pests" :key="p.name" class="pest-item" :class="{ hit: p.hit }">
                  <div class="pest-head">
                    <span class="pest-name">{{ p.name }}</span>
                    <el-tag size="small" :type="p.hit ? 'danger' : 'info'">{{ p.riskLevel }}</el-tag>
                  </div>
                  <div class="pest-detail">触发条件：{{ p.trigger }}｜实测：{{ p.triggerDetail }}</div>
                  <div v-if="p.hit" class="pest-action">
                    建议 {{ p.chemical }} {{ p.dose }} {{ p.doseUnit }}，{{ p.action }}
                  </div>
                </div>
              </div>
            </el-card>
          </div>

          <div class="fert-foot">
            <p class="fert-disclaimer">{{ result.disclaimer }}</p>
            <el-button size="small" type="primary" plain @click="openRecord">记录节本收益</el-button>
          </div>
        </template>

        <el-empty v-else-if="!loading && generated" description="请选择作物与区域后生成建议" />

    <!-- 节本收益登记（BenefitRecordDialog：三处收益入口共用同一组件） -->
    <BenefitRecordDialog
      v-model:visible="recordVisible"
      title="记录节本收益"
      :summary="`${result?.cropType} · ${result?.stage}`"
      amount-label="节本金额（元）"
      :default-amount="200"
      :default-basis="recordBasisPrefill"
      :max="1000000"
      :step="50"
      :rows="3"
      note="按当地肥料单价折算的估算值，非实际到账收入。"
      :submitting="recording"
      @submit="submitRecord"
    />
  </PageShell>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
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

const route = useRoute();
const guard = useAuthGuard();
const { provinces, cities, loadCities, hasCity } = useCityOptions();

// 作物选项：平台 30 个价格品种 + 常见粮食/经济作物（枚举化，去掉手输）
const CROP_OPTIONS = [
  { value: '冬小麦', label: '冬小麦' }, { value: '小麦', label: '小麦' },
  { value: '玉米', label: '玉米' }, { value: '水稻', label: '水稻' },
  { value: '大豆', label: '大豆' }, { value: '花生', label: '花生' },
  { value: '马铃薯', label: '马铃薯' }, { value: '甘薯', label: '甘薯' },
  { value: '绿豆', label: '绿豆' }, { value: '油菜', label: '油菜' },
  { value: '棉花', label: '棉花' }, { value: '甘蔗', label: '甘蔗' },
  { value: '蔬菜', label: '蔬菜' }, { value: '苹果', label: '苹果' },
  { value: '柑橘', label: '柑橘' }, { value: '葡萄', label: '葡萄' },
  { value: '桃', label: '桃' }, { value: '梨', label: '梨' },
  { value: '西瓜', label: '西瓜' }, { value: '草莓', label: '草莓' },
  { value: '香蕉', label: '香蕉' }, { value: '芒果', label: '芒果' },
  { value: '猕猴桃', label: '猕猴桃' }, { value: '冬枣', label: '冬枣' }
];
const AREA_OPTIONS = [10, 20, 30, 50, 80, 100, 200, 300, 500, 1000];

const form = ref({ crop: '冬小麦', stage: '', province: '河北省', region: '石家庄', area: '' });
const stageOptions = ref<string[]>([]);
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

// 从「我的农场」深链接进来时（?crop=xxx&region=xxx&stage=xxx）自动预填并直接出建议
const applyQuery = async () => {
  const q = route.query || {};
  const crop = typeof q.crop === 'string' ? q.crop : '';
  const region = typeof q.region === 'string' ? q.region : '';
  const stage = typeof q.stage === 'string' ? q.stage : '';
  if (crop) form.value.crop = crop;
  if (stage) form.value.stage = stage;
  if (region) {
    form.value.region = region;
    // 反查所属省份，保证城市下拉可回显
    try {
      const loc: any = await axiosInstance.get('/weather/locate', { params: { city: region } });
      if (loc.data?.province) {
        form.value.province = loc.data.province;
        await fetchCities();
        form.value.region = region;
      }
    } catch {
      /* 反查失败不阻断 */
    }
  }
  if (crop || region) load();
};

const onProvinceChange = () => {
  form.value.region = '';
  fetchCities();
};

// 换作物后刷新生育期下拉，并尝试读取该作物的已留存结果
const onCropChange = async () => {
  form.value.stage = '';
  result.value = null;
  hasPersisted.value = false;
  await loadPersisted();
};

// 只读：命中已留存结果则展示（不调大模型）
const loadPersisted = async () => {
  if (!form.value.crop) return;
  try {
    const res: any = await axiosInstance.get('/fertilize/advice', {
      params: {
        crop: form.value.crop,
        stage: form.value.stage || undefined,
        region: form.value.region || undefined,
        area: form.value.area || undefined
      }
    });
    if (res.data?.found) {
      result.value = res.data.payload;
      hasPersisted.value = true;
      persistTime.value = formatDateTime(res.data.generatedAt);
      generated.value = true;
      if (res.data.payload?.stageOptions) stageOptions.value = res.data.payload.stageOptions;
    } else {
      result.value = null;
      hasPersisted.value = false;
      generated.value = false;
    }
  } catch {
    /* 读取失败静默：用户可点按钮主动生成 */
  }
};

// 用户主动触发：首次生成或重新生成（force=true 才调大模型）
const load = async (force = false) => {
  if (!form.value.crop) {
    ElMessage.warning('请先选择作物');
    return;
  }
  loading.value = true;
  generated.value = true;
  try {
    if (force) {
      const res: any = await axiosInstance.post(
        '/fertilize/advice/refresh',
        {
          crop: form.value.crop,
          stage: form.value.stage || undefined,
          region: form.value.region || undefined,
          area: form.value.area || undefined
        },
        { timeout: 200000 }
      );
      if (res.data?.found) {
        result.value = res.data.payload;
        hasPersisted.value = true;
        persistTime.value = formatDateTime(res.data.generatedAt);
        if (res.data.payload?.stageOptions) stageOptions.value = res.data.payload.stageOptions;
        ElMessage.success('建议已生成并留存，切页再返回仍会展示');
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

// ---- 节本收益登记（接入 M3 台账）----
const recordVisible = ref(false);
const recording = ref(false);

// 每次打开对话框时的默认估算依据（组件打开时读取）
const recordBasisPrefill = computed(() =>
  result.value ? `${result.value.cropType}${result.value.stage}：${result.value.estimate.basis}` : ''
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
      module: 'fertilize',
      item: `${result.value.cropType}-${result.value.stage}`,
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
  await applyQuery();
  await loadPersisted();
  try {
    const res: any = await axiosInstance.get('/fertilize/options');
    stageOptions.value = res.data?.stageOptions || [];
  } catch {
    /* 忽略：生成本次建议后会返回该作物的可选阶段 */
  }
});
</script>

<style scoped>
.fert-card {
  margin-bottom: var(--space-block);
}

.fert-controls {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.fc {
  width: 160px;
}

.fc.small {
  width: 130px;
}

.fert-hint {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  margin: 12px 0 0;
  line-height: 1.7;
}

.fert-persist-tag {
  height: 32px;
  line-height: 30px;
}

.fert-alert {
  margin-bottom: var(--space-5);
}

.fert-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 14px;
}

.fs-value {
  display: block;
  font-size: var(--fs-2xl, 22px);
  font-weight: var(--fw-semibold);
  color: var(--brand-blue);
  line-height: 1.2;
}

.fs-value.good {
  color: var(--up-text);
}

.fs-label {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
}

.fert-material {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px dashed var(--border-color);
  font-size: var(--fs-sm);
  color: var(--text-regular);
}

.fl-label {
  color: var(--text-secondary);
  margin-right: 10px;
}

.fert-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: var(--space-4);
  margin-bottom: var(--space-block);
}

.fert-grid .fert-card {
  margin-bottom: 0;
}

.fert-text {
  font-size: var(--fs-sm);
  color: var(--text-regular);
  line-height: var(--lh-relaxed);
  margin: 0;
  white-space: pre-wrap;
}

.mb8 {
  margin-bottom: 8px;
  display: inline-block;
}

.section-title {
  font-size: var(--fs-base);
  font-weight: var(--fw-semibold);
  color: var(--text-primary);
  margin: 16px 0 8px;
}

.fert-tasks ul {
  margin: 0;
  padding-left: 18px;
  font-size: var(--fs-sm);
  color: var(--text-regular);
  line-height: 1.9;
}

.adj-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.adj-item {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: var(--fs-sm);
  padding: 8px 0;
  border-bottom: 1px dashed var(--border-color);
}

.adj-text {
  color: var(--text-regular);
  line-height: 1.7;
}

.fert-empty,
.fert-basis {
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  line-height: 1.8;
  margin: 0;
}

.fert-basis {
  margin-top: 12px;
  font-size: var(--fs-xs);
}

.pest-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pest-item {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 10px 12px;
}

.pest-item.hit {
  border-color: var(--up-text);
  background: var(--danger-soft);
}

.pest-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.pest-name {
  font-weight: var(--fw-semibold);
  color: var(--text-primary);
}

.pest-detail {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  margin-top: 6px;
}

.pest-action {
  font-size: var(--fs-sm);
  color: var(--text-regular);
  margin-top: 6px;
  line-height: 1.7;
}

.fert-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: var(--space-5);
}

.fert-disclaimer {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  margin: 0;
  flex: 1;
  min-width: 240px;
}

@media (max-width: 768px) {
  .fc,
  .fc.small {
    width: 100%;
  }

  .fert-grid {
    grid-template-columns: 1fr;
  }
}
</style>
