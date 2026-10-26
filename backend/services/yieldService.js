/**
 * 气象驱动的产量预估（保底层规则 + 大模型表达层）
 * ==========================================
 *
 * 口径说明（诚实优先，写在最前面）：
 *   - 平台 `crop_data` 表只有**区域总产量（万吨）**，没有播种面积，
 *     因此本服务给的是**区域口径**预估（该区域该作物总产量），不是单产、不代表单户。
 *   - 历史基线 = 该区域该作物近三年（2022—2024）产量均值（统计局分省真实数据，
 *     蔬菜/水果为公报总量分摊，详见《数据源与口径说明.md》）。
 *   - 天气修正 = 未来 15 天预报对作物的适宜度（0.85—1.15），透明可解释。
 *   - 长势修正 = 用户主观评级（好/一般/差），0.92—1.06。
 *   - 收入测算 = 预估产量 × 价格预测（复用 7 日漂移模型），即"量价双预测"。
 *
 * 为什么这里不用机器学习：本机没有历史气象序列（气象数据只按需现拉），
 * 无法构造"气象—产量"训练样本，硬凑模型会得到一个看起来像 AI、
 * 实则不可验证的结论。故先用可解释的规则版，并如实说明升级路径
 * （接入免费公开历史气象数据后，可训练 scripts/train_yield_model.py）。
 */

const { Op } = require('sequelize');
const { CropData, PriceDaily } = require('../models');
const weatherService = require('./weatherService');
const priceForecastService = require('./priceForecastService');
const llmService = require('./llmService');
const { auditNumbers } = require('./numberAudit');
const climateData = require('../seed/crop_climate.json');

const DISCLAIMER = '产量为区域口径估算（该区域该作物总产量），收入测算按价格预测推算，均仅供参考，不构成经营决策依据。';

const VIGOR_FACTORS = { 好: 1.06, 一般: 1.0, 差: 0.92 };

// 品种名 → crop_data 作物名（口径对齐；未命中回退「粮食」）
const CROP_TO_CROPDATA = [
  { kw: '小麦', target: '小麦' },
  { kw: '玉米', target: '玉米' },
  { kw: '水稻', target: '稻谷' },
  { kw: '稻', target: '稻谷' },
  { kw: '大豆', target: '大豆' },
  { kw: '花生', target: '花生' },
  { kw: '油菜', target: '油菜籽' },
  { kw: '棉花', target: '棉花' },
  { kw: '柑橘', target: '柑橘' },
  { kw: '水果', target: '水果' },
  { kw: '甘蔗', target: '甘蔗' }
];

const HARVEST_MONTH = {
  cold_grain: '6 月上旬',
  corn: '9 月下旬',
  rice: '10 月上旬',
  tuber: '9 月',
  fruit: '8—10 月',
  veg: '按生育期采收',
  default: '9—11 月'
};

function num(v, dft = 0) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : dft;
}

function cropDataName(cropType) {
  const hit = CROP_TO_CROPDATA.find(r => String(cropType).includes(r.kw));
  return hit ? hit.target : '粮食';
}

/** 历史基线：近三年产量均值（万吨） */
async function baseline(region, cropName) {
  const years = await CropData.findAll({
    attributes: ['year'],
    group: ['year'],
    where: { cropType: cropName, region },
    order: [['year', 'DESC']],
    limit: 3,
    raw: true
  });
  if (!years.length) return null;
  const since = Math.min(...years.map(y => y.year));
  const rows = await CropData.findAll({
    attributes: ['year', 'yield', 'price'],
    where: { cropType: cropName, region, year: { [Op.gte]: since } },
    raw: true
  });
  if (!rows.length) return null;
  const avg = rows.reduce((s, r) => s + num(r.yield), 0) / rows.length;
  const priceRow = rows.find(r => r.price !== null && r.price !== undefined);
  return {
    avg: Number(avg.toFixed(2)),
    years: rows.map(r => r.year).sort(),
    latestPrice: priceRow ? num(priceRow.price) : null
  };
}

