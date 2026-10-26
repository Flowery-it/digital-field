/**
 * AI 产销对接匹配（规则引擎 + 价格预测 + 大模型表达）
 * ==============================================
 *
 * 三维匹配（方案 4.4）：
 *   1. 时空匹配：同品种 + 地区邻近 + 上市/收购时间吻合
 *   2. 价格适配：调用 7 日价格预测，给双方一个合理报价区间（不编造价格）
 *   3. 智能排序：
 *      种植户端（找收购商）：出价高 + 距离近 + 量大
 *      经销商端（找货源）：货源稳 + 品质匹配 + 上市时间吻合
 *
 * 诚实口径：
 *   - 平台只撮合意向与给出价格参考，不担保交易；
 *   - 距离用「同省加分、不同省不得分」的粗粒度规则（无坐标数据，不做虚假精确距离）；
 *   - 联系方式由发布人自愿填写，演示环境使用。
 */

const { MatchIntent, User, Product, PriceDaily } = require('../models');
const weatherService = require('./weatherService');
const priceForecastService = require('./priceForecastService');
const llmService = require('./llmService');
const { matchKeyword } = require('./recommendEngineService');
const { auditNumbers } = require('./numberAudit');

const DISCLAIMER = '平台仅撮合供需意向并提供价格参考，不构成交易担保；请实地核验品质与履约能力。';

const ROLES = { grower: '种植户（供货）', buyer: '经销商（收购）' };

/** 地区粗粒度相邻：同省 +40，同地区名 +60，不同省 0（无坐标数据，不做虚假精确距离） */
function proximityScore(myRegion, otherRegion) {
  const a = String(myRegion || '');
  const b = String(otherRegion || '');
  if (!a || !b) return { score: 0, label: '地区未知' };
  if (a === b) return { score: 60, label: '同地区' };
  const pa = weatherService.provinceOf(a);
  const pb = weatherService.provinceOf(b);
  if (pa && pb && pa === pb) return { score: 40, label: `同省（${pa}）` };
  return { score: 0, label: '跨省' };
}

/** 时间匹配：期望日期相差越近分越高（±30 天内线性衰减） */
function timeScore(myDate, otherDate) {
  const a = String(myDate || '');
  const b = String(otherDate || '');
  if (!a || !b) return { score: 30, label: '时间未指定' };
  const da = new Date(a + 'T00:00:00');
  const db = new Date(b + 'T00:00:00');
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return { score: 30, label: '时间格式有误' };
  const diffDays = Math.abs((da - db) / 86400000);
  if (diffDays <= 7) return { score: 100, label: '一周内可对接' };
  if (diffDays <= 30) return { score: 80, label: '一个月内' };
  if (diffDays <= 90) return { score: 50, label: '三个月内' };
  return { score: 20, label: '时间差距较大' };
}

/** 价格预测（用于给报价区间）；无预测序列时回落最新均价 */
async function priceAdvice(productName) {
  const productId = matchKeyword(productName).productId;
  if (productId) {
    try {
      const f = await priceForecastService.forecast(productId, null, 7);
      const cur = f.lastPrice;
      const predicted = Number((cur * (1 + f.predictedReturn / 100)).toFixed(3));
      return {
        available: true,
        productName: f.productName,
        currentPrice: cur,
        predictedPrice: predicted,
        predictedReturn: f.predictedReturn,
        baseDate: f.baseDate,
        // 报价区间：当前价 ~ 预测价之间，按预测方向给出双边建议
        range: f.predictedReturn >= 0
          ? { low: cur, high: predicted }
          : { low: predicted, high: cur },
        detail: `${f.productName}全国均价 ${cur} 元/公斤（${f.baseDate}），7 日预计${f.predictedReturn >= 0 ? '上涨' : '下跌'} ${Math.abs(f.predictedReturn)}%，参考区间 ${Math.min(cur, predicted)}—${Math.max(cur, predicted)} 元/公斤`
      };
    } catch {
      /* 无预测序列时回落 */
    }
  }
  if (productId) {
    const row = await PriceDaily.findOne({
      attributes: ['priceAvg', 'priceDate'],
      where: { productId },
      order: [['priceDate', 'DESC']],
      raw: true
    });
    if (row) {
      const p = Number(Number(row.priceAvg).toFixed(3));
      return {
        available: true,
        productName,
        currentPrice: p,
        predictedPrice: p,
        predictedReturn: 0,
        baseDate: String(row.priceDate).slice(0, 10),
        range: { low: p, high: p },
        detail: `${productName}最新均价 ${p} 元/公斤（${String(row.priceDate).slice(0, 10)}），暂无 7 日预测数据`
      };
    }
  }
  return { available: false, detail: '该品种暂无价格数据，无法给出报价参考' };
}

