const express = require('express');
const cors = require('cors');
const sequelize = require('./config/database');
require('dotenv').config();

// 导入模型
const User = require('./models/User');
const CropData = require('./models/CropData');
const CropRecommend = require('./models/CropRecommend');
const Post = require('./models/Post');

// 导入路由
const authRoutes = require('./routes/auth');
const cropRoutes = require('./routes/crop');
const recommendRoutes = require('./routes/recommend');
const postRoutes = require('./routes/post');
const adminRoutes = require('./routes/admin');
const weatherRoutes = require('./routes/weather');
const priceRoutes = require('./routes/price');
const marketRoutes = require('./routes/market');
const agroRoutes = require('./routes/agro');
const aiRoutes = require('./routes/ai');
const benefitRoutes = require('./routes/benefit');
const fertilizeRoutes = require('./routes/fertilize');
const yieldRoutes = require('./routes/yield');
const dashboardRoutes = require('./routes/dashboard');
const matchRoutes = require('./routes/match');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
// JSON 体积上限 8mb：拍照识病以 base64 传图（单张约 1—2MB），
// 默认 100kb 会被全局 body-parser 先行拦截（路由级 limit 救不回来）
app.use(express.json({ limit: '8mb' }));

// 日志中间件
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// 路由
app.use('/api/auth', authRoutes);
app.use('/api/crop', cropRoutes);
app.use('/api/recommend', recommendRoutes);
app.use('/api/post', postRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/price', priceRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/agro', agroRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/benefit', benefitRoutes);
app.use('/api/fertilize', fertilizeRoutes);
app.use('/api/yield', yieldRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/match', matchRoutes);

// 测试路由
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to Crop Data API' });
});

// 健康检查（供部署探活）
app.get('/health', (req, res) => {
  res.status(200).json({ code: 200, message: '服务运行正常', data: { uptime: process.uptime() } });
});

// 404处理
app.use((req, res) => {
  res.status(404).json({ code: 404, message: 'API not found', data: null });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] Error: ${err.message}`);
  console.error(err.stack);
  res.status(500).json({ code: 500, message: 'Internal server error', data: null });
});

// 数据库同步
sequelize.sync({ force: false }).then(async () => {
  console.log('Database synchronized');

  // 轻量列迁移：论坛板块分类字段。SQLite 下用 PRAGMA 检查列是否存在，
  // 不存在时 ALTER TABLE ADD COLUMN 补列，已有帖子数据不受影响。
  try {
    const [cols] = await sequelize.query("PRAGMA table_info('post')");
    const colNames = (cols || []).map(c => c.name);
    if (!colNames.includes('category')) {
      await sequelize.query("ALTER TABLE post ADD COLUMN category TEXT DEFAULT '综合讨论'");
      console.log('post 表已新增 category 列（论坛板块分类）');
    }
  } catch (err) {
    console.error('post.category 列检查/迁移失败:', err.message);
  }

  // 兜底创建默认管理员（原 server.js 的职责，合并到唯一入口）。
  // 密码取环境变量 ADMIN_DEFAULT_PASSWORD，默认 admin123，生产部署必须修改。
  try {
    const adminExists = await User.findOne({ where: { username: 'admin' } });
    if (!adminExists) {
      const bcrypt = require('bcrypt');
      const hashed = await bcrypt.hash(process.env.ADMIN_DEFAULT_PASSWORD || 'admin123', 10);
      await User.create({ username: 'admin', password: hashed, status: 1 });
      console.log('默认管理员账号创建成功（admin / ' + (process.env.ADMIN_DEFAULT_PASSWORD || 'admin123') + '）');
    }
  } catch (err) {
    console.error('管理员兜底创建失败:', err.message);
  }

  // 兜底创建演示账号（视频录制/答辩现场零意外；与 admin 同款幂等逻辑）
  try {
    const demoExists = await User.findOne({ where: { username: 'demo' } });
    if (!demoExists) {
      const bcrypt = require('bcrypt');
      const hashed = await bcrypt.hash(process.env.DEMO_DEFAULT_PASSWORD || 'demo123', 10);
      await User.create({ username: 'demo', password: hashed, status: 1 });
      console.log('演示账号创建成功（demo / ' + (process.env.DEMO_DEFAULT_PASSWORD || 'demo123') + '）');
    }
  } catch (err) {
    console.error('演示账号兜底创建失败:', err.message);
  }

  // 农事管家定时推送：每日 06:00 后为有种作物的用户生成日报（内部容错，不影响主服务）
  try {
    require('./services/dailyBriefService').initScheduler();
  } catch (err) {
    console.error('农事管家调度器启动失败:', err.message);
  }

  // 生产总览快照：每日 06:30 后为有种作物的用户各生成一次（读库复用，不重复实时计算）
  try {
    require('./services/dashboardSnapshotService').initScheduler();
  } catch (err) {
    console.error('生产总览快照调度器启动失败:', err.message);
  }
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
