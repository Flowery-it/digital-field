const express = require('express');
const { auth } = require('../middleware/auth');
const matchService = require('../services/matchService');

const router = express.Router();

router.use(auth);

// POST /api/match/intent  { role, product, quantity?, priceExpect?, region, availableDate?, contact?, remark? }
// 发布供需意向（role: grower 供货 / buyer 收购）
router.post('/intent', async (req, res) => {
  try {
    const row = await matchService.publish(req.user.id, req.body || {});
    res.status(200).json({ code: 200, message: '发布成功', data: row });
  } catch (error) {
    const codeMap = { BAD_ROLE: 400, BAD_PRODUCT: 400, BAD_REGION: 400, BAD_QUANTITY: 400, BAD_PRICE: 400 };
    const status = codeMap[error.code] || 500;
    if (status === 500) console.error('[match] 发布意向失败:', error);
    res.status(status).json({ code: status, message: error.message, data: null });
  }
});

// GET /api/match/my
// 我的意向列表
router.get('/my', async (req, res) => {
  try {
    const rows = await matchService.myIntents(req.user.id);
    res.status(200).json({ code: 200, message: '获取成功', data: rows });
  } catch (error) {
    console.error('[match] 获取我的意向失败:', error);
    res.status(500).json({ code: 500, message: '获取失败', data: null });
  }
});

// POST /api/match/intent/:id/close
// 撤销意向
router.post('/intent/:id/close', async (req, res) => {
  try {
    const row = await matchService.close(req.user.id, req.params.id);
    res.status(200).json({ code: 200, message: '已撤销', data: row });
  } catch (error) {
    const status = error.code === 'NOT_FOUND' ? 404 : 500;
    if (status === 500) console.error('[match] 撤销意向失败:', error);
    res.status(status).json({ code: status, message: error.message, data: null });
  }
});

// GET /api/match/recommend?role=grower&product=冬小麦&region=石家庄
// 匹配推荐：返回对面角色的意向，按时空 + 价格适配 + 出价/货源三维打分排序
router.get('/recommend', async (req, res) => {
  try {
    const data = await matchService.recommend(req.user.id, {
      role: req.query.role,
      product: req.query.product,
      region: req.query.region
    });
    res.status(200).json({ code: 200, message: '获取成功', data });
  } catch (error) {
    const status = error.code === 'BAD_ROLE' ? 400 : 500;
    if (status === 500) console.error('[match] 匹配推荐失败:', error);
    res.status(status).json({ code: status, message: error.message, data: null });
  }
});

// POST /api/match/negotiate  { product, priceExpect }
// AI 谈判助手：评估对方报价并给还价策略（价格事实来自平台预测）
router.post('/negotiate', async (req, res) => {
  try {
    const data = await matchService.negotiate(req.user.id, req.body || {});
    res.status(200).json({ code: 200, message: '获取成功', data: { ...data, disclaimer: matchService.DISCLAIMER } });
  } catch (error) {
    const codeMap = { BAD_INPUT: 400, NO_PRICE: 404 };
    const status = codeMap[error.code] || 500;
    if (status === 500) console.error('[match] 谈判助手失败:', error);
    res.status(status).json({ code: status, message: error.message, data: null });
  }
});

module.exports = router;
