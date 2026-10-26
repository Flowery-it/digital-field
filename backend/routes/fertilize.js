const express = require('express');
const { auth } = require('../middleware/auth');
const fertilizerService = require('../services/fertilizerService');
const aiGen = require('../services/aiGenerationService');

const router = express.Router();

// 施肥打药建议会调用大模型生成表达层，与 /api/ai/chat 同一防滥用口径：需登录
router.use(auth);

/**
 * 把已留存的建议按当前面积实时折算总量。
 * 面积**不进缓存键**：换面积只是乘算，不应触发 40 秒级的大模型重新生成。
 */
function applyArea(payload, area) {
  if (!payload || !area || !(Number(area) > 0)) return payload;
  const n = Number(area);
  const bf = payload.baseFertilizer || {};
  return {
    ...payload,
    fertilizerTotal: {
      n: Number(((bf.n || 0) * n).toFixed(1)),
      p: Number(((bf.p || 0) * n).toFixed(1)),
      k: Number(((bf.k || 0) * n).toFixed(1)),
      unit: `公斤（${n} 亩）`
    }
  };
}

// GET /api/fertilize/advice?crop=&stage=&region=&area=
// **只读**：命中已留存结果直接返回（面积差异实时折算）；未命中返回 found:false。
router.get('/advice', async (req, res) => {
  const crop = String(req.query.crop || '').trim();
  const stage = String(req.query.stage || '').trim();
  const region = String(req.query.region || '').trim();
  const area = String(req.query.area || '').trim();

  if (!crop) {
    return res.status(400).json({ code: 400, message: '请选择作物', data: null });
  }

  try {
    // 缓存键不含面积（面积只影响总量折算），与生成侧保持一致
    const scopeKey = `${crop}|${stage || 'auto'}|${region || 'none'}`;
    const hit = await aiGen.get(req.user.id, 'fertilize', scopeKey);
    if (!hit) {
      return res.status(200).json({ code: 200, message: '暂无已留存的建议', data: { found: false, scopeKey } });
    }
    res.status(200).json({
      code: 200,
      message: '获取成功',
      data: { found: true, scopeKey, generatedAt: hit.generatedAt, source: hit.source, payload: applyArea(hit.payload, area) }
    });
  } catch (error) {
    console.error('[fertilize] 读取留存建议失败:', error);
    res.status(500).json({ code: 500, message: '读取失败，请稍后重试', data: null });
  }
});

// POST /api/fertilize/advice/refresh  { crop, stage?, region?, area? }
// 用户主动触发（首次生成或重新生成）：生成建议 + 气象调整 + 病虫害预警 → 持久化覆盖。
router.post('/advice/refresh', async (req, res) => {
  const body = req.body || {};
  const crop = String(body.crop || '').trim();
  const stage = String(body.stage || '').trim();
  const region = String(body.region || '').trim();
  const area = String(body.area || '').trim();

  if (!crop) {
    return res.status(400).json({ code: 400, message: '请选择作物', data: null });
  }

  try {
    const scopeKey = `${crop}|${stage || 'auto'}|${region || 'none'}`;
    const r = await aiGen.refresh(req.user.id, 'fertilize', scopeKey, async () => {
      const data = await fertilizerService.buildAdvice({
        cropType: crop,
        stage: stage || undefined,
        region: region || undefined,
        area: area || undefined
      });
      return { ...data, source: data.source };
    });
    if (!r.ok) {
      return res.status(500).json({ code: 500, message: '建议生成失败，请稍后重试', data: null });
    }
    res.status(200).json({
      code: 200,
      message: '生成成功',
      data: { found: true, scopeKey, generatedAt: r.generatedAt, source: r.source, payload: applyArea(r.payload, area) }
    });
  } catch (error) {
    if (error.code === 'BAD_CROP') {
      return res.status(400).json({ code: 400, message: error.message, data: null });
    }
    console.error('[fertilize] 生成施肥建议失败:', error);
    res.status(500).json({ code: 500, message: '生成建议失败，请稍后重试', data: null });
  }
});

// GET /api/fertilize/options
// 枚举项：生育期候选（前端下拉用，避免手输）
router.get('/options', (req, res) => {
  res.status(200).json({
    code: 200,
    message: '获取成功',
    data: { stageOptions: fertilizerService.stageOptions }
  });
});

module.exports = router;
