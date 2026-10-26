const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
require('dotenv').config();

const router = express.Router();
// 兜底值仅用于本地开发（未配置 .env 时签名/验签自洽）；生产部署必须配置 JWT_SECRET
const SECRET_KEY = process.env.JWT_SECRET || 'your-secret-key';

// 注册
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    // 检查用户名是否已存在
    const existingUser = await User.findOne({ where: { username } });
    if (existingUser) {
      return res.status(400).json({ code: 400, message: '用户名已存在', data: null });
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10);

    // 创建用户
    const user = await User.create({ username, password: hashedPassword });

    // HTTP 状态保持 201；响应体 code 用 200，与全局响应拦截器契约一致（code !== 200 即拒绝）
    res.status(201).json({ code: 200, message: '注册成功', data: { id: user.id, username: user.username } });
  } catch (error) {
    res.status(500).json({ code: 500, message: '注册失败', data: null });
  }
});

// 登录
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // 查找用户
    const user = await User.findOne({ where: { username } });
    if (!user) {
      return res.status(401).json({ code: 401, message: '用户名或密码错误', data: null });
    }

    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ code: 401, message: '用户名或密码错误', data: null });
    }

    // 生成Token
    const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '2h' });

    // role 由用户名派生，与 middleware/auth.js 的 adminAuth 判定口径一致（用户表暂无 role 列）
    const role = user.username === 'admin' ? 'admin' : 'user';

    res.status(200).json({ code: 200, message: '登录成功', data: { token, user: { id: user.id, username: user.username, role } } });
  } catch (error) {
    res.status(500).json({ code: 500, message: '登录失败', data: null });
  }
});

// 退出登录
router.post('/logout', (req, res) => {
  // 前端清除token即可
  res.status(200).json({ code: 200, message: '退出成功', data: null });
});

module.exports = router;
