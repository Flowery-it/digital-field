const express = require('express');
const { Op } = require('sequelize');
// 必须从 models/index.js 引入：User-Post 关联定义在那里，直接 require 单个模型文件会导致关联未注册
const { Post, User } = require('../models');
const { auth } = require('../middleware/auth');

const router = express.Router();

// 论坛板块（与前端保持一致）
const CATEGORIES = ['种植技术', '病虫害防治', '市场行情', '政策资讯', '综合讨论'];

// 获取板块列表及各板块帖子数
router.get('/categories', async (req, res) => {
  try {
    const list = await Promise.all(
      CATEGORIES.map(async (name) => ({
        name,
        count: await Post.count({ where: { category: name } })
      }))
    );
    const total = await Post.count();
    res.status(200).json({ code: 200, message: '获取成功', data: { list, total } });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取失败', data: null });
  }
});

// 获取帖子列表
// 支持 keyword（标题/内容模糊搜索）、category（板块）、sort=newest|oldest、userId（我的帖子）
router.get('/list', async (req, res) => {
  try {
    const { userId, keyword, category, sort = 'newest', page = 1, limit = 10 } = req.query;

    const where = {};
    if (userId) where.userId = parseInt(userId);
    if (category && category !== 'all') where.category = category;
    if (keyword) {
      where[Op.or] = [
        { title: { [Op.like]: `%${keyword}%` } },
        { content: { [Op.like]: `%${keyword}%` } }
      ];
    }

    const offset = (page - 1) * limit;
    const order = sort === 'oldest' ? [['createTime', 'ASC']] : [['createTime', 'DESC']];

    const { count, rows } = await Post.findAndCountAll({
      where,
      include: [{
        model: User,
        attributes: ['id', 'username']
      }],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order
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

// 获取帖子详情
router.get('/detail/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const post = await Post.findByPk(id, {
      include: [{
        model: User,
        attributes: ['id', 'username']
      }]
    });

    if (!post) {
      return res.status(404).json({ code: 404, message: '帖子不存在', data: null });
    }

    res.status(200).json({ code: 200, message: '获取成功', data: post });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取失败', data: null });
  }
});

// 创建帖子（需登录）：作者身份取自 Token，不再信任客户端传入的 userId
router.post('/create', auth, async (req, res) => {
  try {
    const { title, content, category = '综合讨论' } = req.body;
    const userId = req.user.id;

    if (!title || !content) {
      return res.status(400).json({ code: 400, message: '标题和内容不能为空', data: null });
    }

    const post = await Post.create({
      title,
      content,
      category: CATEGORIES.includes(category) ? category : '综合讨论',
      userId,
      createTime: new Date(),
      updateTime: new Date()
    });

    res.status(201).json({ code: 201, message: '创建成功', data: post });
  } catch (error) {
    res.status(500).json({ code: 500, message: '创建失败', data: null });
  }
});

// 兼容旧版前端路径（/post/add 与 /post/create 等价）
router.post('/add', auth, async (req, res) => {
  try {
    const { title, content, category = '综合讨论' } = req.body;
    const userId = req.user.id;

    if (!title || !content) {
      return res.status(400).json({ code: 400, message: '标题和内容不能为空', data: null });
    }

    const post = await Post.create({
      title,
      content,
      category: CATEGORIES.includes(category) ? category : '综合讨论',
      userId,
      createTime: new Date(),
      updateTime: new Date()
    });

    res.status(201).json({ code: 201, message: '创建成功', data: post });
  } catch (error) {
    res.status(500).json({ code: 500, message: '创建失败', data: null });
  }
});

// 更新帖子（需登录）：作者本人或管理员可操作
router.put('/update/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, category } = req.body;

    const post = await Post.findByPk(id);
    if (!post) {
      return res.status(404).json({ code: 404, message: '帖子不存在', data: null });
    }

    const isAdmin = req.user.username === 'admin';
    if (post.userId !== req.user.id && !isAdmin) {
      return res.status(403).json({ code: 403, message: '无权更新他人帖子', data: null });
    }

    await post.update({
      title,
      content,
      category: CATEGORIES.includes(category) ? category : post.category,
      updateTime: new Date()
    });

    res.status(200).json({ code: 200, message: '更新成功', data: post });
  } catch (error) {
    res.status(500).json({ code: 500, message: '更新失败', data: null });
  }
});

// 删除帖子（需登录）：作者本人或管理员可操作
router.delete('/delete/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const post = await Post.findByPk(id);
    if (!post) {
      return res.status(404).json({ code: 404, message: '帖子不存在', data: null });
    }

    const isAdmin = req.user.username === 'admin';
    if (post.userId !== req.user.id && !isAdmin) {
      return res.status(403).json({ code: 403, message: '无权删除他人帖子', data: null });
    }

    await post.destroy();

    res.status(200).json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    res.status(500).json({ code: 500, message: '删除失败', data: null });
  }
});

module.exports = router;
