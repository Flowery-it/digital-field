/**
 * AI 农事问答
 * ==========
 *
 * 架构定位：**规则引擎是保底层，大模型是增强层**。
 *
 *   用户提问
 *     ├─ 组装实况上下文（服务端 4h 缓存的天气 + 34 条规则命中 + 关注品种最新报价）
 *     ├─ 已接入大模型 → 把上下文喂给大模型生成个性化建议
 *     └─ 未接入 / 超时 / 调用失败 → 直接用规则引擎输出确定性答案（功能不中断）
 *
 * 两条路径都会返回 source 字段（llm / rule-engine）与 fallbackReason，
 * 前端据此显示「回答来源」，不把规则引擎伪装成大模型。
 */

const express = require('express');
const { fn, col, Op } = require('sequelize');
const { auth } = require('../middleware/auth');
const advisory = require('../services/agroAdvisoryService');
const llmService = require('../services/llmService');
const aiGen = require('../services/aiGenerationService');
const visionService = require('../services/visionService');
const { Product, PriceDaily } = require('../models');

const router = express.Router();

// 与帖子写操作同一鉴权口径：AI 问答需登录，避免被当作公共算力滥用
router.use(auth);

const MAX_QUESTION = 200;
const MAX_PRODUCTS = 5;

const SYSTEM_PROMPT = [
  '你是「数字田野·农产品价格与气象服务平台」的农业 AI 助手，服务对象是种植户与合作社。',
  '回答必须遵守：',
  '1）只使用下方【当前实况】中的数据作为事实依据，禁止编造任何数字或天气；',
  '2）【当前实况】里出现的每一个数字（温度、降水、阈值、价格、涨跌幅）都必须**逐字照抄**，',
  '   禁止换算、四舍五入或自行推断涨跌方向；【当前实况】没给的数字一律不要写；',
  '3）先给结论（今天该做什么），再给依据（引用具体阈值/报价数据），最后给一条风险提示；',
  '4）建议必须是可执行动作，例如「抢晴采收」「灌深水」「停止灌溉」「提前入库预冷」，不要空泛而谈；',
  '5）控制在 200 字以内，中文口语化表达，不要使用 Markdown 标题或列表符号；',
  '6）若实况数据不足以回答，直接说明还缺哪些数据，不要猜测。'
].join('\n');

// ---------------------------------------------------------------- 上下文

async function latestPriceDate() {
  const row = await PriceDaily.findOne({
    attributes: [[fn('MAX', col('priceDate')), 'd']],
    raw: true
  });
  return row && row.d ? String(row.d).slice(0, 10) : null;
}

/** 取指定品种的最新报价（与页面同一数据源口径：同源内算术平均） */
async function fetchLatestPrices(productIds) {
  if (!productIds.length) return [];
  const date = await latestPriceDate();
  if (!date) return [];

  const rows = await PriceDaily.findAll({
    attributes: [
      'productId',
      [fn('AVG', col('priceAvg')), 'avgPrice'],
      [fn('AVG', col('changePctDod')), 'avgDod']
    ],
    where: { productId: { [Op.in]: productIds }, priceDate: date },
    group: ['productId'],
    raw: true
  });
  if (!rows.length) return [];

  const products = await Product.findAll({
    where: { productId: { [Op.in]: productIds } },
    raw: true
  });
  const nameOf = {};
  products.forEach(p => { nameOf[p.productId] = p.name; });

  return rows.map(r => ({
    productId: r.productId,
    name: nameOf[r.productId] || r.productId,
    price: Number(Number(r.avgPrice).toFixed(2)),
    changePctDod: r.avgDod === null ? null : Number(Number(r.avgDod).toFixed(2))
  }));
}

async function buildContext(city, productIds) {
  const ctx = { city: city || null, weather: null, advice: [], prices: [] };

  if (city) {
    const result = await advisory.buildAdvice(city, 3);
    ctx.weather = {
      available: result.weatherAvailable,
      summary: result.weatherSummary || null,
      notice: result.notice || null
    };
    ctx.advice = result.advice || [];
  }

  ctx.prices = await fetchLatestPrices(productIds);
  return ctx;
}

