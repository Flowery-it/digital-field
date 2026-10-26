const express = require('express');
const { Product, AgroRule, UserCrop, AdvisoryPush } = require('../models');
const advisory = require('../services/agroAdvisoryService');
const dailyBrief = require('../services/dailyBriefService');
const { auth } = require('../middleware/auth');

const router = express.Router();

const MAX_CROPS_PER_USER = 20;

// GET /api/agro/advice?city=石家庄
// 把天气翻译成农事动作：规则表 + 实时预报 → 建议列表
// 判定逻辑收敛在 services/agroAdvisoryService，供大模型问答复用同一套规则
router.get('/advice', async (req, res) => {
  const city = (req.query.city || '').trim();
  if (!city) {
    return res.status(400).json({ code: 400, message: '城市参数不能为空', data: null });
  }

  try {
    const data = await advisory.buildAdvice(city, 3);
    res.status(200).json({ code: 200, message: '获取成功', data });
  } catch (error) {
    console.error('[agro] 生成农事提醒失败:', error);
    res.status(500).json({ code: 500, message: '生成农事提醒失败', data: null });
  }
});

// GET /api/agro/rules
// 规则库列表（数据说明与答辩时展示透明度）
router.get('/rules', async (req, res) => {
  try {
    const rules = await AgroRule.findAll({ order: [['severity', 'DESC'], ['id', 'ASC']] });
    const products = await Product.findAll();
    const pm = {};
    products.forEach(p => { pm[p.productId] = p.name; });
    res.status(200).json({
      code: 200,
      message: '获取成功',
      data: rules.map(r => ({
        id: r.id,
        productId: r.productId,
        productName: pm[r.productId] || r.productId,
        growthStage: r.growthStage,
        window: `${r.windowStart}-${r.windowEnd}月`,
        riskType: r.riskType,
        riskLabel: advisory.RISK_LABEL[r.riskType] || r.riskType,
        threshold: r.thresholdJson,
        severity: r.severity,
        adviceText: r.adviceText
      }))
    });
  } catch (error) {
    console.error('[agro] 获取规则库失败:', error);
    res.status(500).json({ code: 500, message: '获取失败', data: null });
  }
});

// ============================================================
// 主动式 AI 农事管家（需登录）
// ============================================================

// GET /api/agro/my-crops
// 当前用户的作物档案列表
router.get('/my-crops', auth, async (req, res) => {
  try {
    const crops = await UserCrop.findAll({
      where: { userId: req.user.id, status: 1 },
      order: [['id', 'ASC']]
    });
    res.status(200).json({ code: 200, message: '获取成功', data: crops });
  } catch (error) {
    console.error('[agro] 获取作物档案失败:', error);
    res.status(500).json({ code: 500, message: '获取失败', data: null });
  }
});

// POST /api/agro/my-crops  { cropType, region, area?, sowDate?, currentStage? }
// 登记作物（农事管家据此生成个性化日报）
router.post('/my-crops', auth, async (req, res) => {
  try {
    const cropType = String((req.body && req.body.cropType) || '').trim();
    const region = String((req.body && req.body.region) || '').trim();
    if (!cropType) return res.status(400).json({ code: 400, message: '作物名称不能为空', data: null });
    if (!region) return res.status(400).json({ code: 400, message: '种植区域不能为空', data: null });

    const count = await UserCrop.count({ where: { userId: req.user.id, status: 1 } });
    if (count >= MAX_CROPS_PER_USER) {
      return res.status(400).json({ code: 400, message: `每人最多登记 ${MAX_CROPS_PER_USER} 种作物`, data: null });
    }

    const area = req.body.area === '' || req.body.area === undefined ? null : Number(req.body.area);
    if (area !== null && (!Number.isFinite(area) || area <= 0 || area > 100000)) {
      return res.status(400).json({ code: 400, message: '面积数值不合理（0—100000 亩）', data: null });
    }

    const crop = await UserCrop.create({
      userId: req.user.id,
      cropType,
      region,
      area,
      sowDate: String(req.body.sowDate || '').trim() || null,
      currentStage: String(req.body.currentStage || '').trim() || null
    });
    res.status(200).json({ code: 200, message: '登记成功', data: crop });
  } catch (error) {
    console.error('[agro] 登记作物失败:', error);
    res.status(500).json({ code: 500, message: '登记失败，请稍后重试', data: null });
  }
});

