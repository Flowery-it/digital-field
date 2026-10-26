<template>
  <el-card class="ai-card">
    <template #header>
      <div class="ai-header">
        <h2 class="card-title">AI 农事顾问</h2>
        <div class="ai-header-right">
          <!-- 模型切换：括号内为同网关实测耗时，现场可当场对比不同模型 -->
          <el-select
            v-if="models.length"
            v-model="selectedModel"
            size="small"
            class="ai-model-select"
            :disabled="loading"
            placeholder="选择模型"
          >
            <el-option
              v-for="m in models"
              :key="m.id"
              :label="m.label"
              :value="m.id"
            />
          </el-select>
          <el-tag v-if="status" :type="status.configured ? 'success' : 'warning'" size="small" effect="light">
            {{ status.configured ? '大模型增强层已接入' : '规则引擎保底运行中' }}
          </el-tag>
        </div>
      </div>
    </template>

    <p class="ai-desc">
      回答会带上服务端实况上下文：{{ city || '未指定城市' }} 的 4 小时缓存天气、34 条农事规则库的命中结果，
      以及「我的关注」中的品种报价。右上角可切换模型；
      未接入大模型时自动由本地规则引擎作答，功能不中断。
    </p>

    <!-- 快捷问题：降低首次使用门槛，演示时不用手打 -->
    <div class="ai-quick">
      <el-button
        v-for="q in quickQuestions"
        :key="q"
        size="small"
        text
        type="primary"
        :disabled="loading"
        @click="ask(q)"
      >
        {{ q }}
      </el-button>
    </div>

    <!-- 拍照识病：多模态入口（Agents-A1 优先，失败自动降级视觉模型） -->
    <div class="ai-vision">
      <div class="av-row">
        <el-select v-model="visionCrop" class="av-crop" size="small" placeholder="作物（可选，缩小判断范围）" filterable clearable>
          <el-option v-for="c in VISION_CROPS" :key="c" :label="c" :value="c" />
        </el-select>
        <el-upload
          class="av-upload"
          :auto-upload="false"
          :show-file-list="false"
          accept="image/jpeg,image/png,image/webp"
          :on-change="onVisionPick"
        >
          <el-button size="small" :loading="visionLoading" :disabled="loading">
            <el-icon><Camera /></el-icon>
            上传叶片/果实照片
          </el-button>
        </el-upload>
        <el-tag size="small" type="info" effect="plain">拍照识病</el-tag>
      </div>

      <div v-if="visionPreview" class="av-preview">
        <img :src="visionPreview" alt="待识别的作物照片" />
        <div class="av-preview-actions">
          <el-button size="small" type="primary" :loading="visionLoading" @click="submitVision">开始识别</el-button>
          <el-button size="small" @click="clearVision">清除</el-button>
        </div>
      </div>

      <div v-if="visionLoading" class="ai-thinking" role="status">
        <span class="ai-thinking-text">正在分析照片（Agents-A1 视觉模型，通常需 10—60 秒）…</span>
      </div>

      <div v-else-if="visionError" class="state-error-inline" role="alert">
        <el-icon><WarningFilled /></el-icon>
        <span>{{ visionError }}</span>
      </div>

      <div v-else-if="visionResult" class="ai-answer">
        <div class="ai-answer-head">
          <span class="ai-answer-title">拍照识别结果</span>
          <el-tag :type="visionResult.pest ? 'danger' : 'warning'" size="small" effect="plain">
            {{ visionResult.pest ? visionResult.pest.name : '未能确定' }}
          </el-tag>
          <el-tooltip content="上次识别结果已留存：切换到其他页面再返回仍会展示，再次上传即重新识别" placement="top">
            <el-tag size="small" type="info" effect="plain">已留存</el-tag>
          </el-tooltip>
          <span v-if="visionResult.model" class="ai-meta">{{ visionResult.model }}</span>
        </div>
        <p v-if="visionResult.pest" class="av-drug">
          建议用药：<b>{{ visionResult.pest.chemical }} {{ visionResult.pest.dose }} {{ visionResult.pest.doseUnit }}</b>，{{ visionResult.pest.action }}
        </p>
        <!-- 免责声明已包含在 visionResult.text 末尾（visionService.composeText 统一追加），此处不再重复渲染 -->
        <div class="ai-body">{{ visionResult.text }}</div>
      </div>
    </div>

    <div class="ai-input">
      <el-input
        v-model="question"
        placeholder="例如：未来三天我这边的苹果要不要提前采收？"
        maxlength="200"
        show-word-limit
        :disabled="loading"
        @keyup.enter="ask()"
      />
      <el-button type="primary" :loading="loading" :disabled="!question.trim()" @click="ask()">
        提问
      </el-button>
    </div>

    <div v-if="loading" class="ai-thinking" role="status">
      <span class="ai-thinking-text">
        {{ selectedEntry && selectedEntry.reasoning
          ? `推理型模型正在思考（已等待 ${elapsed}s，这类模型通常需 1 分钟以上）…`
          : `正在生成回答（${selectedEntry ? selectedEntry.label : '大模型'}，已等待 ${elapsed}s）…` }}
      </span>
    </div>

    <!-- 错误态：接口不可用时明确告知，不静默失败 -->
    <div v-if="error" class="state-error-inline" role="alert">
      <el-icon><WarningFilled /></el-icon>
      <span>{{ error }}</span>
    </div>

    <div v-else-if="result" class="ai-answer">
      <div class="ai-answer-head">
        <span class="ai-answer-title">回答</span>
        <!-- 只呈现耗时与来源类型，不展示模型名等实现细节 -->
        <el-tag :type="result.source === 'llm' ? 'success' : 'info'" size="small" effect="plain">
          {{ result.source === 'llm' ? '大模型生成' : '本地农事规则引擎' }}
        </el-tag>
        <el-tooltip content="上次问答已留存：切换到其他页面再返回仍会展示，再次提问即重新生成" placement="top">
          <el-tag size="small" type="info" effect="plain">已留存</el-tag>
        </el-tooltip>
        <span v-if="result.latencyMs" class="ai-meta">耗时 {{ (result.latencyMs / 1000).toFixed(1) }}s</span>
      </div>

      <p v-if="result.fellBack && result.attempted && result.attempted.length" class="ai-fallback">
        响应较慢，已自动切换到备用模型，保证现场一定有回答。
      </p>
      <p v-else-if="result.fallbackReason" class="ai-fallback">{{ result.fallbackReason }}</p>

      <!-- 数字一致性校验：AI 输出不当可信事实，待核对项直接标出 -->
      <div v-if="result.audit" class="ai-audit" :class="result.audit.passed ? 'pass' : 'warn'">
        <el-icon><CircleCheckFilled v-if="result.audit.passed" /><WarningFilled v-else /></el-icon>
        <span v-if="result.audit.passed">
          数字一致性校验通过：回答中的 {{ result.audit.checked }} 个数字均可在实况数据中找到对应。
        </span>
        <span v-else>
          数字一致性校验：{{ result.audit.checked }} 个数字中有
          <strong>{{ result.audit.unverified.length }}</strong> 个未在实况数据中找到
          （{{ result.audit.unverified.join('、') }}），请以「回答依据」中的数据为准。
        </span>
      </div>

      <div class="ai-body">{{ result.answer }}</div>

      <!-- 本次回答所依据的实况数据，让答案可核对 -->
      <div v-if="result.context" class="ai-context">
        <span class="ai-context-label">回答依据</span>
        <el-tag
          v-if="result.context.city"
          size="small"
          type="info"
          effect="plain"
        >
          {{ result.context.city }}
        </el-tag>
        <el-tag
          v-if="result.context.weather && result.context.weather.summary"
          size="small"
          type="info"
          effect="plain"
        >
          {{ result.context.weather.summary.days }} 天：{{ result.context.weather.summary.tempMin }}~{{ result.context.weather.summary.tempMax }}℃ ·
          降水 {{ result.context.weather.summary.totalPrecip }}mm
        </el-tag>
        <el-tag size="small" type="warning" effect="plain">
          规则命中 {{ result.context.advice.length }} 条
        </el-tag>
        <el-tag
          v-for="p in result.context.prices"
          :key="p.productId"
          size="small"
          type="success"
          effect="plain"
        >
          {{ p.name }} {{ p.price }} 元/公斤
        </el-tag>
      </div>

      <p v-if="result.disclaimer" class="ai-disclaimer">{{ result.disclaimer }}</p>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { WarningFilled, CircleCheckFilled, Camera } from '@element-plus/icons-vue';
