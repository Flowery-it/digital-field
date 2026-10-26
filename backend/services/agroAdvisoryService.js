/**
 * 农事提醒规则引擎（保底层）
 * ==========================
 *
 * 把天气预报翻译成可执行的农事动作：**品种 × 生育期窗口 × 耐受阈值 → 建议文案**。
 * 规则库（dim_agro_rule，34 条）全透明可审计，不是黑盒模型。
 *
 * 该服务被两处复用：
 *   1. `routes/agro.js`     —— 天气页的农事提醒区块（确定性输出）
 *   2. `routes/ai.js`       —— 大模型农事问答的**上下文来源与兜底答案**
 *
 * 即「规则引擎是保底层、AI 是增强层」：大模型不可用时，页面功能不瘫。
 */

const { Product, AgroRule } = require('../models');
const weatherService = require('./weatherService');

const RISK_LABEL = {
  frost: '霜冻',
  rain: '连阴雨',
  heat: '高温',
  wind: '大风'
};

const DISCLAIMER = '以上建议由规则库结合天气预报自动生成，仅供参考，不构成生产经营决策依据。';

// 和风天气的 precip / tempMax 等字段返回的是字符串，需显式转数值，
// 否则 reduce 里的 + 会退化成字符串拼接，后续 toFixed 直接抛错
function num(v, dft = 0) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : dft;
}

// 判断当前月份是否落在某规则窗口内（支持跨年，如 11-2 月）
function inWindow(month, start, end) {
  if (start <= end) return month >= start && month <= end;
  return month >= start || month <= end;
}

// SQLite 无原生 JSON 类型，Sequelize 的 JSON 字段会以字符串形式读回，
// 直接当对象用会让所有阈值判断静默失效（全部取到 undefined）
function parseThreshold(v) {
  if (v && typeof v === 'object') return v;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return {}; }
  }
  return {};
}

// 按阈值判断规则是否命中
function matchRule(threshold, forecast) {
  const t = parseThreshold(threshold);
  const maxT = Math.max(...forecast.map(d => num(d.tempMax)));
  const minT = Math.min(...forecast.map(d => num(d.tempMin)));
  const maxWind = Math.max(...forecast.map(d => {
    const s = String(d.windScaleDay || '0');
    return num(s.split('-').pop());
  }));

  if (t.tempMinLt !== undefined && minT < t.tempMinLt) return { hit: true, detail: `最低温 ${minT}℃（阈值 <${t.tempMinLt}℃）` };
  if (t.tempMaxGte !== undefined && maxT >= t.tempMaxGte) return { hit: true, detail: `最高温 ${maxT}℃（阈值 ≥${t.tempMaxGte}℃）` };
  if (t.windScaleGte !== undefined && maxWind >= t.windScaleGte) return { hit: true, detail: `最大风力 ${maxWind} 级（阈值 ≥${t.windScaleGte} 级）` };
  if (t.precipGt !== undefined) {
    const needDays = t.days || 1;
    const winPrecip = forecast.slice(0, needDays).reduce((s, d) => s + num(d.precip), 0);
    if (winPrecip > t.precipGt) return { hit: true, detail: `${needDays} 天累计降水 ${winPrecip.toFixed(1)}mm（阈值 >${t.precipGt}mm）` };
  }
  return { hit: false, detail: null };
}

/** 取某城市未来 N 天预报：与天气页共享同一份服务端缓存，不实时透传上游 */
async function fetchForecast(city, days = 3) {
  const result = await weatherService.getForecast(city);
  if (!result) return null;
  return result.daily.slice(0, days);
}

/**
 * 生成某城市的农事提醒
 * @returns {Promise<{city, weatherAvailable, weatherSummary?, advice, notice?, disclaimer}>}
 */
async function buildAdvice(city, days = 3) {
  const forecast = await fetchForecast(city, days);
  if (!forecast || !forecast.length) {
    // 预警缺失时明确提示，不静默留空
    return {
      city,
      weatherAvailable: false,
      advice: [],
      notice: '暂未获取到该区域的天气预报，农事提醒无法生成。请稍后重试或切换其他区域。'
    };
  }

  const now = new Date();
  const month = now.getMonth() + 1;

  const rules = await AgroRule.findAll({ order: [['severity', 'DESC'], ['id', 'ASC']] });
  const products = await Product.findAll({ where: { isActive: true } });
  const productMap = {};
  products.forEach(p => { productMap[p.productId] = p; });

  const weatherSummary = {
    days: forecast.length,
    tempMax: Math.max(...forecast.map(d => num(d.tempMax))),
    tempMin: Math.min(...forecast.map(d => num(d.tempMin))),
    totalPrecip: Number(forecast.reduce((s, d) => s + num(d.precip), 0).toFixed(1))
  };

  const advice = [];
  const seen = new Set();

  for (const rule of rules) {
    if (!inWindow(month, rule.windowStart, rule.windowEnd)) continue;
    const product = productMap[rule.productId];
    if (!product) continue;

    const { hit, detail } = matchRule(rule.thresholdJson, forecast);
    if (!hit) continue;

    // 同一品种同一风险类型只保留严重度最高的一条
    const key = `${rule.productId}:${rule.riskType}`;
    if (seen.has(key)) continue;
    seen.add(key);

    advice.push({
      ruleId: rule.id,
      productId: rule.productId,
      productName: product.name,
      category: product.category,
      growthStage: rule.growthStage,
      riskType: rule.riskType,
      riskLabel: RISK_LABEL[rule.riskType] || rule.riskType,
      severity: rule.severity,
      triggerDetail: detail,
      adviceText: rule.adviceText
    });
  }

  return {
    city,
    weatherAvailable: true,
    weatherSummary,
    advice,
    disclaimer: DISCLAIMER
  };
}

module.exports = {
  buildAdvice,
  fetchForecast,
  matchRule,
  inWindow,
  parseThreshold,
  num,
  RISK_LABEL,
  DISCLAIMER
};
