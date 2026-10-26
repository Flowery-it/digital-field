<template>
  <!-- 生产总览：作为 /production 的子面板渲染（embedded），外壳与页头由父级提供；
       也支持独立访问（非 embedded 时 PageShell 自行补齐页头与外壳）。 -->
  <PageShell :embedded="embedded">
      <PageHeader
        title="生产总览"
        subtitle="今日天气、农事风险与关注品种价格，一屏掌握今天该做什么"
        :crumbs="[{ label: '首页', to: '/home' }, { label: '气象生产', to: '/production/overview' }, { label: '生产总览' }]"
      >
        <template #meta>
          <el-tag v-if="snapshotMeta?.cached" type="info" size="small">
            今日快照 · 生成于 {{ snapshotTime }}
          </el-tag>
          <el-tag v-else-if="snapshotMeta" type="success" size="small">
            刚刚重新生成 · 耗时 {{ formatMs(snapshotMeta.durationMs) }}
          </el-tag>
          <el-button size="small" text type="primary" :loading="refreshing" @click="refreshSnapshot">
            重新生成
          </el-button>
        </template>
      </PageHeader>

      <el-alert
        v-if="snapshotError"
        :title="snapshotError"
        type="error"
        show-icon
        :closable="false"
        class="dash-alert"
      >
        <template #default>
          <el-button size="small" type="danger" plain :loading="refreshing" @click="refreshSnapshot">重试生成</el-button>
        </template>
      </el-alert>

      <div v-else-if="loading" class="ai-brief muted">
        <el-icon class="is-loading"><Loading /></el-icon> 生产总览加载中…
      </div>

      <template v-else-if="snapshot">
        <!-- 今日农事总结（AI 日报，快照留存） -->
        <el-card class="dash-card summary-card">
          <template #header>
            <div class="card-header">
              <h2 class="card-title">今日农事总结</h2>
              <span class="header-sub">规则引擎保底 + 大模型增强</span>
            </div>
          </template>
          <div v-if="snapshot.brief" class="ai-brief">{{ snapshot.brief.content }}</div>
          <div v-else class="ai-brief muted">
            今日农事总结尚未生成（生成过程会调用大模型，需数十秒）。
            <el-button size="small" text type="primary" :loading="briefLoading" @click="genBrief">立即生成农事日报</el-button>
            后即可在此常驻展示。
          </div>
          <div class="quick-links">
            <el-button size="small" @click="router.push('/production/fertilize')">施肥打药建议</el-button>
            <el-button size="small" @click="router.push('/production/yield')">产量预估</el-button>
            <el-button size="small" @click="router.push('/production/recommend')">智能荐种</el-button>
            <el-button size="small" @click="router.push('/production/match')">产销对接</el-button>
            <el-button size="small" @click="router.push('/my-focus')">我的农场</el-button>
          </div>
        </el-card>

        <el-alert
          v-if="!snapshot.weather.available"
          :title="snapshot.weather.notice || '天气数据暂不可用'"
          type="warning"
          show-icon
          :closable="false"
          class="dash-alert"
        />

        <!-- 关键指标：四卡并排，数值层级一致 -->
        <div class="stat-grid">
          <el-card class="stat-card">
            <span class="stat-label">今日天气 · {{ snapshot.region }}</span>
            <template v-if="snapshot.weather.today">
              <span class="stat-value">{{ snapshot.weather.today.tempMin }}~{{ snapshot.weather.today.tempMax }}℃</span>
              <span class="stat-sub">
                {{ snapshot.weather.today.textDay }} · 降水 {{ snapshot.weather.today.precip }}mm
                <template v-if="snapshot.weather.stale"> · 上游异常，展示缓存</template>
              </span>
            </template>
            <span v-else class="stat-sub">暂无数据</span>
          </el-card>

          <el-card class="stat-card">
            <span class="stat-label">农事风险</span>
            <template v-if="snapshot.advice.count > 0">
              <span class="stat-value" :class="snapshot.advice.maxSeverity >= 3 ? 'danger' : 'warn'">{{ snapshot.advice.count }}</span>
              <span class="stat-sub">条规则命中（最高严重度 {{ snapshot.advice.maxSeverity }}）</span>
            </template>
            <template v-else>
              <span class="stat-value ok">0</span>
              <span class="stat-sub">{{ snapshot.advice.notice || '天气平稳，无风险命中' }}</span>
            </template>
          </el-card>

          <el-card class="stat-card">
            <span class="stat-label">我的作物</span>
            <span class="stat-value">{{ snapshot.crops.length }}</span>
            <span class="stat-sub">{{ snapshot.crops.length ? snapshot.crops.map((c: any) => c.cropType).slice(0, 3).join('、') : '尚未登记' }}</span>
          </el-card>

          <el-card class="stat-card clickable" @click="router.push('/my-focus')">
            <span class="stat-label">AI 助农累计收益</span>
            <span class="stat-value">¥{{ snapshot.benefit?.total ?? 0 }}</span>
            <span class="stat-sub">{{ snapshot.benefit?.count ?? 0 }} 笔估算记录 · 点击查看台账</span>
          </el-card>
        </div>

        <el-card class="dash-card" v-if="snapshot.advice.items.length">
          <template #header>
            <div class="card-header">
              <h2 class="card-title">今日农事提醒</h2>
              <span class="header-sub">规则引擎命中（快照留存）</span>
            </div>
          </template>
          <div class="advice-list">
            <div v-for="a in snapshot.advice.items" :key="a.ruleId" class="advice-item" :class="'sev' + a.severity">
              <el-tag size="small" type="warning">{{ a.riskLabel }}</el-tag>
              <span class="advice-product">{{ a.productName }}</span>
              <span class="advice-stage">{{ a.growthStage }}</span>
              <span class="advice-text">{{ a.adviceText }}</span>
            </div>
          </div>
        </el-card>
      </template>
  </PageShell>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Loading } from '@element-plus/icons-vue';
