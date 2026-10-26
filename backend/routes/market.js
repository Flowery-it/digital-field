const express = require('express');
const { Sequelize, fn, col } = require('sequelize');
const { Product, Market, PriceDaily } = require('../models');

const router = express.Router();
const { Op } = Sequelize;

// 方案 4.2：dim_market 为市场维度表，fact_price_daily 按市场记录报价。
// 本文件提供「市场视角」的详情聚合：某市场报了哪些品种、什么价、走势如何。

// 最新报价日期（与 price.js 保持一致）
async function getLatestDate() {
  const row = await PriceDaily.findOne({
    attributes: [[fn('MAX', col('priceDate')), 'd']],
    raw: true
  });
  return row && row.d ? String(row.d).slice(0, 10) : null;
}

// GET /api/market/detail/:marketId?range=30|90|365&productId=xxx
// 市场详情：基本信息 + 品种报价全表 + 单品种走势（本市场 vs 全国均价）
router.get('/detail/:marketId', async (req, res) => {
  try {
    const { marketId } = req.params;
    const range = parseInt(req.query.range, 10) || 30;

    const market = await Market.findOne({ where: { marketId } });
    if (!market) {
      return res.status(404).json({ code: 404, message: '市场不存在', data: null });
    }

    const latest = await getLatestDate();
    if (!latest) {
      return res.status(404).json({ code: 404, message: '暂无价格数据', data: null });
    }

    // ---- 1. 该市场最新日报价全表 ----
    const quoteRows = await PriceDaily.findAll({
      attributes: [
        'productId', 'priceDate', 'priceLow', 'priceHigh', 'priceAvg',
        'unit', 'changePctDod', 'changePctWow', 'changePctYoy', 'source'
      ],
      where: { marketId, priceDate: latest },
      raw: true
    });

    const products = await Product.findAll({ where: { isActive: true } });
    const productMap = {};
    products.forEach(p => { productMap[p.productId] = p; });

    const CATEGORY_ORDER = { grain: 1, veg: 2, fruit: 3 };
    const quotes = quoteRows.map(r => {
      const p = productMap[r.productId] || {};
      return {
        productId: r.productId,
        name: p.name || r.productId,
        category: p.category || '',
        spec: p.spec || '',
        baseUnit: p.baseUnit || 'kg',
        priceLow: Number(r.priceLow),
        priceHigh: Number(r.priceHigh),
        priceAvg: Number(r.priceAvg),
        unit: r.unit,
        changePctDod: r.changePctDod === null ? null : Number(r.changePctDod),
        changePctWow: r.changePctWow === null ? null : Number(r.changePctWow),
        changePctYoy: r.changePctYoy === null ? null : Number(r.changePctYoy),
        source: r.source
      };
    }).sort((a, b) => {
      const ca = CATEGORY_ORDER[a.category] || 9;
      const cb = CATEGORY_ORDER[b.category] || 9;
      return ca - cb || b.priceAvg - a.priceAvg;
    });

    // ---- 2. 头部统计：报价品种数 + 涨跌平 + 涨幅最大 ----
    let up = 0, down = 0, flat = 0;
    let topUp = null;
    quotes.forEach(q => {
      const c = q.changePctDod;
      if (c === null) { flat++; return; }
      if (c > 0.05) up++;
      else if (c < -0.05) down++;
      else flat++;
      if (!topUp || c > topUp.changePctDod) topUp = { productId: q.productId, name: q.name, changePctDod: Number(c.toFixed(2)) };
    });

    // ---- 3. 单品种走势：本市场报价 vs 全国均价 ----
    // 未指定 productId 时取该市场均价最高的品种（通常是最有代表性的在售品种）
    const trendProductId = req.query.productId && productMap[req.query.productId]
      ? req.query.productId
      : (quotes.length ? quotes[0].productId : null);

    let trend = { range, startDate: null, endDate: latest, market: [], national: [] };
    let trendProduct = null;

    if (trendProductId) {
      const p = productMap[trendProductId];
      trendProduct = { productId: p.productId, name: p.name, baseUnit: p.baseUnit };

      const startDate = new Date(`${latest}T00:00:00Z`);
      startDate.setUTCDate(startDate.getUTCDate() - (range - 1));
      const startStr = startDate.toISOString().slice(0, 10);
      trend.startDate = startStr;

      const [marketRows, nationalRows] = await Promise.all([
        PriceDaily.findAll({
          attributes: ['priceDate', [fn('AVG', col('priceAvg')), 'avgPrice']],
          where: { marketId, productId: trendProductId, priceDate: { [Op.between]: [startStr, latest] } },
          group: ['priceDate'],
          order: [['priceDate', 'ASC']],
          raw: true
        }),
        PriceDaily.findAll({
          attributes: ['priceDate', [fn('AVG', col('priceAvg')), 'avgPrice']],
          where: { productId: trendProductId, priceDate: { [Op.between]: [startStr, latest] } },
          group: ['priceDate'],
          order: [['priceDate', 'ASC']],
          raw: true
        })
      ]);

      trend.market = marketRows.map(r => ({ date: String(r.priceDate).slice(0, 10), price: Number(Number(r.avgPrice).toFixed(2)) }));
      trend.national = nationalRows.map(r => ({ date: String(r.priceDate).slice(0, 10), price: Number(Number(r.avgPrice).toFixed(2)) }));
    }

    // ---- 4. 品种覆盖统计（按大类） ----
    const catStatMap = {};
    quotes.forEach(q => {
      const c = q.category || 'other';
      if (!catStatMap[c]) catStatMap[c] = { category: c, count: 0 };
      catStatMap[c].count++;
    });

    res.status(200).json({
      code: 200,
      message: '获取成功',
      data: {
        market: {
          marketId: market.marketId,
          name: market.name,
          province: market.province,
          city: market.city,
          marketType: market.marketType,
          tier: market.tier,
          lon: market.lon === null ? null : Number(market.lon),
          lat: market.lat === null ? null : Number(market.lat)
        },
        priceDate: latest,
        headline: {
          quotedCount: quotes.length,
          up,
          down,
          flat,
          topUp
        },
        categoryStats: Object.values(catStatMap),
        quotes,
        trendProduct,
        trend
      }
    });
  } catch (error) {
    console.error('[market] 获取市场详情失败:', error);
    res.status(500).json({ code: 500, message: '获取失败', data: null });
  }
});

module.exports = router;