// DELETE /api/agro/my-crops/:id
router.delete('/my-crops/:id', auth, async (req, res) => {
  try {
    const crop = await UserCrop.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!crop) {
      return res.status(404).json({ code: 404, message: '作物档案不存在', data: null });
    }
    await crop.destroy();
    res.status(200).json({ code: 200, message: '已删除', data: null });
  } catch (error) {
    console.error('[agro] 删除作物失败:', error);
    res.status(500).json({ code: 500, message: '删除失败', data: null });
  }
});

// GET /api/agro/daily-brief
// **只读**：返回今日已持久化的农事日报（advisory_push）。没有则 found:false，
// 不在此处触发生成——生成是「用户主动触发的慢操作」，见 POST /daily-brief/refresh。
// 这样切页再返回不重复调大模型，日报内容持续留存。
router.get('/daily-brief', auth, async (req, res) => {
  try {
    const date = new Date().toISOString().slice(0, 10);
    const hit = await AdvisoryPush.findOne({ where: { userId: req.user.id, pushDate: date } });
    if (!hit) {
      const cropCount = await dailyBrief.hasCrops(req.user.id);
      return res.status(200).json({
        code: 200,
        message: '今日日报尚未生成',
        data: { found: false, date, hasCrops: cropCount }
      });
    }
    res.status(200).json({
      code: 200,
      message: '获取成功',
      data: {
        found: true,
        date: hit.pushDate,
        brief: hit.content,
        source: hit.source,
        generatedAt: hit.createdAt,
        disclaimer: dailyBrief.DISCLAIMER
      }
    });
  } catch (error) {
    console.error('[agro] 读取农事日报失败:', error);
    res.status(500).json({ code: 500, message: '日报读取失败，请稍后重试', data: null });
  }
});

// POST /api/agro/daily-brief/refresh
// 用户主动触发（首次生成或重新生成）：生成日报 → **持久化到 advisory_push**。
// 生产总览快照的 AI 总结同样读 advisory_push，两处口径一致、切页不丢。
router.post('/daily-brief/refresh', auth, async (req, res) => {
  try {
    const data = await dailyBrief.buildDailyBrief(req.user.id, { persist: true });
    res.status(200).json({
      code: 200,
      message: '获取成功',
      data: {
        found: !!data.brief,
        date: data.date,
        brief: data.brief,
        source: data.source,
        fallbackReason: data.fallbackReason,
        disclaimer: dailyBrief.DISCLAIMER
      }
    });
  } catch (error) {
    console.error('[agro] 生成农事日报失败:', error);
    res.status(500).json({ code: 500, message: '日报生成失败，请稍后重试', data: null });
  }
});

// GET /api/agro/push-history?limit=7
// 历史推送记录（今日 + 往期）
router.get('/push-history', auth, async (req, res) => {
  try {
    const limit = Math.min(30, Math.max(1, parseInt(req.query.limit, 10) || 7));
    const rows = await AdvisoryPush.findAll({
      where: { userId: req.user.id },
      order: [['pushDate', 'DESC'], ['id', 'DESC']],
      limit
    });
    res.status(200).json({ code: 200, message: '获取成功', data: rows });
  } catch (error) {
    console.error('[agro] 获取推送历史失败:', error);
    res.status(500).json({ code: 500, message: '获取失败', data: null });
  }
});

// POST /api/agro/push/run
// 手动触发全量推送（演示现场用；幂等，同日重复触发只保留一条）
router.post('/push/run', auth, async (req, res) => {
  try {
    const result = await dailyBrief.runDailyPush();
    res.status(200).json({ code: 200, message: '推送完成', data: result });
  } catch (error) {
    console.error('[agro] 手动推送失败:', error);
    res.status(500).json({ code: 500, message: '推送失败，请稍后重试', data: null });
  }
});

module.exports = router;