/**
 * 发布意向
 */
async function publish(userId, body) {
  const role = String(body.role || '').trim();
  if (!ROLES[role]) {
    const err = new Error('role 必须是 grower（供货）或 buyer（收购）');
    err.code = 'BAD_ROLE';
    throw err;
  }
  const product = String(body.product || '').trim();
  if (!product) {
    const err = new Error('请填写品种');
    err.code = 'BAD_PRODUCT';
    throw err;
  }
  const region = String(body.region || '').trim();
  if (!region) {
    const err = new Error('请填写地区');
    err.code = 'BAD_REGION';
    throw err;
  }
  const quantity = body.quantity === '' || body.quantity === undefined ? null : Number(body.quantity);
  if (quantity !== null && (!Number.isFinite(quantity) || quantity <= 0)) {
    const err = new Error('数量必须为正数');
    err.code = 'BAD_QUANTITY';
    throw err;
  }
  const priceExpect = body.priceExpect === '' || body.priceExpect === undefined ? null : Number(body.priceExpect);
  if (priceExpect !== null && (!Number.isFinite(priceExpect) || priceExpect <= 0)) {
    const err = new Error('期望价必须为正数');
    err.code = 'BAD_PRICE';
    throw err;
  }

  const row = await MatchIntent.create({
    userId,
    role,
    product,
    quantity,
    priceExpect,
    region,
    availableDate: String(body.availableDate || '').trim() || null,
    contact: String(body.contact || '').trim().slice(0, 64) || null,
    remark: String(body.remark || '').trim().slice(0, 200) || null
  });
  return row;
}

/** 我的意向列表 */
async function myIntents(userId) {
  const rows = await MatchIntent.findAll({ where: { userId }, order: [['id', 'DESC']], limit: 50 });
  return rows;
}

/** 撤销意向 */
async function close(userId, id) {
  const row = await MatchIntent.findOne({ where: { id, userId } });
  if (!row) {
    const err = new Error('意向不存在');
    err.code = 'NOT_FOUND';
    throw err;
  }
  await row.update({ status: 'closed' });
  return row;
}

/**
 * 匹配推荐：给当前用户找「对面角色」的意向
 * @param {number} userId
 * @param {object} opts { role: 'grower'|'buyer', product?, region? }
 *        role 表示**当前用户自己的角色**，返回对面角色的意向
 */
