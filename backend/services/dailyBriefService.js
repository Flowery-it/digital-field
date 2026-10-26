/**
 * 主动式 AI 农事管家（增强层）
 * ============================
 *
 * 把「天气页农事提醒」升级为**每日主动推送的个性化日报**：
 *
 *   用户作物档案（user_crop）
 *     ├─ 按区域聚合 → 34 条规则引擎命中（agroAdvisoryService，保底层）
 *     ├─ 按品种聚合 → 最新报价（与「我的关注」同口径）
 *     └─ 已接入大模型 → 生成「一句话农田状态 + 今日待办 + 风险预警」
 *        未接入 / 超时 / 失败 → 规则引擎确定性拼装（功能不中断，source 如实标注）
 *
 * 定时策略：服务启动后每小时检查一次，当天 06:00 后且今日尚未推送则生成，
 * 结果写入 advisory_push 留痕；演示现场可 POST /api/agro/push/run 手动触发。
 */

const { fn, col, Op } = require('sequelize');
const { UserCrop, AdvisoryPush, User, PriceDaily, Product } = require('../models');
const advisory = require('./agroAdvisoryService');
const llmService = require('./llmService');
const { matchKeyword } = require('./recommendEngineService');
const { auditNumbers } = require('./numberAudit');

const DISCLAIMER = advisory.DISCLAIMER;

function num(v, dft = 0) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : dft;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/** 取指定品种最新日期报价（与 routes/ai.js 同口径：同源内算术平均） */
async function fetchLatestPrices(productIds) {
  if (!productIds.length) return [];
  const row = await PriceDaily.findOne({
    attributes: [[fn('MAX', col('priceDate')), 'd']],
    raw: true
  });
  const date = row && row.d ? String(row.d).slice(0, 10) : null;
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

/** 规则引擎兜底日报：确定性拼装，不依赖任何外部服务 */
function buildRuleBrief(crops, adviceByRegion, prices) {
  const parts = [];
  crops.forEach(c => {
    const advice = adviceByRegion[c.region];
    const hits = (advice && advice.advice) || [];
    if (hits.length) {
      const top = hits.slice(0, 2).map(a => `${a.productName}${a.riskLabel}（${a.adviceText}）`).join('；');
      parts.push(`${c.region}的${c.cropType}：${top}`);
    } else {
      parts.push(`${c.region}的${c.cropType}：未来几天天气平稳，暂无风险规则命中，按常规节奏管理`);
    }
  });
  if (prices.length) {
    parts.push('最新报价：' + prices.map(p => `${p.name} ${p.price} 元/公斤${p.changePctDod === null ? '' : `（较昨日 ${p.changePctDod > 0 ? '+' : ''}${p.changePctDod}%）`}`).join('、'));
  }
  parts.push('（本日报由本地 34 条农事规则引擎生成，未调用大模型）');
  return parts.join('\n');
}

/**
 * 生成某用户的今日农事日报
 * @param {number} userId
 * @param {object} opts { persist?: boolean } persist=true 时写入 advisory_push
 *        （用户主动生成 / 定时推送都要留存，切页再返回不丢）
 * @returns {Promise<{hasCrops, date, crops, brief, source, fallbackReason?, adviceByRegion, prices, audit?}>}
 */
async function buildDailyBrief(userId, opts = {}) {
  const crops = await UserCrop.findAll({ where: { userId, status: 1 }, order: [['id', 'ASC']] });
  if (!crops.length) {
    return { hasCrops: false, date: todayStr(), crops: [], brief: null, source: null };
  }

  // 按区域聚合规则命中（同区域只查一次）
  const regions = [...new Set(crops.map(c => c.region).filter(Boolean))];
  const adviceResults = await Promise.all(regions.map(r => advisory.buildAdvice(r, 3)));
  const adviceByRegion = {};
  regions.forEach((r, i) => { adviceByRegion[r] = adviceResults[i]; });

  // 个性化过滤：规则库覆盖平台全部品种，只保留**用户种植作物**命中的规则，
  // 否则日报里会出现用户根本没种的作物的预警（大模型也会照实况复述，造成困扰）
  const userProductIds = new Set(crops.map(c => matchKeyword(c.cropType).productId).filter(Boolean));
  regions.forEach(r => {
    const a = adviceByRegion[r];
    if (a && Array.isArray(a.advice) && userProductIds.size) {
      a.advice = a.advice.filter(x => userProductIds.has(x.productId));
    }
  });

  // 按品种聚合报价（能匹配到价格序列的品种才查）
  const productIds = [...new Set(
    crops.map(c => matchKeyword(c.cropType).productId).filter(Boolean)
  )];
  const prices = await fetchLatestPrices(productIds);

  const status = llmService.status();
  if (!status.configured) {
    return await persistIfNeeded(opts, userId, {
      hasCrops: true,
      date: todayStr(),
      crops,
      brief: buildRuleBrief(crops, adviceByRegion, prices),
      source: 'rule-engine',
      fallbackReason: `${status.reason}，当前使用本地规则引擎生成日报`,
      adviceByRegion,
      prices
    });
  }

  // 组装给大模型的实况上下文（数字全部来自规则引擎与数据库）
  const lines = [];
  lines.push(`【当前实况】（采集日 ${todayStr()}）`);
  crops.forEach((c, i) => {
    const advice = adviceByRegion[c.region];
    const hits = (advice && advice.advice) || [];
    lines.push(`${i + 1}）${c.region} · ${c.cropType}${c.area ? `（${c.area} 亩）` : ''}${c.currentStage ? ` · ${c.currentStage}` : ''}`);
    if (advice && advice.weatherAvailable) {
      const s = advice.weatherSummary;
      lines.push(`   天气：未来 ${s.days} 天最高温 ${s.tempMax}℃、最低温 ${s.tempMin}℃、累计降水 ${s.totalPrecip}mm`);
      hits.slice(0, 3).forEach(a => {
        lines.push(`   规则命中：${a.productName}·${a.growthStage}·${a.riskLabel}：${a.triggerDetail} → ${a.adviceText}`);
      });
      if (!hits.length) lines.push('   规则未命中任何农事风险。');
    } else {
      lines.push('   天气：暂未获取到预报');
    }
  });
  if (prices.length) {
    lines.push('关注品种最新报价：');
    prices.forEach(p => {
      lines.push(`- ${p.name}：${p.price} 元/公斤${p.changePctDod === null ? '' : `（较昨日 ${p.changePctDod > 0 ? '+' : ''}${p.changePctDod}%）`}`);
    });
  }
  lines.push('】');

  const SYSTEM_PROMPT = [
    '你是「数字田野」平台的 AI 农事管家，服务对象是种植户。',
    '根据【当前实况】写一份今日农事日报，必须遵守：',
    '1）只使用【当前实况】中的数字，禁止编造任何数字或天气；',
    '2）【当前实况】里出现的每个数字必须逐字照抄，禁止换算、四舍五入；',
    '3）结构：一句话农田状态总结 → 今日待办（按地块逐条，可执行动作）→ 风险预警（如有）；',
    '4）控制在 300 字以内，中文口语化，不要使用 Markdown 标题或列表符号；',
    '5）实况数据不足时直接说明缺什么，不要猜测。'
  ].join('\n');

  try {
    const result = await llmService.chat([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `${lines.join('\n')}\n\n请为这位种植户生成今日农事日报。` }
    ]);
    return await persistIfNeeded(opts, userId, {
      hasCrops: true,
      date: todayStr(),
      crops,
      brief: result.text,
      source: 'llm',
      adviceByRegion,
      prices,
      audit: auditNumbers(result.text, lines)
    });
  } catch (err) {
    console.warn('[dailyBrief] 大模型日报生成失败，回退规则引擎:', err.message);
    return await persistIfNeeded(opts, userId, {
      hasCrops: true,
      date: todayStr(),
      crops,
      brief: buildRuleBrief(crops, adviceByRegion, prices),
      source: 'rule-engine',
      fallbackReason: `大模型调用失败（${err.message}），已回退本地规则引擎`,
      adviceByRegion,
      prices
    });
  }
}

