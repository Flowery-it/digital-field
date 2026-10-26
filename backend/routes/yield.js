const express = require('express');
const { auth } = require('../middleware/auth');
const yieldService = require('../services/yieldService');
const aiGen = require('../services/aiGenerationService');

const router = express.Router();

router.use(auth);

// GET /api/yield/estimate?crop=&region=&vigor=
// **只读**：命中已留存结果直接返回；未命中返回 found:false（不触发测算）。
// 生成逻辑见 POST /estimate/refresh。
router.get('/estimate', async (req, res) => {
  const crop = String(req.query.crop || '').trim();
  const region = String(req.query.region || '').trim();
  const vigor = String(req.query.vigor || '').trim();

  if (!crop) {
    return res.status(400).json({ code: 400, message: '请选择作物', data: null });
  }
  if (!region) {
    return res.status(400).json({ code: 400, message: '请选择区域', data: null });
  }

  try {
    const scopeKey = `${crop}|${region}|${vigor || '一般'}`;
    const hit = await aiGen.get(req.user.id, 'yield', scopeKey);
    if (!hit) {
      return res.status(200).json({ code: 200, message: '暂无已留存的测算结果', data: { found: false, scopeKey } });
    }
    res.status(200).json({
      code: 200,
      message: '获取成功',
      data: { found: true, scopeKey, generatedAt: hit.generatedAt, source: hit.source, payload: hit.payload }
    });
  } catch (error) {
    console.error('[yield] 读取留存测算失败:', error);
    res.status(500).json({ code: 500, message: '读取失败，请稍后重试', data: null });
  }
});

// POST /api/yield/estimate/refresh  { crop, region, vigor? }
// 用户主动触发（首次生成或重新生成）：产量预估 + 收益测算 → 持久化覆盖。
router.post('/estimate/refresh', async (req, res) => {
  const body = req.body || {};
  const crop = String(body.crop || '').trim();
  const region = String(body.region || '').trim();
  const vigor = String(body.vigor || '').trim();

  if (!crop) {
    return res.status(400).json({ code: 400, message: '请选择作物', data: null });
  }
  if (!region) {
    return res.status(400).json({ code: 400, message: '请选择区域', data: null });
  }

  try {
    const scopeKey = `${crop}|${region}|${vigor || '一般'}`;
    const r = await aiGen.refresh(req.user.id, 'yield', scopeKey, async () => {
      const data = await yieldService.estimate({
        cropType: crop,
        region,
        vigor: vigor || undefined
      });
      return { ...data, source: data.source };
    });
    if (!r.ok) {
      return res.status(500).json({ code: 500, message: '测算失败，请稍后重试', data: null });
    }
    res.status(200).json({
      code: 200,
      message: '测算成功',
      data: { found: true, scopeKey, generatedAt: r.generatedAt, source: r.source, payload: r.payload }
    });
  } catch (error) {
    const statusMap = { BAD_CROP: 400, BAD_REGION: 400, NO_HISTORY: 404 };
    const status = statusMap[error.code] || 500;
    if (status === 500) console.error('[yield] 产量预估失败:', error);
    res.status(status).json({ code: status, message: error.message, data: null });
  }
});

module.exports = router;
