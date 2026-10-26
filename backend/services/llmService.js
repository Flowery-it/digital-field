/**
 * 大模型接入服务（增强层）
 * ========================
 *
 * 通过 OpenAI 兼容协议对接多家大模型，provider 由环境变量切换：
 *   intern    书生·浦语 discovery-api 多模型网关（当前使用，11 个模型）
 *   doubao    豆包（火山方舟）—— 新用户有免费额度
 *   deepseek  DeepSeek —— 国内直连，新用户有免费额度
 *   qwen      通义千问（阿里百炼兼容模式）—— 新用户有免费额度
 *   ollama    本地 Ollama —— 完全免费、无需 Key、离线可用
 *   openai    任意 OpenAI 兼容端点（baseURL + model 自行指定）
 *
 * 设计原则：
 *   1. **Key 可空**：Ollama 等本地端点不需要 Key，未配置时不是报错而是「未配置」状态；
 *   2. **不落库**：本服务只做无状态转发，不写入任何数据库；
 *   3. **失败可降级**：调用方（routes/ai.js）捕获异常后回退本地规则引擎；
 *   4. **可切模型**：网关内有多个模型，可在请求中指定（仅限白名单），
 *      每个模型带实测耗时标注，便于现场演示时按需切换；
 *   5. **代理规避**：禁用 axios 自动读取 HTTP_PROXY/HTTPS_PROXY，避免 https 请求被降级。
 */

const axios = require('axios');

// 网关内可选模型清单。
// maxTokens / timeout 按 2026-10-16 实测标定：思维链重的模型必须给足输出预算，否则正文会被截空。
const INTERN_MODELS = [
  { id: 'Atria-Dawn', label: 'Atria-Dawn', note: '约 4 秒 · 表达口语化、动作具体', maxTokens: 2000, timeout: 60000 },
  { id: 'glm-5.3', label: 'glm-5.3', note: '约 7 秒 · 依据最完整（实测正文最长）', maxTokens: 2000, timeout: 60000 },
  { id: 'qwen3.8-27b', label: 'qwen3.8-27b', note: '约 5 秒 · 结论前置、结构清晰', maxTokens: 3000, timeout: 60000 },
  { id: 'deepseek-v4-flash-0731', label: 'deepseek-v4-flash', note: '约 11 秒 · 稳定、条理分明', maxTokens: 2000, timeout: 60000 },
  { id: 'deepseek-v4-pro-0813', label: 'deepseek-v4-pro', note: '约 16 秒 · 深度版', maxTokens: 4000, timeout: 90000 },
  { id: 'minimax-m3', label: 'minimax-m3', note: '约 17 秒 · 无思维链开销', maxTokens: 4000, timeout: 90000 },
  { id: 'kimi-k2.6', label: 'kimi-k2.6', note: '约 24 秒 · 思维链偏重', maxTokens: 6000, timeout: 90000 },
  {
    id: 'intern-s2', label: 'intern-s2', note: '90 秒起、波动极大 · 仅录制用',
    reasoning: true, maxTokens: 12000, timeout: 180000
  },
  {
    id: 'Agents-A1', label: 'Agents-A1', note: '约 176 秒 · Agent 型、总 token 破万',
    maxTokens: 16000, timeout: 240000
  }
];

const PROVIDERS = {
  intern: {
    label: '书生·浦语（InternLM 多模型网关）',
    baseUrl: 'https://discovery-api.intern-ai.org.cn/v1',
    defaultModel: 'Atria-Dawn',
    needKey: true,
    // 保留兜底：默认模型 60 秒未返回时自动切换，界面会如实标注
    defaultFallback: 'deepseek-v4-flash-0731',
    defaultMaxTokens: 2000,
    defaultTimeout: 60000
  },
  doubao: {
    label: '豆包（火山方舟）',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModel: '',              // 火山方舟按「推理接入点 ID」填写，从控制台复制
    needKey: true
  },
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    needKey: true
  },
  qwen: {
    label: '通义千问（百炼）',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    needKey: true
  },
  ollama: {
    label: 'Ollama 本地模型',
    baseUrl: 'http://127.0.0.1:11434/v1',
    defaultModel: 'qwen2.5:1.5b-instruct',
    needKey: false
  },
  openai: {
    label: 'OpenAI 兼容接口',
    baseUrl: '',
    defaultModel: '',
    needKey: true
  }
};