import axiosInstance from '../utils/axios';
import { useUserStore } from '../stores/userStore';
import { loadFocusProductIds } from '../utils/focusConfig';

const props = defineProps<{
  city?: string;
}>();

const userStore = useUserStore();

const question = ref('');
const loading = ref(false);
const elapsed = ref(0);
const error = ref('');
const result = ref<any>(null);
const status = ref<any>(null);
const models = ref<any[]>([]);
const selectedModel = ref('');
let elapsedTimer: ReturnType<typeof setInterval> | null = null;

const MODEL_KEY = 'ai_model';

const selectedEntry = computed(() => models.value.find(m => m.id === selectedModel.value) || null);

const quickQuestions = [
  '未来三天我这边最需要注意的是什么？',
  '天气对果蔬采摘有什么影响？',
  '我关注的品种现在价格怎么样？'
];

// 可选模型清单（白名单 + 实测耗时），选择结果记在本地，刷新后保持
const loadModels = async () => {
  try {
    const res: any = await axiosInstance.get('/ai/models');
    models.value = res.data.models || [];
    const saved = localStorage.getItem(MODEL_KEY);
    const exists = models.value.some(m => m.id === saved);
    selectedModel.value = exists ? String(saved) : (res.data.defaultModel || '');
  } catch {
    /* 清单拿不到时下拉不显示，不影响问答 */
  }
};