/** 给前端的精简上下文（用于展示「本次回答依据的数据」） */
function publicContext(ctx) {
  return {
    city: ctx.city,
    weather: ctx.weather,
    advice: ctx.advice.map(a => ({
      productName: a.productName,
      growthStage: a.growthStage,
      riskLabel: a.riskLabel,
      severity: a.severity,
      triggerDetail: a.triggerDetail,
      adviceText: a.adviceText
    })),
    prices: ctx.prices
  };
}

/** 拼装给大模型的实况文本 */
function renderContext(ctx) {
  const lines = [];
  const date = new Date().toISOString().slice(0, 10);
  lines.push(`【当前实况】（采集日 ${date}，气象数据为服务端 4 小时缓存）`);

  if (ctx.city) {
    lines.push(`地点：${ctx.city}`);
  }

  if (ctx.weather && ctx.weather.available && ctx.weather.summary) {
    const s = ctx.weather.summary;
    lines.push(`天气：未来 ${s.days} 天最高温 ${s.tempMax}℃、最低温 ${s.tempMin}℃、累计降水 ${s.totalPrecip}mm`);
  } else if (ctx.weather && ctx.weather.notice) {
    lines.push(`天气：${ctx.weather.notice}`);
  } else {
    lines.push('天气：未指定城市，无实况数据');
  }

  if (ctx.advice.length) {
    lines.push(`规则引擎命中 ${ctx.advice.length} 条农事提醒（来自 34 条透明规则库）：`);
    ctx.advice.forEach((a, i) => {
      lines.push(`${i + 1}）${a.productName}·${a.growthStage}·${a.riskLabel}（严重度 ${a.severity}）：${a.triggerDetail} → ${a.adviceText}`);
    });
  } else if (ctx.weather && ctx.weather.available) {
    lines.push('规则引擎未命中任何农事风险规则。');
  }

  if (ctx.prices.length) {
    lines.push('关注品种最新报价：');
    ctx.prices.forEach(p => {
      const dod = p.changePctDod === null ? '较昨日无数据' : `较昨日 ${p.changePctDod > 0 ? '+' : ''}${p.changePctDod}%`;
      lines.push(`- ${p.name}：${p.price} 元/公斤（${dod}）`);
    });
  }

  lines.push('】');
  return lines.join('\n');
}

/**
 * 数字一致性校验（可审计性设计）
 * --------------------------------
 * 大模型实测存在「改写涨跌幅」等数字漂移（两个不同模型都把 +0.12% 写成 -0.05%）。
 * 这里把回答里的每个数字与注入的实况上下文逐一比对，**不匹配的数字原样列出来**，
 * 由前端标注提醒——我们不把大模型输出当作可信事实，而是当作「待核对的建议」。
 * 这比事后靠人工发现更可控，也是「AI 辅助决策、人机共审」的具体体现。
 */
function auditNumbers(answer, ctx) {
  const source = [];
  if (ctx.weather && ctx.weather.summary) source.push(JSON.stringify(ctx.weather.summary));
  (ctx.advice || []).forEach(a => source.push(`${a.triggerDetail} ${a.adviceText}`));
  (ctx.prices || []).forEach(p => source.push(`${p.name} ${p.price} ${p.changePctDod === null ? '' : p.changePctDod}`));
  if (ctx.city) source.push(ctx.city);

  const allowed = new Set();
  source.forEach(s => {
    (String(s).match(/-?\d+(?:\.\d+)?/g) || []).forEach(n => allowed.add(n.replace(/^-/, '')));
  });
  // 允许模型复述自身提问里出现的常识性数字（如「未来三天」写成 3）
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 24, 30].forEach(n => allowed.add(String(n)));

  const used = String(answer).match(/-?\d+(?:\.\d+)?/g) || [];
  const unverified = [...new Set(
    used
      .map(n => n.replace(/^-/, ''))
      .filter(n => !allowed.has(n))
  )];

  return {
    checked: used.length,
    unverified,
    passed: unverified.length === 0
  };
}

/**
 * 留存本次问答（fire-and-forget，失败只记日志，不影响响应）
 * 语义：用户每次提问都是「主动重新生成」，覆盖该城市的上一条记录。
 */
async function persistChat(userId, city, question, data) {
  if (!userId) return; // 未登录不落库（/chat 需登录，正常不会走到）
  try {
    await aiGen.save(userId, 'chat', city || 'default', { question, ...data }, data.source);
  } catch (err) {
    console.warn('[ai] 问答留存失败（不影响本次响应）:', err.message);
  }
}

