const express = require('express');
const { Sequelize, fn, col, literal } = require('sequelize');
const { Product, Market, PriceDaily } = require('../models');
const priceForecastService = require('../services/priceForecastService');

const router = express.Router();
const { Op } = Sequelize;

// 方案 5.3：不同源的价格不混合计算均价，按源分组展示。
// 样例数据阶段只有一个源，此处在 SQL 层保留 source 维度以便后续扩展。

// 最新报价日期
async function getLatestDate() {
  const row = await PriceDaily.findOne({
    attributes: [[fn('MAX', col('priceDate')), 'd']],
    raw: true
  });
  return row && row.d ? String(row.d).slice(0, 10) : null;
}

// GET /api/price/products
// 品种列表，含最新价与较昨日涨跌（首页关注卡片用）
router.get('/products', async (req, res) => {
  try {
    const products = await Product.findAll({
      where: { isActive: true },
      order: [['category', 'ASC'], ['productId', 'ASC']]
    });

    const latest = await getLatestDate();
    if (!latest) {
      return res.status(200).json({ code: 200, message: '获取成功', data: [] });
    }

    // 取每个品种在最新日期的全国均价（多市场算术平均，单一来源内计算）
    const rows = await PriceDaily.findAll({
      attributes: [
        'productId',
        [fn('AVG', col('priceAvg')), 'avgPrice'],
        [fn('AVG', col('changePctDod')), 'avgDod']
      ],
      where: { priceDate: latest },
      group: ['productId'],
      raw: true
    });
    const statMap = {};
    rows.forEach(r => { statMap[r.productId] = r; });

    const data = products.map(p => {
      const s = statMap[p.productId];
      return {
        productId: p.productId,
        name: p.name,
        category: p.category,
        spec: p.spec,
        baseUnit: p.baseUnit,
        growthStages: p.growthStages,
        latestPrice: s ? Number(Number(s.avgPrice).toFixed(2)) : null,
        changePctDod: s && s.avgDod !== null ? Number(Number(s.avgDod).toFixed(2)) : null
      };
    });

    res.status(200).json({ code: 200, message: '获取成功', data: { priceDate: latest, products: data } });
  } catch (error) {
    console.error('[price] 获取品种列表失败:', error);
    res.status(500).json({ code: 500, message: '获取失败', data: null });
  }
});

// GET /api/price/markets
// 市场列表
router.get('/markets', async (req, res) => {
  try {
    const markets = await Market.findAll({
      order: [['tier', 'ASC'], ['marketId', 'ASC']]
    });
    res.status(200).json({ code: 200, message: '获取成功', data: markets });
  } catch (error) {
    console.error('[price] 获取市场列表失败:', error);
    res.status(500).json({ code: 500, message: '获取失败', data: null });
  }
});

