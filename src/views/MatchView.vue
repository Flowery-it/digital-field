<template>
  <PageShell :embedded="embedded">
    <PageHeader
      title="产销对接"
      subtitle="按时空、价格与出价三维匹配供需意向，平台仅撮合，不担保交易"
      :crumbs="[
        { label: '首页', to: '/home' },
        { label: '气象生产', to: '/production/overview' },
        { label: '产销对接' }
      ]"
    />

    <el-card class="match-card">
          <template #header>
            <div class="card-header">
              <h2 class="card-title">AI 产销对接</h2>
              <span class="header-sub">时空 + 价格 + 出价三维匹配 · 平台仅撮合，不担保交易</span>
            </div>
          </template>

          <!-- 身份与筛选 -->
          <div class="match-controls">
            <el-radio-group v-model="myRole" @change="loadRecommend">
              <el-radio-button label="grower">我是种植户（找收购商）</el-radio-button>
              <el-radio-button label="buyer">我是经销商（找货源）</el-radio-button>
            </el-radio-group>
            <el-select v-model="filterProduct" class="mc" placeholder="全部品种" clearable filterable @change="loadRecommend">
              <el-option v-for="c in PRODUCT_OPTIONS" :key="c" :label="c" :value="c" />
            </el-select>
            <el-button :loading="loading" @click="loadRecommend">刷新匹配</el-button>
          </div>

          <el-alert
            v-if="price && price.available"
            :title="price.detail"
            type="info"
            :closable="false"
            show-icon
            class="match-alert"
          />
          <el-alert
            v-else-if="price && !price.available"
            title="当前品种暂无价格数据，匹配时无法给出报价参考"
            type="warning"
            :closable="false"
            show-icon
            class="match-alert"
          />
        </el-card>

        <!-- 匹配结果 -->
        <div v-loading="loading" class="match-body">
          <el-empty v-if="!loading && !items.length" description="暂无匹配的对面意向，换个品种或稍后再试" />

          <div v-else class="match-grid">
            <el-card v-for="it in items" :key="it.id" class="match-item">
              <div class="mi-head">
                <span class="mi-product">{{ it.product }}</span>
                <el-tag size="small" :type="it.role === 'buyer' ? 'warning' : 'success'">
                  {{ it.roleLabel }}
                </el-tag>
                <span class="mi-score">{{ it.score }}<i>分</i></span>
              </div>

              <div class="mi-meta">
                <span v-if="it.quantity">数量 {{ it.quantity }} 吨</span>
                <span v-if="it.priceExpect">报价 {{ it.priceExpect }} 元/公斤</span>
                <span>地区 {{ it.region }}</span>
                <span v-if="it.availableDate">{{ it.availableDate }} 可对接</span>
              </div>

              <div class="mi-reasons">
                <el-tag v-for="(r, i) in it.reasons" :key="i" size="small" type="info" effect="plain">{{ r }}</el-tag>
              </div>

              <div class="mi-foot">
                <el-button size="small" type="primary" plain @click="openNegotiate(it)">AI 评估报价</el-button>
                <span v-if="it.contact" class="mi-contact">联系：{{ it.contact }}</span>
              </div>
              <div v-if="it.remark" class="mi-remark">{{ it.remark }}</div>
            </el-card>
          </div>
        </div>

        <!-- 发布意向 -->
        <el-card class="match-card">
          <template #header>
            <div class="card-header">
              <h2 class="card-title">发布我的意向</h2>
              <span class="header-sub">发布后即可被对面角色匹配到</span>
            </div>
          </template>

          <div class="publish-form">
            <el-select v-model="form.role" class="pf" placeholder="我的身份">
              <el-option label="种植户（供货）" value="grower" />
              <el-option label="经销商（收购）" value="buyer" />
            </el-select>
            <el-select v-model="form.product" class="pf" placeholder="品种" filterable>
              <el-option v-for="c in PRODUCT_OPTIONS" :key="c" :label="c" :value="c" />
            </el-select>
            <el-select v-model="form.province" class="pf" placeholder="省份" @change="onProvinceChange">
              <el-option v-for="p in provinces" :key="p" :label="p" :value="p" />
            </el-select>
            <el-select v-model="form.region" class="pf" placeholder="城市" filterable>
              <el-option v-for="c in cities" :key="c.name" :label="c.name" :value="c.name" />
            </el-select>
            <el-input v-model="form.quantity" class="pf small" placeholder="数量（吨）" clearable />
            <el-input v-model="form.priceExpect" class="pf small" placeholder="期望价（元/公斤）" clearable />
            <el-date-picker
              v-model="form.availableDate"
              class="pf"
              type="date"
              placeholder="可上市/收购日期"
              value-format="YYYY-MM-DD"
              clearable
            />
            <el-input v-model="form.contact" class="pf small" placeholder="联系方式（选填）" clearable maxlength="64" />
            <el-input v-model="form.remark" class="pf wide" placeholder="备注（选填），如品质要求、付款方式" clearable maxlength="200" />
            <el-button type="primary" :loading="publishing" @click="publish">发布意向</el-button>
          </div>

          <div v-if="myIntents.length" class="my-intents">
            <div class="section-title">我的意向</div>
            <div v-for="m in myIntents" :key="m.id" class="mi-row">
              <el-tag size="small" :type="m.role === 'buyer' ? 'warning' : 'success'">
                {{ m.role === 'buyer' ? '收购' : '供货' }}
              </el-tag>
              <span class="mir-product">{{ m.product }}</span>
              <span class="mir-meta">
                {{ m.region }}<template v-if="m.quantity"> · {{ m.quantity }} 吨</template><template v-if="m.priceExpect"> · {{ m.priceExpect }} 元/公斤</template>
                <template v-if="m.availableDate"> · {{ m.availableDate }}</template>
              </span>
              <el-tag v-if="m.status === 'closed'" size="small" type="info">已撤销</el-tag>
              <el-button v-else size="small" text type="danger" @click="closeIntent(m.id)">撤销</el-button>
            </div>
          </div>
        </el-card>

        <p class="match-disclaimer">平台仅撮合供需意向并提供价格参考，不构成交易担保；请实地核验品质与履约能力。演示环境中的联系方式和意向数据均为演示用途。</p>

    <!-- AI 谈判助手 -->
    <el-dialog v-model="negotiateVisible" title="AI 报价评估" width="520px">
      <template v-if="negotiateTarget">
        <p class="neg-target">
          {{ negotiateTarget.product }} · 对方{{ negotiateTarget.role === 'buyer' ? '收购' : '供货' }}价
          <b>{{ negotiateTarget.priceExpect || '未填' }}</b> 元/公斤
        </p>
        <div v-loading="negotiating" class="neg-body">
          <div v-if="negotiateResult" class="neg-result">
            <div class="neg-meta">
              <el-tag size="small" :type="negotiateResult.source === 'llm' ? 'success' : 'info'">
                {{ negotiateResult.source === 'llm' ? '大模型生成' : '规则引擎' }}
              </el-tag>
              <el-tooltip v-if="negotiateResult.audit && !negotiateResult.audit.passed" content="部分数字未在价格数据中找到，请注意核对" placement="top">
                <el-tag size="small" type="warning">数字待核对</el-tag>
              </el-tooltip>
            </div>
            <p class="neg-text">{{ negotiateResult.advice }}</p>
            <div class="neg-facts">
              <div class="section-title">评估依据</div>
              <div v-for="(f, i) in negotiateResult.facts" :key="i" class="neg-fact">{{ f }}</div>
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <el-button @click="negotiateVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </PageShell>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import axiosInstance from '../utils/axios';
import PageShell from '../components/PageShell.vue';
import PageHeader from '../components/PageHeader.vue';
import { useCityOptions } from '../composables/useCityOptions';
import { useAuthGuard } from '../composables/useAuthGuard';