watch(selectedModel, (v) => {
  if (v) localStorage.setItem(MODEL_KEY, v);
});

// 「我的关注」中的品种（与 MyFocusView 共用同一份 localStorage 配置，
// 经 focusConfig 统一读写），作为问答上下文，让回答能结合用户自己的种植计划
const focusProducts = computed<string[]>(() =>
  loadFocusProductIds(userStore.username, 5)
);

const loadStatus = async () => {
  try {
    const res: any = await axiosInstance.get('/ai/status');
    status.value = res.data;
  } catch {
    /* 状态拿不到不影响问答，标签区保持隐藏 */
  }
};

// 读取该城市上次留存的问答（切页再返回不丢、不重复调大模型）。
// 新提问会覆盖旧记录——即用户主动触发重新生成。
const loadLast = async () => {
  try {
    const res: any = await axiosInstance.get('/ai/chat/last', { params: { city: props.city || undefined } });
    if (res.data?.found) {
      result.value = { ...res.data.payload, persisted: true };
    }
  } catch {
    /* 无留存或读取失败：保持空白，用户可随时提问 */
  }
};

const ask = async (preset?: string) => {
  const text = (preset ?? question.value).trim();
  if (!text || loading.value) return;

  loading.value = true;
  error.value = '';
  elapsed.value = 0;
  // 按所选模型标定的超时放宽（axios 全局仅 15s）；再叠加降级链可能多花的时间
  const budget = (selectedEntry.value && selectedEntry.value.timeout
    ? selectedEntry.value.timeout
    : 60000) + 15000;
  elapsedTimer = setInterval(() => { elapsed.value += 1; }, 1000);

  try {
    const res: any = await axiosInstance.post(
      '/ai/chat',
      {
        question: text,
        city: props.city || undefined,
        productIds: focusProducts.value,
        model: selectedModel.value || undefined
      },
      { timeout: budget }
    );
    result.value = res.data;
    question.value = '';
  } catch (e: any) {
    error.value = e?.response?.data?.message || '问答服务暂不可用，请稍后重试';
    ElMessage.error(error.value);
  } finally {
    loading.value = false;
    if (elapsedTimer) {
      clearInterval(elapsedTimer);
      elapsedTimer = null;
    }
  }
};

// ---- 拍照识病（M7，多模态）----
const VISION_CROPS = [
  '水稻', '小麦', '玉米', '大豆', '花生', '马铃薯', '棉花',
  '黄瓜', '大白菜', '茄子', '苹果', '柑橘', '葡萄', '桃', '果树', '蔬菜'
];
const visionCrop = ref('');
const visionPreview = ref('');
const visionBase64 = ref('');
const visionMime = ref('image/jpeg');
const visionLoading = ref(false);
const visionError = ref('');
const visionResult = ref<any>(null);
const visionDisclaimer = ref('');

// 读取上次留存的识别结果（只读，不调模型）
const loadVisionLast = async () => {
  try {
    const res: any = await axiosInstance.get('/ai/vision/last', { params: { crop: visionCrop.value || undefined } });
    if (res.data?.found) {
      visionResult.value = res.data.payload;
      visionDisclaimer.value = 'AI 拍照识别仅供参考，不能替代专业检疫与农技人员诊断；用药请按标签说明并咨询当地农技指导。';
    }
  } catch {
    /* 无留存时静默 */
  }
};

const onVisionPick = (file: any) => {
  visionError.value = '';
  const raw = file && file.raw;
  if (!raw) return;
  if (raw.size > 6 * 1024 * 1024) {
    visionError.value = '图片过大（超过 6MB），请压缩后重试';
    return;
  }
  visionMime.value = raw.type || 'image/jpeg';
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = String(reader.result || '');
    visionPreview.value = dataUrl;
    // 存纯 base64（去掉 data: 前缀），由服务端自行拼装
    visionBase64.value = dataUrl.split(',')[1] || '';
  };
  reader.onerror = () => {
    visionError.value = '照片读取失败，请重试';
  };
  reader.readAsDataURL(raw);
};