/** 天气适宜度系数（0.85—1.15）：15 天内温度适宜且无极端天气的比例 */
function weatherFactor(daily, profileKey) {
  if (!daily || !daily.length) return null;
  const p = climateData.profiles[profileKey] || climateData.profiles.default;
  const [lo, hi] = p.tempRange;
  let suited = 0;
  let extreme = 0;
  for (const d of daily) {
    const tMax = num(d.tempMax);
    const tMin = num(d.tempMin);
    const precip = num(d.precip);
    if (tMax >= lo && tMax <= hi && tMin >= lo - 3) suited++;
    if (tMax > hi + 6 || tMin < lo - 6 || precip > p.precipDailyMax * 2) extreme++;
  }
  const ratio = suited / daily.length;
  const extremePenalty = (extreme / daily.length) * 0.1;
  const factor = Number(Math.max(0.85, Math.min(1.15, 0.85 + ratio * 0.3 - extremePenalty)).toFixed(3));
  return {
    factor,
    suited,
    extreme,
    days: daily.length,
    detail: `未来 ${daily.length} 天中 ${suited} 天温度适宜、${extreme} 天出现极端天气（适宜区间 ${lo}—${hi}℃），原始适宜度系数 ${factor}`
  };
}

/** 价格：优先用 7 日漂移模型预测价，否则用产量表最新价 */
async function resolvePrice(cropType, productId) {
  if (productId) {
    try {
      const f = await priceForecastService.forecast(productId, null, 7);
      const predicted = Number((f.lastPrice * (1 + f.predictedReturn / 100)).toFixed(3));
      return {
        predictedPrice: predicted,
        lastPrice: f.lastPrice,
        predictedReturn: f.predictedReturn,
        baseDate: f.baseDate,
        model: true,
        detail: `价格预测：${f.productName}全国均价基准价 ${f.lastPrice} 元/公斤（${f.baseDate}），7 日预计${f.predictedReturn >= 0 ? '上涨' : '下跌'} ${Math.abs(f.predictedReturn)}%，预测价 ${predicted} 元/公斤`
      };
    } catch {
      /* 回落用产量表价格 */
    }
  }
  const row = await PriceDaily.findOne({
    attributes: ['productId', 'priceAvg', 'priceDate'],
    where: { productId },
    order: [['priceDate', 'DESC']],
    raw: true
  });
  if (row) {
    return {
      predictedPrice: Number(num(row.priceAvg).toFixed(3)),
      lastPrice: Number(num(row.priceAvg).toFixed(3)),
      predictedReturn: 0,
      baseDate: String(row.priceDate).slice(0, 10),
      model: false,
      detail: `无 7 日价格预测数据，采用最新均价 ${num(row.priceAvg).toFixed(3)} 元/公斤（${String(row.priceDate).slice(0, 10)}）`
    };
  }
  return null;
}

/**
 * 对外入口
 * @param {object} opts { cropType, region, vigor? }
 */