async function recommend(userId, opts = {}) {
  const myRole = String(opts.role || '').trim();
  if (!ROLES[myRole]) {
    const err = new Error('role 必须是 grower 或 buyer');
    err.code = 'BAD_ROLE';
    throw err;
  }
  const opposite = myRole === 'grower' ? 'buyer' : 'grower';

  const where = { role: opposite, status: 'open' };
  if (opts.product) where.product = String(opts.product).trim();
  const intents = await MatchIntent.findAll({
    where,
    order: [['id', 'DESC']],
    limit: 100
  });

  const price = await priceAdvice(opts.product || (intents[0] && intents[0].product) || '');

  // 用户自己的地区/时间基准：优先取**同品种**的最近意向，其次任意意向，最后用入参 region
  // （不能简单取「最近一条意向」——用户同时卖小麦和水稻时，最近一条可能不是当前匹配的品种，
  //   会把同城匹配误判成跨省）
  let mine = null;
  if (opts.product) {
    mine = await MatchIntent.findOne({
      where: { userId, role: myRole, product: String(opts.product).trim() },
      order: [['id', 'DESC']]
    });
  }
  if (!mine) {
    mine = await MatchIntent.findOne({ where: { userId, role: myRole }, order: [['id', 'DESC']] });
  }
  const baseRegion = opts.region || (mine && mine.region) || '';
  const baseDate = mine && mine.availableDate;

  const scored = intents.map(it => {
    const prox = proximityScore(baseRegion, it.region);
    const tim = timeScore(baseDate, it.availableDate);

    // 出价/货源维度：收购方看出价与量；种植户看量与上市时间
    let bid = 0;
    let bidLabel = '';
    if (myRole === 'grower') {
      // 找收购商：出价高 + 量大
      bid = Math.min(40, (Number(it.priceExpect || 0) / 10) + (Number(it.quantity || 0) > 50 ? 20 : 0));
      bidLabel = it.priceExpect ? `期望收购价 ${it.priceExpect} 元/公斤` : '未填报期望价';
    } else {
      // 找货源：量大 + 上市时间明确
      bid = Math.min(40, (Number(it.quantity || 0) > 50 ? 25 : 10) + (it.availableDate ? 15 : 0));
      bidLabel = it.quantity ? `可供 ${it.quantity} 吨` : '未填报数量';
    }

    // 与价格区间的契合度：期望价落在参考区间内得分高
    let priceFit = 0;
    let priceFitLabel = '';
    if (price.available && it.priceExpect) {
      const lo = Math.min(price.range.low, price.range.high);
      const hi = Math.max(price.range.low, price.range.high);
      if (Number(it.priceExpect) >= lo && Number(it.priceExpect) <= hi) {
        priceFit = 20;
        priceFitLabel = '期望价在参考区间内';
      } else {
        priceFit = 5;
        priceFitLabel = Number(it.priceExpect) > hi ? '期望价高于参考区间' : '期望价低于参考区间';
      }
    } else {
      priceFit = 10;
      priceFitLabel = '暂无价格数据可比对';
    }

    const total = Math.round(prox.score * 0.3 + tim.score * 0.3 + bid * 0.25 + priceFit * 0.15);
    return {
      id: it.id,
      role: it.role,
      roleLabel: ROLES[it.role],
      product: it.product,
      quantity: it.quantity,
      priceExpect: it.priceExpect,
      region: it.region,
      availableDate: it.availableDate,
      contact: it.contact,
      remark: it.remark,
      score: total,
      reasons: [
        prox.label,
        tim.label,
        bidLabel,
        priceFitLabel
      ].filter(Boolean),
      factors: { proximity: prox, time: tim, bid, bidLabel, priceFit, priceFitLabel }
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return { myRole, oppositeRole: opposite, price, total: scored.length, items: scored.slice(0, 20) };
}

/** AI 谈判助手：分析对方报价是否合理并给还价策略（价格事实来自平台预测） */
async function negotiate(userId, body) {
  const product = String(body.product || '').trim();
  const offer = Number(body.priceExpect);
  if (!product || !Number.isFinite(offer) || offer <= 0) {
    const err = new Error('请提供品种与对方报价');
    err.code = 'BAD_INPUT';
    throw err;
  }
  const price = await priceAdvice(product);
  if (!price.available) {
    const err = new Error('该品种暂无价格数据，无法评估报价');
    err.code = 'NO_PRICE';
    throw err;
  }

  const lo = Math.min(price.range.low, price.range.high);
  const hi = Math.max(price.range.low, price.range.high);
  const position = offer > hi ? '高于参考区间' : offer < lo ? '低于参考区间' : '处于参考区间内';

  const facts = [
    `品种：${product}`,
    `对方报价：${offer} 元/公斤`,
    price.detail,
    `报价位置：${position}`,
    `参考区间：${lo}—${hi} 元/公斤`
  ];

  const status = llmService.status();
  if (!status.configured) {
    return {
      source: 'rule-engine',
      facts,
      advice: `对方报价${position}。参考区间 ${lo}—${hi} 元/公斤：${offer > hi ? '报价偏高，可顺势促成但注意核验品质与履约' : offer < lo ? '报价偏低，建议按参考区间下沿以上议价' : '报价合理，可按区间内价格推进'}。`,
      disclaimer: DISCLAIMER
    };
  }

  const SYSTEM_PROMPT = [
    '你是「数字田野」平台的农产品交易谈判助手，服务对象是种植户与经销商。',
    '根据【价格事实】评估对方报价并给出还价策略，必须遵守：',
    '1）只使用【价格事实】中的数字，禁止编造任何价格；',
    '2）【价格事实】里出现的每个数字必须逐字照抄，禁止换算或四舍五入；',
    '3）结构：报价是否合理 → 建议策略 → 一句可当面说的话术；',
    '4）控制在 200 字以内，中文口语化，不要使用 Markdown 符号。'
  ].join('\n');

  try {
    const r = await llmService.chat([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `【价格事实】\n${facts.join('\n')}` }
    ], { maxTokens: 3000 });
    return {
      source: 'llm',
      facts,
      advice: r.text,
      audit: auditNumbers(r.text, facts),
      disclaimer: DISCLAIMER
    };
  } catch (err) {
    console.warn('[match] 谈判助手降级:', err.message);
    return {
      source: 'rule-engine',
      facts,
      advice: `对方报价${position}。参考区间 ${lo}—${hi} 元/公斤：${offer > hi ? '报价偏高，可顺势促成但注意核验品质与履约' : offer < lo ? '报价偏低，建议按参考区间下沿以上议价' : '报价合理，可按区间内价格推进'}。（大模型暂不可用，以上为规则建议）`,
      disclaimer: DISCLAIMER
    };
  }
}

module.exports = { publish, myIntents, close, recommend, negotiate, priceAdvice, ROLES, DISCLAIMER };
