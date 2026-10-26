const express = require('express');
const User = require('../models/User');
const CropData = require('../models/CropData');
const CropRecommend = require('../models/CropRecommend');
const Post = require('../models/Post');
const { adminAuth } = require('../middleware/auth');

const router = express.Router();

// 管理端接口统一走管理员鉴权（JWT + admin 用户名校验）。
// 前端 axios 拦截器会自动带上 Authorization: Bearer <token>。
router.use(adminAuth);

// 用户管理
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    
    const where = {};
    if (status !== undefined) where.status = status;
    
    const offset = (page - 1) * limit;
    
    const { count, rows } = await User.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
    res.status(200).json({
      code: 200,
      message: '获取成功',
      data: {
        list: rows,
        total: count,
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取失败', data: null });
  }
});

router.put('/user/status/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ code: 404, message: '用户不存在', data: null });
    }
    
    await user.update({ status });
    
    res.status(200).json({ code: 200, message: '更新成功', data: user });
  } catch (error) {
    res.status(500).json({ code: 500, message: '更新失败', data: null });
  }
});

// 作物数据管理
router.post('/crop/create', async (req, res) => {
  try {
    const { cropType, year, yield: cropYield, price, region } = req.body;
    
    const cropData = await CropData.create({
      cropType,
      year,
      yield: cropYield,
      price,
      region
    });
    
    res.status(201).json({ code: 201, message: '创建成功', data: cropData });
  } catch (error) {
    res.status(500).json({ code: 500, message: '创建失败', data: null });
  }
});

router.put('/crop/update/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { cropType, year, yield: cropYield, price, region } = req.body;
    
    const cropData = await CropData.findByPk(id);
    if (!cropData) {
      return res.status(404).json({ code: 404, message: '数据不存在', data: null });
    }
    
    await cropData.update({
      cropType,
      year,
      yield: cropYield,
      price,
      region
    });
    
    res.status(200).json({ code: 200, message: '更新成功', data: cropData });
  } catch (error) {
    res.status(500).json({ code: 500, message: '更新失败', data: null });
  }
});

router.delete('/crop/delete/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const cropData = await CropData.findByPk(id);
    if (!cropData) {
      return res.status(404).json({ code: 404, message: '数据不存在', data: null });
    }
    
    await cropData.destroy();
    
    res.status(200).json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    res.status(500).json({ code: 500, message: '删除失败', data: null });
  }
});

// 帖子管理
router.delete('/post/delete/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const post = await Post.findByPk(id);
    if (!post) {
      return res.status(404).json({ code: 404, message: '帖子不存在', data: null });
    }
    
    await post.destroy();
    
    res.status(200).json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    res.status(500).json({ code: 500, message: '删除失败', data: null });
  }
});

// 统计数据（管理端首页，替代硬编码假数字）
router.get('/stats', async (req, res) => {
  try {
    const [userCount, cropCount, postCount] = await Promise.all([
      User.count(),
      CropData.count(),
      Post.count()
    ]);
    res.status(200).json({
      code: 200,
      message: '获取成功',
      data: { userCount, cropCount, postCount }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取失败', data: null });
  }
});

module.exports = router;