const FREE_HINT = [
  '书生·浦语 discovery-api 网关（当前使用）：一个 Key 打通 intern-s2 / deepseek-v4 / qwen3.8 / glm-5.3 / kimi 等模型',
  '豆包（火山方舟）：控制台创建应用后自带免费试用额度',
  'DeepSeek：平台注册即赠免费额度，接口与 OpenAI 完全兼容',
  '通义千问（百炼）：新用户赠免费 token，有效期内可跑完整演示',
  'Ollama 本地模型：ollama pull qwen2.5:1.5b-instruct，完全免费、离线、无需 Key'
];

function splitList(v) {
  return String(v || '').split(',').map(s => s.trim()).filter(Boolean);
}

function resolveConfig() {
  const provider = (process.env.AI_PROVIDER || '').trim().toLowerCase();
  const preset = PROVIDERS[provider] || null;
  const apiKey = (process.env.AI_API_KEY || '').trim();
  const baseUrl = (process.env.AI_BASE_URL || (preset ? preset.baseUrl : '')).trim().replace(/\/+$/, '');
  const model = (process.env.AI_MODEL || (preset ? preset.defaultModel : '')).trim();
  const needKey = preset ? preset.needKey : true;

  const fallbackModels = splitList(process.env.AI_FALLBACK_MODELS);
  const maxTokens = parseInt(process.env.AI_MAX_TOKENS, 10) || (preset && preset.defaultMaxTokens) || 2000;
  const timeout = parseInt(process.env.AI_TIMEOUT_MS, 10) || (preset && preset.defaultTimeout) || 60000;
  const fallbackTimeout = parseInt(process.env.AI_FALLBACK_TIMEOUT_MS, 10) || 30000;

  let reason = '';
  if (!provider) {
    reason = '未配置 AI_PROVIDER';
  } else if (!preset) {
    reason = `AI_PROVIDER 取值无效（支持：${Object.keys(PROVIDERS).join(' / ')}）`;
  } else if (!baseUrl) {
    reason = '未配置大模型地址（AI_BASE_URL）';
  } else if (!model) {
    reason = '未配置模型名（AI_MODEL）';
  } else if (needKey && !apiKey) {
    reason = '未配置 API Key（AI_API_KEY）';
  }

  return {
    provider: provider || null,
    label: preset ? preset.label : '未配置',
    baseUrl,
    model,
    apiKey,
    needKey,
    maxTokens,
    timeout,
    fallbackModels,
    fallbackTimeout,
    configured: !reason,
    reason
  };
}

/**
 * 当前 provider 下允许选择的模型清单（白名单，防止任意模型被调用）。
 * 附加项：AI_ALLOWED_MODELS 里显式追加的模型。
 */
function availableModels() {
  const cfg = resolveConfig();
  let list = [];

  if (cfg.provider === 'intern') {
    list = INTERN_MODELS.slice();
  } else if (cfg.model) {
    list = [{ id: cfg.model, label: cfg.model, note: '当前模型', maxTokens: cfg.maxTokens, timeout: cfg.timeout }];
  }

  splitList(process.env.AI_ALLOWED_MODELS).forEach(id => {
    if (!list.find(m => m.id === id)) {
      list.push({ id, label: id, note: '自定义添加', maxTokens: 4000, timeout: 120000 });
    }
  });

  return list.map(m => ({ ...m, isDefault: m.id === cfg.model }));
}

/** 取出模型参数（不在白名单内抛错） */
function requireModel(modelId) {
  const list = availableModels();
  if (!modelId) return null;
  const entry = list.find(m => m.id === modelId);
  if (!entry) {
    const err = new Error(`不支持的模型：${modelId}`);
    err.code = 'LLM_MODEL_NOT_ALLOWED';
    throw err;
  }
  return entry;
}

/**
 * 模型调用链：指定/默认模型优先，失败（超时/空响应/上游错误）自动切到备选模型。
 * 推理型模型单次可能 90 秒以上，配置一个同网关快速模型兜底，
 * 保证「现场演示永远有回答」，同时界面如实标注实际用的是哪个模型。
 */