import axiosInstance from '../utils/axios';
import { useUserStore } from '../stores/userStore';
import PageShell from '../components/PageShell.vue';
import PageHeader from '../components/PageHeader.vue';

const props = defineProps<{ embedded?: boolean }>();
const embedded = computed(() => !!props.embedded);

const router = useRouter();
const userStore = useUserStore();

// ---- 快照状态机：loading → (快照 | 错误) ----
const loading = ref(true);
const refreshing = ref(false);
const briefLoading = ref(false);
const snapshot = ref<any>(null);
const snapshotMeta = ref<any>(null);
const snapshotError = ref('');

const formatMs = (ms?: number | null) => (ms == null ? '—' : `${(ms / 1000).toFixed(1)} 秒`);

const snapshotTime = computed(() => {
  const t = snapshotMeta.value?.generatedAt;
  if (!t) return '—';
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('zh-CN', { hour12: false });
});

const applySnapshot = (data: any) => {
  snapshotMeta.value = data;
  if (data?.status === 'ok') {
    snapshot.value = data.payload;
    snapshotError.value = '';
  } else {
    snapshot.value = null;
    snapshotError.value = data?.errorMessage
      ? `生产总览生成失败：${data.errorMessage}`
      : '生产总览生成失败，请点击「重试生成」';
  }
};

// 读取今日快照（命中即返回，毫秒级；当天无快照时后端即时生成一次并落库）
const loadSnapshot = async () => {
  loading.value = true;
  snapshotError.value = '';
  try {
    const res: any = await axiosInstance.get('/dashboard/snapshot', { timeout: 60000 });
    applySnapshot(res.data);
  } catch (err: any) {
    snapshotError.value = '生产总览读取失败，请检查网络后重试';
  } finally {
    loading.value = false;
  }
};

// 手动刷新：强制重新生成（后端覆盖当日快照），并给出成功/失败反馈
const refreshSnapshot = async () => {
  refreshing.value = true;
  try {
    const res: any = await axiosInstance.post('/dashboard/snapshot/refresh', {}, { timeout: 60000 });
    applySnapshot(res.data);
    if (res.data?.status === 'ok') {
      ElMessage.success(`生产总览已重新生成（耗时 ${formatMs(res.data.durationMs)}）`);
    } else {
      ElMessage.error('重新生成失败，请稍后重试');
    }
  } catch {
    snapshotError.value = '重新生成失败，请稍后重试';
    ElMessage.error('重新生成失败，请稍后重试');
  } finally {
    refreshing.value = false;
  }
};

// 农事日报为「慢操作」（需调大模型），仅在用户显式点击时触发，不拖慢看板首屏。
// 关键：POST /refresh 会把日报**持久化**到 advisory_push，随后的快照刷新才能读到它——
// 此前用 GET 生成（不落库），刷新快照后刚生成的总结反而消失，就是这个原因。
const genBrief = async () => {
  briefLoading.value = true;
  try {
    const res: any = await axiosInstance.post('/agro/daily-brief/refresh', {}, { timeout: 200000 });
    if (res.data?.found) {
      ElMessage.success('农事日报已生成并留存');
      await refreshSnapshot();
    } else {
      ElMessage.info('暂无作物档案，请先到「我的关注 → 我的农场」登记作物');
    }
  } catch {
    ElMessage.error('农事日报生成失败');
  } finally {
    briefLoading.value = false;
  }
};


onMounted(async () => {
  userStore.initFromLocalStorage();
  if (!userStore.isLoggedIn) {
    router.push('/login');
    return;
  }
  await loadSnapshot();
});
</script>

<style scoped>
/* 外壳（页头 / 主内容 / id 锚点）由 PageShell 提供，
   stat-grid / stat-card / stat-label / stat-value / stat-sub / ai-brief 走全局 */

.dash-card {
  margin-bottom: var(--space-block);
}

.dash-alert {
  margin-bottom: var(--space-4);
}

/* 今日农事总结：整卡作为首屏主结论，段落行距放宽便于阅读 */
.summary-card :deep(.el-card__body) {
  padding-top: var(--space-5);
}

.advice-list {
  display: flex;
  flex-direction: column;
}

.advice-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
  font-size: var(--fs-sm);
  padding: var(--space-2) 0;
  border-top: 1px dashed var(--border-color);
}

.advice-item:first-of-type {
  border-top: none;
}

.advice-product {
  font-weight: var(--fw-semibold);
  color: var(--text-primary);
}

.advice-stage {
  color: var(--text-secondary);
}

.advice-text {
  color: var(--text-regular);
  flex: 1;
  min-width: 200px;
}

/* AI 日报正文：长段落放宽行距，弱化标签感 */
.ai-brief {
  font-size: var(--fs-sm);
  color: var(--text-regular);
  line-height: var(--lh-relaxed);
  white-space: pre-wrap;
}

.ai-brief.muted {
  color: var(--text-secondary);
}

.quick-links {
  margin-top: var(--space-4);
  padding-top: var(--space-4);
  border-top: 1px dashed var(--border-color);
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}
</style>