const clearVision = () => {
  visionPreview.value = '';
  visionBase64.value = '';
  visionError.value = '';
};

const submitVision = async () => {
  if (!visionBase64.value) {
    ElMessage.warning('请先选择照片');
    return;
  }
  visionLoading.value = true;
  visionError.value = '';
  try {
    const res: any = await axiosInstance.post(
      '/ai/vision',
      { imageBase64: visionBase64.value, mime: visionMime.value, crop: visionCrop.value || undefined },
      { timeout: 240000 }
    );
    if (res.data?.found) {
      visionResult.value = res.data.payload;
      visionDisclaimer.value = res.data.disclaimer || '';
      ElMessage.success('识别完成，结果已留存');
    }
  } catch (e: any) {
    visionError.value = e?.response?.data?.message || '识别失败，请稍后重试';
  } finally {
    visionLoading.value = false;
  }
};

onMounted(() => {
  loadStatus();
  loadModels();
  loadLast();
  loadVisionLast();
});
</script>

<style scoped>
/* 拍照识病 */
.ai-vision {
  margin-bottom: var(--space-3);
  padding: var(--space-3);
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-md);
}

.av-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.av-crop {
  width: 200px;
}

.av-preview {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  margin-top: var(--space-3);
}

.av-preview img {
  width: 140px;
  height: 140px;
  object-fit: cover;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
}

.av-preview-actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.av-drug {
  font-size: var(--fs-sm);
  color: var(--text-regular);
  line-height: var(--lh-relaxed);
  margin: 0 0 var(--space-2);
  padding: 8px 12px;
  background: var(--warning-soft);
  border-radius: var(--radius-md);
}

.av-disclaimer {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  margin: var(--space-2) 0 0;
}

/* 错误态修饰类（state-error-inline）已上提全局 style.css */

.ai-card {
  margin-bottom: var(--space-block);
}

.ai-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.ai-header-right {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.ai-model-select {
  width: 260px;
}

@media (max-width: 768px) {
  .ai-model-select {
    width: 100%;
  }
}

/* .card-title 已上提全局 style.css */

.ai-desc {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  line-height: 1.7;
  margin: 0 0 var(--space-3);
}

.ai-quick {
  display: flex;
  gap: var(--space-1);
  flex-wrap: wrap;
  margin-bottom: var(--space-2);
}

.ai-input {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  flex-wrap: wrap;
}

/* 提问输入框弹性占位，窄屏与按钮换行后仍撑满一行 */
.ai-input :deep(.el-input) {
  flex: 1;
  min-width: 200px;
}

.ai-thinking {
  margin-top: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--surface-soft);
  border: 1px solid var(--brand-soft-border);
  border-radius: var(--radius-md);
}

.ai-thinking-text {
  font-size: var(--fs-sm);
  color: var(--brand-blue);
}

.ai-answer {
  margin-top: var(--space-4);
  padding: var(--space-4);
  background: var(--surface-soft);
  border: 1px solid var(--brand-soft-border);
  border-radius: var(--radius-md);
}

.ai-answer-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
  margin-bottom: var(--space-2);
}

.ai-answer-title {
  font-weight: 700;
  color: var(--text-primary);
}

.ai-meta {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
}

.ai-fallback {
  font-size: var(--fs-xs);
  color: var(--warning-color);
  margin: 0 0 var(--space-2);
}

.ai-audit {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  font-size: var(--fs-xs);
  line-height: 1.6;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  margin-bottom: var(--space-2);
}

.ai-audit.pass {
  color: var(--success-color);
  background: var(--success-soft);
  border: 1px solid var(--success-soft-border);
}

.ai-audit.warn {
  color: var(--warning-color);
  background: rgba(184, 130, 48, 0.1);
}

.ai-body {
  font-size: var(--fs-md);
  line-height: var(--lh-relaxed);
  color: var(--text-primary);
  /* 保留大模型/规则引擎输出中的换行与编号结构 */
  white-space: pre-wrap;
  word-break: break-word;
}

.ai-context {
  display: flex;
  gap: var(--space-1);
  flex-wrap: wrap;
  align-items: center;
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px dashed var(--border-color);
}

.ai-context-label {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
}

.ai-disclaimer {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  margin: var(--space-3) 0 0;
  line-height: 1.6;
}
</style>
