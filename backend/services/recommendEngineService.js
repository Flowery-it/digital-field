/**
 * AI 动态品种推荐引擎（增强层）
 * ============================
 *
 * 把原来 routes/recommend.js 的「静态查表」升级为**动态加权决策**：
 *
 *   AI 推荐指数 = 0.30×产区基础分 + 0.30×价格趋势因子
 *              + 0.30×气象风险因子 + 0.10×农时窗口因子
 *
 * 设计纪律（与项目整体架构一致）：
 *   1. **规则引擎是保底层**：四个因子全部是透明可解释的确定性计算，
 *      不引入黑盒模型；因子缺失时权重重归一并如实标注，不编造。
 *   2. **大模型只做自然语言翻译**：推荐理由由 llmService 基于本引擎算出
 *      的事实数据生成，数字逐字照抄 + auditNumbers 校验；未接入/失败时
 *      回退模板文案，reasonSource 如实标注（llm / template）。
 *   3. 价格因子直接复用 priceForecastService（7 日漂移预测，口径不外推）；
 *      气象因子用 weatherService 15 天预报（独立缓存，不影响天气页 7 天口径）。
 */

const fs = require('fs');
const path = require('path');
const { CropRecommend } = require('../models');
const weatherService = require('./weatherService');
const priceForecastService = require('./priceForecastService');
const llmService = require('./llmService');
const { auditNumbers } = require('./numberAudit');

const CLIMATE_PATH = path.join(__dirname, '..', 'seed', 'crop_climate.json');
const climate = JSON.parse(fs.readFileSync(CLIMATE_PATH, 'utf8'));

// 因子权重（与方案 4.1.1 一致：价格 30% / 气象 30% / 农时 10% / 产区基础 30%）
const WEIGHTS = { base: 0.30, price: 0.30, weather: 0.30, solar: 0.10 };

// 价格预测缓存：同一次推荐里多个地区行可能命中同一品种，10 分钟内复用
const forecastCache = new Map();
const FORECAST_TTL_MS = 10 * 60 * 1000;

const DISCLAIMER = '推荐指数由透明规则加权计算，仅供参考，不构成生产经营决策依据。';

function num(v, dft = 0) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : dft;
}

/** 作物名 → 气候剖面 / 价格品种 / 播种窗口（keywordRules 顺序匹配，长关键词在前） */
function matchKeyword(cropType) {
  const name = String(cropType || '');
  for (const rule of climate.keywordRules) {
    if (name.includes(rule.kw)) {
      return { profile: rule.profile, productId: rule.productId, windows: rule.windows || [] };
    }
  }
  return { profile: 'default', productId: null, windows: [] };
}

/** 当前节气（通用寿星公式，21 世纪常数；与天文时刻可能差一天，窗口匹配精度足够） */
function currentSolarTerm(date = new Date()) {
  const y = date.getFullYear();
  const yy = y % 100;
  const L = Math.floor((yy - 1) / 4); // 21 世纪闰年数
  const terms = climate.solarTermNames.map((name, i) => ({
    name,
    month: Math.floor(i / 2) + 1,
    day: Math.floor(yy * 0.2422 + climate.solarTermC21[i]) - L
  }));

  const todayM = date.getMonth() + 1;
  const todayD = date.getDate();
  const after = (t) => t.month > todayM || (t.month === todayM && t.day > todayD);
  const past = terms.filter(t => !after(t));
  if (past.length) return past[past.length - 1].name;
  return '冬至'; // 1 月 1—5 日之间，上一个节气是上年冬至
}

// 日期 → 当年第几天（用于窗口距离计算）
function dayOfYear(month, day) {
  const y = new Date().getFullYear();
  return Math.floor((Date.UTC(y, month - 1, day) - Date.UTC(y, 0, 1)) / 86400000) + 1;
}

/** 农时窗口因子：在窗口内 100 分，窗外按距窗口边界天数衰减（每天 -2，最低 0） */
function solarFactor(windows, date = new Date()) {
  if (!windows.length) {
    return { score: null, available: false, detail: '该品种暂无公开农时窗口数据，本因子不参与加权' };
  }
  const term = currentSolarTerm(date);
  const today = dayOfYear(date.getMonth() + 1, date.getDate());

  let best = null;
  for (const [sm, sd, em, ed] of windows) {
    const start = dayOfYear(sm, sd);
    const end = dayOfYear(em, ed);
    const win = { start, end, text: `${sm}月${sd}日—${em}月${ed}日` };
    if (start <= end ? (today >= start && today <= end) : (today >= start || today <= end)) {
      best = { dist: 0, win };
      break;
    }
    const dist = Math.min(
      Math.abs(today - start),
      Math.abs(today - end),
      Math.abs(today - start - 365),
      Math.abs(today - end + 365)
    );
    if (!best || dist < best.dist) best = { dist, win };
  }

  if (best.dist === 0) {
    return {
      score: 100,
      available: true,
      detail: `当前处于${term}，正值播种/移栽窗口（${best.win.text}）`
    };
  }
  const score = Math.max(0, 100 - best.dist * 2);
  const future = today < best.win.start || (today > best.win.end && today < best.win.start + 180);
  return {
    score,
    available: true,
    detail: `当前处于${term}，${future ? '距' : '已过'}播种/移栽窗口（${best.win.text}）${best.dist} 天`
  };
}