// GET /api/price/detail/:productId?range=30|90|365
// 品种详情：走势图 + 各市场报价 + 产区销区价差 + 季节性参考
router.get('/detail/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const range = parseInt(req.query.range, 10) || 30;

    const product = await Product.findOne({ where: { productId } });
    if (!product) {
      return res.status(404).json({ code: 404, message: '品种不存在', data: null });
    }

    const latest = await getLatestDate();
    if (!latest) {
      return res.status(404).json({ code: 404, message: '暂无价格数据', data: null });
    }

    // ---- 1. 全国均价走势（range 天） ----
    const startDate = new Date(`${latest}T00:00:00Z`);
    startDate.setUTCDate(startDate.getUTCDate() - (range - 1));
    const startStr = startDate.toISOString().slice(0, 10);

    const trendRows = await PriceDaily.findAll({
      attributes: [
        'priceDate',
        [fn('AVG', col('priceAvg')), 'avgPrice']
      ],
      where: { productId, priceDate: { [Op.between]: [startStr, latest] } },
      group: ['priceDate'],
      order: [['priceDate', 'ASC']],
      raw: true
    });

    // ---- 2. 去年同期走势（虚线对比） ----
    const yoyStart = new Date(startDate);
    yoyStart.setUTCFullYear(yoyStart.getUTCFullYear() - 1);
    const yoyEnd = new Date(`${latest}T00:00:00Z`);
    yoyEnd.setUTCFullYear(yoyEnd.getUTCFullYear() - 1);
    const yoyRows = await PriceDaily.findAll({
      attributes: [
        'priceDate',
        [fn('AVG', col('priceAvg')), 'avgPrice']
      ],
      where: {
        productId,
        priceDate: { [Op.between]: [yoyStart.toISOString().slice(0, 10), yoyEnd.toISOString().slice(0, 10)] }
      },
      group: ['priceDate'],
      order: [['priceDate', 'ASC']],
      raw: true
    });

    // ---- 3. 各市场最新日报价 ----
    const marketRows = await PriceDaily.findAll({
      attributes: [
        'marketId', 'priceDate', 'priceLow', 'priceHigh', 'priceAvg',
        'changePctDod', 'changePctWow', 'changePctYoy', 'source'
      ],
      where: { productId, priceDate: latest },
      order: [['priceAvg', 'DESC']],
      raw: true
    });
    const markets = await Market.findAll();
    const marketMap = {};
    markets.forEach(m => { marketMap[m.marketId] = m; });

    const marketQuotes = marketRows.map(r => {
      const m = marketMap[r.marketId] || {};
      return {
        marketId: r.marketId,
        marketName: m.name || r.marketId,
        marketType: m.marketType,
        province: m.province,
        tier: m.tier,
        priceLow: Number(r.priceLow),
        priceHigh: Number(r.priceHigh),
        priceAvg: Number(r.priceAvg),
        changePctDod: r.changePctDod === null ? null : Number(r.changePctDod),
        changePctWow: r.changePctWow === null ? null : Number(r.changePctWow),
        changePctYoy: r.changePctYoy === null ? null : Number(r.changePctYoy),
        source: r.source
      };
    });

    // ---- 4. 产区销区价差（按市场类型分组，禁止跨类型混算均价） ----
    const byType = { '产地型': [], '销地型': [], '集散型': [] };
    marketQuotes.forEach(q => {
      if (byType[q.marketType]) byType[q.marketType].push(q.priceAvg);
    });
    const typeAvg = {};
    Object.keys(byType).forEach(t => {
      if (byType[t].length) {
        typeAvg[t] = Number((byType[t].reduce((a, b) => a + b, 0) / byType[t].length).toFixed(2));
      }
    });
    // 方案 5.3：禁止跨类型混算均价，价差仅在「产地型 vs 销地型」两类都有数据时给出
    const spread = (typeAvg['产地型'] !== undefined && typeAvg['销地型'] !== undefined)
      ? Number((typeAvg['销地型'] - typeAvg['产地型']).toFixed(2))
      : null;

    // ---- 5. 季节性参考：近三年月度中枢 ----
    const monthRows = await PriceDaily.findAll({
      attributes: [
        [fn('STRFTIME', '%m', col('priceDate')), 'mon'],
        [fn('AVG', col('priceAvg')), 'avgPrice']
      ],
      where: { productId },
      group: [fn('STRFTIME', '%m', col('priceDate'))],
      order: [[fn('STRFTIME', '%m', col('priceDate')), 'ASC']],
      raw: true
    });
    const seasonal = monthRows.map(r => ({
      month: Number(r.mon),
      avgPrice: Number(Number(r.avgPrice).toFixed(2))
    }));

    // ---- 6. 头部统计 ----
    const currentAvg = marketQuotes.length
      ? Number((marketQuotes.reduce((a, b) => a + b.priceAvg, 0) / marketQuotes.length).toFixed(2))
      : null;
    const dodAvg = marketQuotes.filter(q => q.changePctDod !== null);
    const dod = dodAvg.length
      ? Number((dodAvg.reduce((a, b) => a + b.changePctDod, 0) / dodAvg.length).toFixed(2))
      : null;

    res.status(200).json({
      code: 200,
      message: '获取成功',
      data: {
        product: {
          productId: product.productId,
          name: product.name,
          category: product.category,
          spec: product.spec,
          baseUnit: product.baseUnit,
          growthStages: product.growthStages
        },
        priceDate: latest,
        headline: {
          nationalAvg: currentAvg,
          changePctDod: dod,
          marketCount: marketQuotes.length
        },
        trend: {
          range,
          startDate: startStr,
          endDate: latest,
          current: trendRows.map(r => ({ date: String(r.priceDate).slice(0, 10), price: Number(Number(r.avgPrice).toFixed(2)) })),
          lastYear: yoyRows.map(r => ({ date: String(r.priceDate).slice(0, 10), price: Number(Number(r.avgPrice).toFixed(2)) }))
        },
        marketQuotes,
        spread: {
          byType: typeAvg,
          producerToConsumer: spread
        },
        seasonal
      }
    });
  } catch (error) {
    console.error('[price] 获取品种详情失败:', error);
    res.status(500).json({ code: 500, message: '获取失败', data: null });
  }
});

