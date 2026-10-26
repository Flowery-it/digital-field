const express = require('express');
const CropRecommend = require('../models/CropRecommend');
const { auth } = require('../middleware/auth');
const recommendEngine = require('../services/recommendEngineService');
const aiGen = require('../services/aiGenerationService');

const router = express.Router();

// 获取地区推荐列表（按大类：基本粮食作物 / 经济作物 / 特色作物）
router.get('/list', async (req, res) => {
  try {
    const { region } = req.query;

    if (!region) {
      return res.status(400).json({ code: 400, message: '地区参数不能为空', data: null });
    }

    // 先从数据库获取推荐数据（seed.js 已覆盖全部 315 个地市）
    let recommends = await CropRecommend.findAll({ where: { region } });

    // 数据库无数据时使用静态兜底（覆盖种子之外的地区）
    if (recommends.length === 0) {
      recommends = await CropRecommend.bulkCreate([
        {
          region,
          cropType: '小麦',
          category: '基本粮食作物',
          recommendIndex: 8,
          reason: '该地区气候适宜小麦生长，历史产量稳定',
          estimateYield: null
        },
        {
          region,
          cropType: '玉米',
          category: '基本粮食作物',
          recommendIndex: 7,
          reason: '该地区土壤肥沃，适合玉米种植',
          estimateYield: null
        },
        {
          region,
          cropType: '花生',
          category: '经济作物',
          recommendIndex: 7,
          reason: '该地区适合花生种植，耐旱耐瘠、轮作效益好',
          estimateYield: null
        },
        {
          region,
          cropType: '地方特色农产品',
          category: '特色作物',
          recommendIndex: 7,
          reason: '地理标志｜该地区因地制宜发展地方特色农产品，可结合地理标志认证与订单农业提升溢价。',
          estimateYield: null
        }
      ]);
    }

    res.status(200).json({
      code: 200,
      message: '获取成功',
      data: recommends
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取失败', data: null });
  }
});

// GET /api/recommend/dynamic?region=石家庄&category=经济作物
// **只读**：命中已留存结果则直接返回（不调大模型，切页再返回数据不丢）；
// 未命中返回 found:false，由前端引导用户点击「生成 AI 推荐」。
// 生成逻辑见 POST /dynamic/refresh。
router.get('/dynamic', auth, async (req, res) => {
  const region = String(req.query.region || '').trim();
  const category = String(req.query.category || '').trim();
  if (!region) {
    return res.status(400).json({ code: 400, message: '地区参数不能为空', data: null });
  }
  try {
    const scopeKey = `${region}|${category || 'all'}`;
    const hit = await aiGen.get(req.user.id, 'recommend', scopeKey);
    if (!hit) {
      return res.status(200).json({ code: 200, message: '暂无已留存的推荐结果', data: { found: false, scopeKey } });
    }
    res.status(200).json({
      code: 200,
      message: '获取成功',
      data: { found: true, scopeKey, generatedAt: hit.generatedAt, source: hit.source, payload: hit.payload }
    });
  } catch (error) {
    console.error('[recommend] 读取留存推荐失败:', error);
    res.status(500).json({ code: 500, message: '读取失败，请稍后重试', data: null });
  }
});

// POST /api/recommend/dynamic/refresh  { region, category? }
// 用户主动触发（首次生成或重新生成）：执行加权引擎 + 大模型理由 → 持久化覆盖。
// 未主动触发前，页面一直展示上次留存的结果。
router.post('/dynamic/refresh', auth, async (req, res) => {
  const region = String((req.body && req.body.region) || '').trim();
  const category = String((req.body && req.body.category) || '').trim();
  if (!region) {
    return res.status(400).json({ code: 400, message: '地区参数不能为空', data: null });
  }
  try {
    const scopeKey = `${region}|${category || 'all'}`;
    const r = await aiGen.refresh(req.user.id, 'recommend', scopeKey, async () => {
      const data = await recommendEngine.buildDynamicRecommend(region, { category: category || undefined });
      return { ...data, source: data.items.some(i => i.reasonSource === 'llm') ? 'llm' : 'template' };
    });
    if (!r.ok) {
      return res.status(500).json({ code: 500, message: '推荐生成失败，请稍后重试', data: null });
    }
    res.status(200).json({
      code: 200,
      message: '生成成功',
      data: { found: true, scopeKey, generatedAt: r.generatedAt, source: r.source, payload: r.payload }
    });
  } catch (error) {
    if (error.code === 'REGION_NOT_FOUND' || error.code === 'CATEGORY_NOT_FOUND') {
      return res.status(404).json({ code: 404, message: error.message, data: null });
    }
    console.error('[recommend] 动态推荐失败:', error);
    res.status(500).json({ code: 500, message: '动态推荐生成失败，请稍后重试', data: null });
  }
});

// 获取推荐详情
router.get('/detail/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const recommend = await CropRecommend.findByPk(id);
    
    if (!recommend) {
      return res.status(404).json({ code: 404, message: '推荐数据不存在', data: null });
    }
    
    res.status(200).json({ code: 200, message: '获取成功', data: recommend });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取失败', data: null });
  }
});

module.exports = router;
