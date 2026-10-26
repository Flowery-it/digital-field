const express = require('express');
const { auth } = require('../middleware/auth');
const benefitService = require('../services/benefitService');
const aiGen = require('../services/aiGenerationService');

const router = express.Router();

// 收益台账全部需登录：数据属用户个人资产，避免被当作公共算力滥用
router.use(auth);

// POST /api/benefit/record  { module, item, amountYuan, basis }
// 采纳某个 AI 建议时登记一笔估算收益（basis 必填，保证可追溯）
router.post('/record', async (req, res) => {
  try {
    const row = await benefitService.record(req.user.id, req.body || {});
    res.status(200).json({ code: 200, message: '登记成功', data: row });
  } catch (error) {
    const codeMap = { BAD_MODULE: 400, BAD_ITEM: 400, BAD_AMOUNT: 400, BAD_BASIS: 400 };
    const status = codeMap[error.code] || 500;
    if (status === 500) console.error('[benefit] 登记收益失败:', error);
    res.status(status).json({ code: status, message: error.message, data: null });
  }
});

// GET /api/benefit/summary
// 累计收益 + 分模块 + 最近明细（前端可验算：合计 = 明细之和）
router.get('/summary', async (req, res) => {
  try {
    const data = await benefitService.summary(req.user.id);
    res.status(200).json({ code: 200, message: '获取成功', data });
  } catch (error) {
    console.error('[benefit] 获取收益汇总失败:', error);
    res.status(500).json({ code: 500, message: '获取失败', data: null });
  }
});

// GET /api/benefit/annual-report?year=2026
// **只读**：命中已留存的年度报告直接返回；未命中返回 found:false（不生成）。
router.get('/annual-report', async (req, res) => {
  try {
    const year = req.query.year ? parseInt(String(req.query.year), 10) : new Date().getFullYear();
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      return res.status(400).json({ code: 400, message: '年份不合法', data: null });
    }
    const hit = await aiGen.get(req.user.id, 'annual_report', String(year));
    if (!hit) {
      return res.status(200).json({ code: 200, message: '暂无已留存的年度报告', data: { found: false } });
    }
    res.status(200).json({ code: 200, message: '获取成功', data: { found: true, generatedAt: hit.generatedAt, payload: hit.payload } });
  } catch (error) {
    console.error('[benefit] 读取年度报告失败:', error);
    res.status(500).json({ code: 500, message: '读取失败，请稍后重试', data: null });
  }
});

// POST /api/benefit/annual-report  { year? }
// 用户主动触发（首次生成或重新生成）：年度 AI 助农报告（数字全部来自台账）→ 持久化。
router.post('/annual-report', async (req, res) => {
  try {
    const year = req.body && req.body.year;
    const y = year ? parseInt(String(year), 10) : new Date().getFullYear();
    if (!Number.isFinite(y) || y < 2000 || y > 2100) {
      return res.status(400).json({ code: 400, message: '年份不合法', data: null });
    }
    const r = await aiGen.refresh(req.user.id, 'annual_report', String(y), async () => {
      const data = await benefitService.annualReport(req.user.id, y);
      return { ...data, source: data.source };
    });
    if (!r.ok) {
      return res.status(500).json({ code: 500, message: r.error || '生成年度报告失败', data: null });
    }
    res.status(200).json({ code: 200, message: '获取成功', data: { found: true, generatedAt: r.generatedAt, payload: r.payload } });
  } catch (error) {
    const status = error.code === 'BAD_YEAR' ? 400 : 500;
    if (status === 500) console.error('[benefit] 生成年度报告失败:', error);
    res.status(status).json({ code: status, message: error.message, data: null });
  }
});

module.exports = router;