const props = defineProps<{ embedded?: boolean }>();
const embedded = computed(() => !!props.embedded);

const guard = useAuthGuard();
const { provinces, cities, loadCities, hasCity } = useCityOptions();

const PRODUCT_OPTIONS = [
  '冬小麦', '小麦', '玉米', '水稻', '大豆', '花生', '马铃薯', '甘薯', '绿豆',
  '油菜', '棉花', '甘蔗', '蔬菜', '苹果', '柑橘', '葡萄', '桃', '梨', '西瓜', '草莓'
];

const myRole = ref<'grower' | 'buyer'>('grower');
const filterProduct = ref('');
const items = ref<any[]>([]);
const price = ref<any>(null);
const loading = ref(false);

const form = ref({
  role: 'grower',
  product: '',
  province: '河北省',
  region: '',
  quantity: '',
  priceExpect: '',
  availableDate: '',
  contact: '',
  remark: ''
});
const publishing = ref(false);
const myIntents = ref<any[]>([]);

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

const loadRecommend = async () => {
  loading.value = true;
  try {
    const res: any = await axiosInstance.get('/match/recommend', {
      params: {
        role: myRole.value,
        product: filterProduct.value || undefined
      }
    });
    items.value = res.data?.items || [];
    price.value = res.data?.price || null;
  } catch {
    items.value = [];
  } finally {
    loading.value = false;
  }
};

const loadMy = async () => {
  try {
    const res: any = await axiosInstance.get('/match/my');
    myIntents.value = res.data || [];
  } catch {
    myIntents.value = [];
  }
};