async function estimate(opts = {}) {
  const cropType = String(opts.cropType || '').trim();
  const region = String(opts.region || '').trim();
  const vigor = VIGOR_FACTORS[opts.vigor] ? opts.vigor : '一般';

  if (!cropType) {
    const err = new Error('请指定作物');
    err.code = 'BAD_CROP';
    throw err;
  }
  if (!region) {
    const err = new Error('请指定区域');
    err.code = 'BAD_REGION';
    throw err;
  }

  const cropName = cropDataName(cropType);
  const base = await baseline(region, cropName);
  if (!base) {
    const err = new Error(`「${region}」暂无「${cropName}」的历史产量数据，无法预估`);
    err.code = 'NO_HISTORY';
    throw err;
  }

  const kw = require('./recommendEngineService').matchKeyword(cropType);
  const forecast = await weatherService.getForecast15(region);
  const daily = forecast && forecast.daily ? forecast.daily : [];
  const wf = weatherFactor(daily, kw.profile);
  const vigorFactor = VIGOR_FACTORS[vigor];

  // 短期天气只对**全年产量**做有限修正：原始适宜度系数 0.85—1.15 收敛到 ±6% 以内，
  // 避免用 15 天预报放大全年结论（这是把结论做诚实的必要约束，不是调参美化）
  const weatherApplied = wf ? Number((1 + (wf.factor - 1) * 0.4).toFixed(4)) : 1;
  if (wf) {
    wf.appliedFactor = weatherApplied;
    wf.detail += `；短期预报对全年产量收敛修正后实际采用 ${weatherApplied}`;
  }
  const estimateYield = Number((base.avg * weatherApplied * vigorFactor).toFixed(2));
  const changePct = Number(((estimateYield / base.avg - 1) * 100).toFixed(2));

  const price = await resolvePrice(cropType, kw.productId);
  // 万吨 → 公斤：1 万吨 = 1e7 公斤
  const revenueWan = price ? Number(((estimateYield * 1e7 * price.predictedPrice) / 1e4).toFixed(2)) : null;

  const result = {
    cropType,
    cropName,
    region,
    vigor,
    vigorFactor,
    baseline: base.avg,
    baselineYears: base.years,
    weather: wf || { factor: 1, detail: '未获取到该区域 15 天预报，天气修正系数按 1.0 处理', suited: 0, extreme: 0, days: 0 },
    estimateYield,
    changePct,
    price,
    revenueWan,
    harvestTime: HARVEST_MONTH[kw.profile] || HARVEST_MONTH.default,
    caliber: '区域口径：该区域该作物总产量（万吨），非单产、非单户',
    aiText: null,
    source: 'rule-engine',
    disclaimer: DISCLAIMER
  };

  const status = llmService.status();
  if (status.configured) {
    try {
      const facts = renderFacts(result);
      const res = await llmService.chat([
        { role: 'system', content: YIELD_SYSTEM_PROMPT },
        { role: 'user', content: facts }
      ], { maxTokens: 4000 });
      result.aiText = res.text;
      result.source = 'llm';
      result.audit = auditNumbers(res.text, facts.split('\n'));
    } catch (err) {
      console.warn('[yield] 大模型报告生成失败，回退规则文案:', err.message);
      result.aiText = renderFallbackText(result);
    }
  } else {
    result.aiText = renderFallbackText(result);
  }

  return result;
}

const YIELD_SYSTEM_PROMPT = [
  '你是「数字田野」平台的作物长势分析助手，服务对象是种植户。',
  '根据【测算依据】写一段长势分析，必须遵守：',
  '1）只使用【测算依据】中的数字，禁止编造任何数字；',
  '2）【测算依据】里出现的每个数字必须逐字照抄，禁止换算或四舍五入；',
  '3）结构：长势结论 → 增减产原因（结合天气修正与长势评级）→ 下一步管理建议；',
  '4）控制在 250 字以内，中文口语化，不要使用 Markdown 标题或列表符号；',
  '5）必须说明这是区域口径的估算，不是单户实测。'
].join('\n');

function renderFacts(r) {
  const lines = [];
  lines.push('【测算依据】');
  lines.push(`地区：${r.region}；作物：${r.cropType}（对应产量表口径「${r.cropName}」）`);
  lines.push(`历史基线：${r.baselineYears.join('、')} 年产量均值 ${r.baseline} 万吨`);
  lines.push(`天气修正：${r.weather.detail}`);  lines.push(`长势评级：${r.vigor}（修正系数 ${r.vigorFactor}）`);
  lines.push(`预估产量：${r.estimateYield} 万吨（较基线 ${r.changePct >= 0 ? '+' : ''}${r.changePct}%）`);
  if (r.price) lines.push(r.price.detail);
  if (r.revenueWan !== null) lines.push(`预计收入：${r.revenueWan} 万元`);
  lines.push(`预计上市：${r.harvestTime}`);
  lines.push(`口径：${r.caliber}`);
  lines.push('】');
  return lines.join('\n');
}

function renderFallbackText(r) {
  const parts = [];
  parts.push(`${r.region}的${r.cropType}：基线（${r.baselineYears.join('、')}年均值）${r.baseline} 万吨。`);
  parts.push(r.weather.detail);  parts.push(`按长势评级「${r.vigor}」修正后，预估产量 ${r.estimateYield} 万吨，较基线 ${r.changePct >= 0 ? '+' : ''}${r.changePct}%，预计 ${r.harvestTime} 上市。`);
  if (r.price) parts.push(r.price.detail);
  if (r.revenueWan !== null) parts.push(`预计收入约 ${r.revenueWan} 万元。`);
  parts.push('（区域口径估算，非单户实测，仅供参考）');
  return parts.join('\n');
}

module.exports = { estimate, cropDataName, DISCLAIMER, VIGOR_FACTORS };