function modelChain(selected) {
  const cfg = resolveConfig();
  const primary = selected || cfg.model;
  const extra = cfg.fallbackModels.length
    ? cfg.fallbackModels
    : splitList(PROVIDERS[cfg.provider] && PROVIDERS[cfg.provider].defaultFallback);
  return [...new Set([primary, ...extra])].filter(Boolean);
}

/** 供前端展示：接入状态、可选模型、免费接入方式 */
function status() {
  const cfg = resolveConfig();
  return {
    configured: cfg.configured,
    provider: cfg.provider,
    providerLabel: cfg.label,
    defaultModel: cfg.model || null,
    models: availableModels(),
    fallbackModels: modelChain(null).slice(1),
    needKey: cfg.needKey,
    reason: cfg.reason || null,
    supportedProviders: Object.keys(PROVIDERS),
    freeOptions: FREE_HINT,
    fallback: '未接入大模型时自动使用本地 34 条农事规则引擎作答，功能不中断'
  };
}

/**
 * 调用大模型（OpenAI 兼容 chat/completions），失败时按调用链依次重试
 * @param {Array<{role:string, content:string}>} messages
 * @param {{temperature?:number, maxTokens?:number, model?:string}} options
 */
async function chat(messages, options = {}) {
  const cfg = resolveConfig();
  if (!cfg.configured) {
    const err = new Error(cfg.reason || '大模型未配置');
    err.code = 'LLM_NOT_CONFIGURED';
    throw err;
  }

  const chain = modelChain(options.model);
  const attempted = [];
  let lastError = null;

  for (let i = 0; i < chain.length; i++) {
    const model = chain[i];
    // 每个模型用自己标定的输出预算与超时（思维链重的模型必须给足）
    const entry = availableModels().find(m => m.id === model);
    const budget = i === 0
      ? (entry && entry.timeout) || cfg.timeout
      : (entry && entry.timeout) || cfg.fallbackTimeout;
    const maxTokens = (options.maxTokens)
      || (entry && entry.maxTokens)
      || cfg.maxTokens;
    const startedAt = Date.now();

    const payload = {
      model,
      messages,
      temperature: options.temperature ?? 0.4,
      max_tokens: maxTokens,
      stream: false
    };
    const headers = { 'Content-Type': 'application/json' };
    if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;

    try {
      const resp = await axios.post(`${cfg.baseUrl}/chat/completions`, payload, {
        headers,
        timeout: budget,
        proxy: false          // 禁用环境代理，避免 https 请求被当作明文发出
      });

      const choice = resp.data && resp.data.choices && resp.data.choices[0];
      const content = choice && choice.message && choice.message.content;

      if (!content) {
        // 推理型模型的思维链可能吃满输出预算：finish_reason=length 且正文为空即属此情况
        const reason = choice
          ? `finish_reason=${choice.finish_reason}，推理型模型建议调大 AI_MAX_TOKENS`
          : '大模型返回内容为空';
        throw new Error(reason);
      }

      const usage = resp.data.usage || {};
      const detail = { model, ok: true, ms: Date.now() - startedAt };
      attempted.push(detail);
      return {
        text: String(content).trim(),
        provider: cfg.provider,
        providerLabel: cfg.label,
        model,
        requestedModel: chain[0],
        fellBack: i > 0,
        attempted,
        reasoning: !!(entry && entry.reasoning),
        reasoningTokens: (usage.completion_tokens_details && usage.completion_tokens_details.reasoning_tokens) || 0,
        totalTokens: usage.total_tokens || null,
        latencyMs: Date.now() - startedAt
      };
    } catch (error) {
      attempted.push({ model, ok: false, ms: Date.now() - startedAt, error: error.message });
      lastError = error;
      if (i < chain.length - 1) {
        console.warn(`[llmService] 模型 ${model} 调用失败（${error.message}），自动切换到 ${chain[i + 1]}`);
      }
    }
  }

  throw lastError;
}

module.exports = { chat, status, resolveConfig, availableModels, requireModel, modelChain, PROVIDERS, INTERN_MODELS };