/** 气象风险因子：15 天预报对作物的适配度（透明逐日加减分） */
function weatherFactor(forecast15, profileKey) {
  if (!forecast15 || !forecast15.daily || !forecast15.daily.length) {
    return { score: null, available: false, detail: '暂未获取到该区域 15 天预报，本因子不参与加权' };
  }
  const p = climate.profiles[profileKey] || climate.profiles.default;
  const [lo, hi] = p.tempRange;
  const month = new Date().getMonth() + 1;
  const winter = p.frostTol && (month <= 2 || month >= 11); // 耐寒作物冬季不因低温扣分

  let total = 0;
  let suit = 0;
  let hot = 0;
  let cold = 0;
  let rain = 0;
  let fungus = 0;

  for (const d of forecast15.daily) {
    const tMax = num(d.tempMax);
    const tMin = num(d.tempMin);
    const precip = num(d.precip);
    const hum = num(d.humidity);

    let s = 100;
    if (tMax > hi + 6) { s -= 20; hot++; } else if (tMax > hi + 3) { s -= 10; }
    if (tMax >= lo && tMax <= hi && tMin >= lo - 3) suit++;
    if (!winter && tMin < lo - 6) { s -= 20; cold++; } else if (!winter && tMin < lo - 3) { s -= 10; }
    if (precip > p.precipDailyMax * 2) { s -= 40; rain++; } else if (precip > p.precipDailyMax) { s -= 25; rain++; }
    if (p.fungus && hum >= 85 && tMax >= 18 && tMax <= 32) { s -= 15; fungus++; }
    total += Math.max(0, s);
  }

  const days = forecast15.daily.length;
  const score = Math.round(total / days);
  const fungusText = p.fungus && fungus ? `，${fungus} 天高湿高温有病害风险` : '';
  return {
    score,
    available: true,
    detail: `未来 ${days} 天中 ${suit} 天温度适宜，${hot} 天偏热、${cold} 天偏冷，${rain} 天降水超 ${p.precipDailyMax}mm/日耐受${fungusText}`
  };
}

/** 价格趋势因子：复用 7 日漂移预测（口径不外推），收益率线性映射到 0—100 */
async function priceFactor(productId) {
  const hit = forecastCache.get(productId);
  if (hit && Date.now() - hit.at < FORECAST_TTL_MS) return hit.data;

  try {
    const f = await priceForecastService.forecast(productId, null, 7);
    const data = {
      productId,
      productName: f.productName,
      predictedReturn: f.predictedReturn,
      basePrice: f.lastPrice,
      baseDate: f.baseDate,
      score: Math.max(0, Math.min(100, Math.round(50 + f.predictedReturn * 8))),
      detail: `未来 7 天${f.productName}全国均价预计${f.predictedReturn >= 0 ? '上涨' : '下跌'} ${Math.abs(f.predictedReturn)}%（基准价 ${f.lastPrice} 元/公斤，${f.baseDate}）`
    };
    forecastCache.set(productId, { at: Date.now(), data });
    return data;
  } catch (err) {
    // 历史数据不足 / 模型缺失：价格因子缺失，权重重归一，如实标注
    return null;
  }
}

/** 按可用因子加权求和（权重重归一），返回 AI 推荐指数 0—100 */
function blend(factors) {
  let sum = 0;
  let wsum = 0;
  for (const key of Object.keys(WEIGHTS)) {
    const f = factors[key];
    if (f && f.score !== null && f.score !== undefined) {
      sum += f.score * WEIGHTS[key];
      wsum += WEIGHTS[key];
    }
  }
  if (!wsum) return null;
  return Math.round(sum / wsum);
}

/**
 * 生成某地区的动态推荐
 * @param {string} region 地区（城市名，与 crop_recommend.region 口径一致）
 * @param {object} opts { category?: 大类筛选 }
 */