const publish = async () => {
  if (!form.value.product) {
    ElMessage.warning('请选择品种');
    return;
  }
  if (!form.value.region) {
    ElMessage.warning('请选择地区');
    return;
  }
  publishing.value = true;
  try {
    await axiosInstance.post('/match/intent', {
      role: form.value.role,
      product: form.value.product,
      quantity: form.value.quantity ? Number(form.value.quantity) : undefined,
      priceExpect: form.value.priceExpect ? Number(form.value.priceExpect) : undefined,
      region: form.value.region,
      availableDate: form.value.availableDate || undefined,
      contact: form.value.contact || undefined,
      remark: form.value.remark || undefined
    });
    ElMessage.success('发布成功，已进入匹配池');
    form.value.quantity = '';
    form.value.priceExpect = '';
    form.value.remark = '';
    await Promise.all([loadMy(), loadRecommend()]);
  } catch {
    /* 拦截器已提示 */
  } finally {
    publishing.value = false;
  }
};

const closeIntent = async (id: number) => {
  try {
    await axiosInstance.post(`/match/intent/${id}/close`);
    ElMessage.success('已撤销');
    await Promise.all([loadMy(), loadRecommend()]);
  } catch {
    /* 拦截器已提示 */
  }
};

// ---- AI 谈判助手 ----
const negotiateVisible = ref(false);
const negotiating = ref(false);
const negotiateTarget = ref<any>(null);
const negotiateResult = ref<any>(null);

const openNegotiate = async (target: any) => {
  negotiateTarget.value = target;
  negotiateResult.value = null;
  negotiateVisible.value = true;
  if (!target.priceExpect) {
    ElMessage.info('对方未填报报价，将按品种行情给参考');
  }
  negotiating.value = true;
  try {
    const res: any = await axiosInstance.post(
      '/match/negotiate',
      { product: target.product, priceExpect: target.priceExpect || undefined },
      { timeout: 120000 }
    );
    negotiateResult.value = res.data;
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '评估失败');
    negotiateVisible.value = false;
  } finally {
    negotiating.value = false;
  }
};

onMounted(async () => {
  if (!guard()) return;
  await Promise.all([fetchCities(), loadMy()]);
  await loadRecommend();
});
</script>

<style scoped>
.match-card {
  margin-bottom: var(--space-block);
}

.match-controls {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
}

.mc {
  width: 160px;
}

.match-alert {
  margin-top: 12px;
}

.match-body {
  min-height: 120px;
  margin-bottom: var(--space-5);
}

.match-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 14px;
}

.mi-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mi-product {
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
  color: var(--text-primary);
}

.mi-score {
  margin-left: auto;
  font-size: var(--fs-xl);
  font-weight: var(--fw-semibold);
  color: var(--brand-blue);
}

.mi-score i {
  font-size: var(--fs-xs);
  font-style: normal;
  color: var(--text-secondary);
  margin-left: 2px;
}

.mi-meta {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-size: var(--fs-sm);
  color: var(--text-regular);
  margin: 10px 0;
}

.mi-reasons {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.mi-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}

.mi-contact {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  margin-left: auto;
}

.mi-remark {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  margin-top: 8px;
  line-height: 1.6;
}

.publish-form {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
}

.pf {
  width: 160px;
}

.pf.small {
  width: 130px;
}

.pf.wide {
  width: 260px;
}

.my-intents {
  margin-top: 18px;
}

.mi-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-top: 1px dashed var(--border-color);
  font-size: var(--fs-sm);
}

.mir-product {
  font-weight: var(--fw-semibold);
  color: var(--text-primary);
}

.mir-meta {
  color: var(--text-secondary);
  flex: 1;
}

.section-title {
  font-size: var(--fs-base);
  font-weight: var(--fw-semibold);
  color: var(--text-primary);
  margin: 16px 0 8px;
}

.match-disclaimer {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  text-align: center;
  margin: 0 0 var(--space-5);
  line-height: 1.7;
}

.neg-target {
  font-size: var(--fs-sm);
  color: var(--text-regular);
  margin: 0 0 12px;
}

.neg-body {
  min-height: 80px;
}

.neg-meta {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.neg-text {
  font-size: var(--fs-sm);
  color: var(--text-regular);
  line-height: 1.9;
  margin: 0;
  white-space: pre-wrap;
}

.neg-facts {
  margin-top: 14px;
}

.neg-fact {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  line-height: 1.8;
}

@media (max-width: 768px) {
  .mc,
  .pf,
  .pf.small,
  .pf.wide {
    width: 100%;
  }

  .match-grid {
    grid-template-columns: 1fr;
  }
}
</style>