/** 规则引擎兜底答案：确定性输出，不依赖任何外部服务 */
function buildRuleAnswer(ctx) {
  const parts = [];
  const s = ctx.weather && ctx.weather.summary;

  if (ctx.city && s) {
    parts.push(`${ctx.city}未来 ${s.days} 天：最高温 ${s.tempMax}℃、最低温 ${s.tempMin}℃、累计降水 ${s.totalPrecip}mm。`);
  } else if (ctx.city && ctx.weather && ctx.weather.notice) {
    parts.push(`${ctx.city}：${ctx.weather.notice}`);
  }

  if (ctx.advice.length) {
    parts.push(`规则库命中 ${ctx.advice.length} 条农事提醒：`);
    ctx.advice.forEach((a, i) => {
      parts.push(`${i + 1}）${a.productName}·${a.growthStage} ${a.riskLabel}——${a.triggerDetail}。建议：${a.adviceText}`);
    });
  } else if (ctx.city && ctx.weather && ctx.weather.available) {
    parts.push('当前实况未触发任何农事风险规则，可按常规节奏安排田间作业。');
  }

  if (ctx.prices.length) {
    parts.push('关注品种最新报价：' + ctx.prices.map(p => `${p.name} ${p.price} 元/公斤`).join('、') + '。');
  }

  if (!parts.length) {
    parts.push('请先在天气页选择种植区域，或在「我的关注」中设置关注品种，我才能给出结合实况的农事建议。');
  }

  parts.push('（本回答由本地 34 条农事规则引擎生成，未调用大模型。接入大模型后可获得更贴合你具体地块的问答应答。）');
  return parts.join('\n');
}

// ---------------------------------------------------------------- 路由

// GET /api/ai/status
// 大模型接入状态（前端据此显示「增强层已接入 / 保底层运行中」）
router.get('/status', (req, res) => {
  res.status(200).json({ code: 200, message: '获取成功', data: llmService.status() });
});

// GET /api/ai/models
// 可选模型清单（白名单 + 实测耗时标注），供前端渲染模型切换控件
router.get('/models', (req, res) => {
  const cfg = llmService.resolveConfig();
  res.status(200).json({
    code: 200,
    message: '获取成功',
    data: {
      configured: cfg.configured,
      defaultModel: cfg.model || null,
      models: llmService.availableModels(),
      fallbackModels: llmService.modelChain(null).slice(1),
      reason: cfg.reason || null
    }
  });
});

// ============================================================
// 拍照识病虫害（多模态，M7）
// 模型优先 Agents-A1，不可用时降级 deepseek-v4-flash-vision（用户指定策略）
// ============================================================

// GET /api/ai/vision/last?crop=水稻
// **只读**：返回上次留存的识别结果（切页再返回不丢）
router.get('/vision/last', auth, async (req, res) => {
  try {
    const crop = String(req.query.crop || '').trim();
    const hit = await aiGen.get(req.user.id, 'vision', crop || 'default');
    if (!hit) {
      return res.status(200).json({ code: 200, message: '暂无已留存的识别结果', data: { found: false } });
    }
    res.status(200).json({
      code: 200,
      message: '获取成功',
      data: { found: true, generatedAt: hit.generatedAt, payload: hit.payload }
    });
  } catch (error) {
    console.error('[ai] 读取留存识别结果失败:', error);
    res.status(500).json({ code: 500, message: '读取失败，请稍后重试', data: null });
  }
});

// POST /api/ai/vision  { imageBase64, mime?, crop? }
// 拍照识别：多模态模型「看」+ 知识库「开方」，结果留存（覆盖上一次 = 主动重新生成）
// 图片以 base64 传输，JSON 体积上限已在 app.js 全局提升到 8mb
router.post('/vision', auth, async (req, res) => {
  try {
    const data = await visionService.refresh(req.user.id, {
      imageBase64: req.body && req.body.imageBase64,
      mime: req.body && req.body.mime,
      crop: req.body && req.body.crop
    });
    res.status(200).json({
      code: 200,
      message: '识别完成',
      data: { ...data, disclaimer: visionService.DISCLAIMER }
    });
  } catch (error) {
    const codeMap = { BAD_IMAGE: 400, IMAGE_TOO_LARGE: 400, VISION_UNAVAILABLE: 503 };
    const status = codeMap[error.code] || 500;
    if (status === 500) console.error('[ai] 拍照识别失败:', error);
    res.status(status).json({ code: status, message: error.message, data: null });
  }
});