// GET /api/price/summary
// 今日行情摘要条：N 涨 M 跌 K 平 + 涨幅最大
router.get('/summary', async (req, res) => {
  try {
    const latest = await getLatestDate();
    if (!latest) {
      return res.status(200).json({ code: 200, message: '获取成功', data: null });
    }

    const rows = await PriceDaily.findAll({
      attributes: [
        'productId',
        [fn('AVG', col('priceAvg')), 'avgPrice'],
        [fn('AVG', col('changePctDod')), 'avgDod']
      ],
      where: { priceDate: latest },
      group: ['productId'],
      raw: true
    });

    let up = 0, down = 0, flat = 0;
    let topUp = null;
    rows.forEach(r => {
      const c = r.avgDod === null ? 0 : Number(r.avgDod);
      if (c > 0.05) up++;
      else if (c < -0.05) down++;
      else flat++;
      if (!topUp || c > topUp.changePctDod) topUp = { productId: r.productId, changePctDod: Number(c.toFixed(2)) };
    });

    let topName = null;
    if (topUp) {
      const p = await Product.findOne({ where: { productId: topUp.productId } });
      topName = p ? p.name : topUp.productId;
    }

    // 全库记录条数（用于数据说明页展示真实规模，避免前端估算偏差）
    const recordCount = await PriceDaily.count();

    res.status(200).json({
      code: 200,
      message: '获取成功',
      data: { priceDate: latest, total: rows.length, up, down, flat, recordCount, topUp: topUp ? { name: topName, changePctDod: topUp.changePctDod } : null }
    });
  } catch (error) {
    console.error('[price] 获取行情摘要失败:', error);
    res.status(500).json({ code: 500, message: '获取失败', data: null });
  }
});

// GET /api/price/forecast?productId=xxx&marketId=yyy&days=7
// AI 价格预测：岭回归推理。模型参数由 scripts/train_price_model.py 离线训练导出，
// 本路由只做加载与推理，不做任何训练（推理端零 ML 依赖）。
// 不传 marketId 时返回全国均价预测（各市场预测等权平均，与页面均价口径一致）。
router.get('/forecast', async (req, res) => {
  try {
    const productId = (req.query.productId || '').trim();
    if (!productId) {
      return res.status(400).json({ code: 400, message: '品种参数不能为空', data: null });
    }
    const marketId = (req.query.marketId || '').trim() || null;
    const days = req.query.days ? parseInt(req.query.days, 10) : null;

    const data = await priceForecastService.forecast(productId, marketId, days);
    res.status(200).json({ code: 200, message: '获取成功', data });
  } catch (error) {
    if (error.code === 'MODEL_MISSING') {
      return res.status(503).json({ code: 503, message: error.message, data: null });
    }
    if (error.code === 'PRODUCT_NOT_FOUND') {
      return res.status(404).json({ code: 404, message: error.message, data: null });
    }
    if (error.code === 'HISTORY_NOT_ENOUGH') {
      return res.status(422).json({ code: 422, message: error.message, data: null });
    }
    console.error('[price] 价格预测失败:', error);
    res.status(500).json({ code: 500, message: '价格预测失败', data: null });
  }
});

module.exports = router;