async function buildDynamicRecommend(region, opts = {}) {
  const rows = await CropRecommend.findAll({ where: { region } });
  if (!rows.length) {
    const err = new Error(`「${region}」暂无推荐基础数据`);
    err.code = 'REGION_NOT_FOUND';
    throw err;
  }
  const filtered = opts.category ? rows.filter(r => r.category === opts.category) : rows;
  if (!filtered.length) {
    const err = new Error(`「${region}」暂无「${opts.category}」类别的推荐数据`);
    err.code = 'CATEGORY_NOT_FOUND';
    throw err;
  }

  // 15 天预报整区只取一次，所有作物共用
  const forecast15 = await weatherService.getForecast15(region);

  const items = [];
  for (const row of filtered) {
    const kw = matchKeyword(row.cropType);
    const price = kw.productId ? await priceFactor(kw.productId) : null;

    const factors = {
      base: {
        score: num(row.recommendIndex) * 10,
        available: true,
        detail: `${region}产区适配基础分 ${row.recommendIndex}/10（产区知识库）`
      },
      price: price
        ? { score: price.score, available: true, detail: price.detail, productId: price.productId, productName: price.productName }
        : { score: null, available: false, detail: '该品种暂无对应价格预测序列，本因子不参与加权' },
      weather: weatherFactor(forecast15, kw.profile),
      solar: solarFactor(kw.windows)
    };

    const dynamicIndex = blend(factors);
    items.push({
      cropType: row.cropType,
      category: row.category,
      baseIndex: row.recommendIndex,
      dynamicIndex,
      matchedProduct: kw.productId,
      productName: price ? price.productName : null,
      estimateYield: row.estimateYield,
      profile: climate.profiles[kw.profile] ? climate.profiles[kw.profile].desc : null,
      factors,
      aiReason: null,
      reasonSource: 'template',
      reasonAudit: null
    });
  }

  // 动态指数降序；无任何可用因子时排在最后
  items.sort((a, b) => (b.dynamicIndex ?? -1) - (a.dynamicIndex ?? -1));

  // 大模型个性化推荐理由（仅前 5 名，一次调用）；失败/未接入 → 模板文案
  await attachAiReasons(region, items.slice(0, 5));
  // 其余条目用模板文案兜底，保证每条推荐都有可读理由
  items.slice(5).forEach(it => { it.aiReason = templateReason(it); it.reasonSource = 'template'; });

  return {
    region,
    generatedAt: new Date().toISOString(),
    weatherAvailable: !!(forecast15 && forecast15.daily && forecast15.daily.length),
    weatherNotice: forecast15 ? null : '未获取到该区域 15 天预报（天气 Key 未配置或上游暂不可用），气象因子已剔除',
    weights: WEIGHTS,
    total: items.length,
    items,
    disclaimer: DISCLAIMER
  };
}

const REC_SYSTEM_PROMPT = [
  '你是「数字田野」平台的品种推荐助手，服务对象是种植户与农资经销商。',
  '根据【实况数据】为每个品种写一句推荐理由，必须遵守：',
  '1）只使用【实况数据】中的数字，禁止编造任何数字；',
  '2）【实况数据】里出现的每个数字必须逐字照抄，禁止换算或四舍五入；',
  '3）每个品种一条，格式为「序号）理由」，序号与输入一一对应；',
  '4）每条 80 字以内，口语化，先讲结论再讲依据；',
  '5）不要使用 Markdown 符号。'
].join('\n');

/** 模板文案（确定性兜底，与规则引擎同口径） */
function templateReason(item) {
  const parts = [item.factors.base.detail];
  if (item.factors.price.available) parts.push(item.factors.price.detail);
  if (item.factors.weather.available) parts.push(item.factors.weather.detail);
  if (item.factors.solar.available) parts.push(item.factors.solar.detail);
  return `${item.cropType}：${parts.join('；')}。`;
}

async function attachAiReasons(region, topItems) {
  if (!topItems.length) return;

  const status = llmService.status();
  if (!status.configured) {
    topItems.forEach(it => { it.aiReason = templateReason(it); it.reasonSource = 'template'; });
    return;
  }

  const lines = topItems.map((it, i) => {
    const parts = [`产区基础分 ${it.baseIndex}/10`, it.factors.price.detail, it.factors.weather.detail, it.factors.solar.detail]
      .filter(p => p && !p.includes('不参与加权') && !p.includes('暂无'));
    return `${i + 1}）${it.cropType}：${parts.join('；')}`;
  });

  try {
    // 推理型模型（如 Atria-Dawn）思维链会吃输出预算，显式给 6000，
    // 避免默认 2000 时 finish_reason=length 导致整链失败（实测复现过）
    const result = await llmService.chat([
      { role: 'system', content: REC_SYSTEM_PROMPT },
      { role: 'user', content: `【实况数据】${region}地区\n${lines.join('\n')}` }
    ], { maxTokens: 6000 });

    // 按「序号）」逐行解析，与输入一一对应
    const parsed = {};
    String(result.text || '').split('\n').forEach(line => {
      const m = line.match(/^\s*(\d+)\s*[）)、.]\s*(.+)$/);
      if (m) parsed[Number(m[1])] = m[2].trim();
    });

    topItems.forEach((it, i) => {
      const text = parsed[i + 1];
      if (text) {
        it.aiReason = text;
        it.reasonSource = 'llm';
        it.reasonAudit = auditNumbers(text, [it.factors.base.detail, it.factors.price.detail, it.factors.weather.detail, it.factors.solar.detail]);
      } else {
        it.aiReason = templateReason(it);
        it.reasonSource = 'template';
      }
    });
  } catch (err) {
    console.warn('[recommendEngine] 大模型推荐理由生成失败，回退模板:', err.message);
    topItems.forEach(it => { it.aiReason = templateReason(it); it.reasonSource = 'template'; });
  }
}

module.exports = {
  buildDynamicRecommend,
  matchKeyword,
  currentSolarTerm,
  WEIGHTS,
  DISCLAIMER
};