// GET /api/ai/chat/last?city=石家庄
// **只读**：返回该用户该城市上次留存的一问一答（切页再返回不丢、不重复调大模型）。
// 新提问会覆盖旧记录——即「用户主动触发重新生成」。
router.get('/chat/last', auth, async (req, res) => {
  try {
    const city = String(req.query.city || '').trim();
    const hit = await aiGen.get(req.user.id, 'chat', city || 'default');
    if (!hit) {
      return res.status(200).json({ code: 200, message: '暂无已留存的问答', data: { found: false } });
    }
    res.status(200).json({ code: 200, message: '获取成功', data: { found: true, generatedAt: hit.generatedAt, payload: hit.payload } });
  } catch (error) {
    console.error('[ai] 读取留存问答失败:', error);
    res.status(500).json({ code: 500, message: '读取失败，请稍后重试', data: null });
  }
});

// POST /api/ai/chat  { question, city?, productIds?[], model? }
router.post('/chat', async (req, res) => {
  const question = String((req.body && req.body.question) || '').trim();
  const city = String((req.body && req.body.city) || '').trim();
  const productIds = Array.isArray(req.body && req.body.productIds)
    ? req.body.productIds.slice(0, MAX_PRODUCTS)
    : [];
  const model = String((req.body && req.body.model) || '').trim();

  if (!question) {
    return res.status(400).json({ code: 400, message: '请输入你的问题', data: null });
  }
  if (question.length > MAX_QUESTION) {
    return res.status(400).json({ code: 400, message: `问题请控制在 ${MAX_QUESTION} 字以内`, data: null });
  }
  // 模型白名单校验：只允许切换到清单内的模型
  if (model) {
    try {
      llmService.requireModel(model);
    } catch (e) {
      return res.status(400).json({ code: 400, message: e.message, data: null });
    }
  }

  try {
    const ctx = await buildContext(city, productIds);
    const status = llmService.status();

    if (status.configured) {
      try {
        const result = await llmService.chat([
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `${renderContext(ctx)}\n\n农户问题：${question}` }
        ], { model: model || undefined });
        const data = {
          answer: result.text,
          source: 'llm',
          provider: result.providerLabel,
          model: result.model,
          requestedModel: result.requestedModel,
          fellBack: !!result.fellBack,
          attempted: result.attempted || [],
          reasoning: !!result.reasoning,
          reasoningTokens: result.reasoningTokens || 0,
          totalTokens: result.totalTokens || null,
          latencyMs: result.latencyMs,
          audit: auditNumbers(result.text, ctx),
          context: publicContext(ctx),
          disclaimer: advisory.DISCLAIMER
        };
        // 留存本次问答：切页再返回仍展示，直到用户再次提问（主动重新生成）
        persistChat(req.user && req.user.id, city, question, data);
        return res.status(200).json({ code: 200, message: '获取成功', data });
      } catch (llmError) {
        console.warn('[ai] 大模型调用失败，回退规则引擎:', llmError.message);
        const data = {
          answer: buildRuleAnswer(ctx),
          source: 'rule-engine',
          fallbackReason: `大模型调用失败（${llmError.message}），已回退本地规则引擎`,
          context: publicContext(ctx),
          disclaimer: advisory.DISCLAIMER
        };
        persistChat(req.user && req.user.id, city, question, data);
        return res.status(200).json({ code: 200, message: '获取成功', data });
      }
    }

    // 未配置大模型：保底层直接作答，保证功能可用
    const data = {
      answer: buildRuleAnswer(ctx),
      source: 'rule-engine',
      fallbackReason: `${status.reason}，当前使用本地规则引擎作答`,
      context: publicContext(ctx),
      disclaimer: advisory.DISCLAIMER
    };
    persistChat(req.user && req.user.id, city, question, data);
    return res.status(200).json({ code: 200, message: '获取成功', data });
  } catch (error) {
    console.error('[ai] 农事问答失败:', error);
    res.status(500).json({ code: 500, message: '问答失败，请稍后重试', data: null });
  }
});

module.exports = router;
