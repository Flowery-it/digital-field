const express = require('express');
const { auth } = require('../middleware/auth');
const snapshotService = require('../services/dashboardSnapshotService');

const router = express.Router();

router.use(auth);

// GET /api/dashboard/snapshot
// 读取今日快照（命中即返回，毫秒级）；当天无快照时即时生成一次并落库
router.get('/snapshot', async (req, res) => {
  try {
    const data = await snapshotService.getSnapshot(req.user.id, false);
    res.status(200).json({ code: 200, message: '获取成功', data });
  } catch (error) {
    console.error('[dashboard] 读取快照失败:', error);
    res.status(500).json({ code: 500, message: '生产总览读取失败，请稍后重试', data: null });
  }
});

// POST /api/dashboard/snapshot/refresh
// 手动刷新：强制重新生成并覆盖当日快照（status/errorMessage 一并返回供前端展示）
router.post('/snapshot/refresh', async (req, res) => {
  try {
    const data = await snapshotService.getSnapshot(req.user.id, true);
    res.status(200).json({ code: 200, message: '刷新完成', data });
  } catch (error) {
    console.error('[dashboard] 刷新快照失败:', error);
    res.status(500).json({ code: 500, message: '刷新失败，请稍后重试', data: null });
  }
});

module.exports = router;