/**
 * 按需持久化日报到 advisory_push（同日幂等：先删后写）。
 * 用户主动生成（POST /daily-brief/refresh）与定时推送都传 persist:true，
 * 保证「生成一次 → 持续留存 → 只有主动刷新才重算」。
 */
async function persistIfNeeded(opts, userId, result) {
  if (opts && opts.persist && result.brief) {
    const date = result.date;
    await AdvisoryPush.destroy({ where: { userId, pushDate: date } });
    await AdvisoryPush.create({ userId, pushDate: date, content: result.brief, source: result.source });
  }
  return result;
}

/** 用户是否有在种作物（供路由判断是否值得引导生成） */
async function hasCrops(userId) {
  const n = await UserCrop.count({ where: { userId, status: 1 } });
  return n > 0;
}

/**
 * 全量推送：为所有在种作物的用户生成今日日报并留痕
 * @returns {Promise<{date, userCount, pushCount}>}
 */
async function runDailyPush() {
  const date = todayStr();
  const cropRows = await UserCrop.findAll({ where: { status: 1 }, attributes: ['userId'], raw: true });
  const userIds = [...new Set(cropRows.map(r => r.userId))];

  let pushCount = 0;
  for (const userId of userIds) {
    // 定时推送直接持久化（幂等：同日先删后写）
    const brief = await buildDailyBrief(userId, { persist: true });
    if (!brief.hasCrops || !brief.brief) continue;
    pushCount++;
  }
  return { date, userCount: userIds.length, pushCount };
}

/** 今日是否已推送过（供调度器判断，避免重复生成） */
async function pushedToday() {
  const n = await AdvisoryPush.count({ where: { pushDate: todayStr() } });
  return n > 0;
}

/**
 * 初始化调度器：每小时检查，当天 06:00 后且今日无推送则执行全量推送。
 * 轻量实现（不引第三方 cron），失败仅记日志，不影响主服务。
 */
function initScheduler() {
  const HOUR = 60 * 60 * 1000;
  const tick = async () => {
    try {
      const now = new Date();
      if (now.getHours() < 6) return; // 早 6 点前不推送，避免打扰
      if (await pushedToday()) return;
      const r = await runDailyPush();
      console.log(`[dailyBrief] ${r.date} 农事管家日报推送完成：${r.userCount} 位用户，${r.pushCount} 条`);
    } catch (err) {
      console.error('[dailyBrief] 定时推送失败:', err.message);
    }
  };
  // 启动 30 秒后先检查一次（演示环境重启后能立即补上当日报）
  setTimeout(tick, 30 * 1000);
  setInterval(tick, HOUR);
  console.log('[dailyBrief] 农事管家定时推送已启动（每日 06:00 后，每小时检查一次）');
}

module.exports = { buildDailyBrief, hasCrops, runDailyPush, initScheduler, pushedToday, fetchLatestPrices, DISCLAIMER };
