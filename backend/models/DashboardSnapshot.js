const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// dashboard_snapshot 生产总览快照
// 策略：每日生成一次并持久化，页面请求直接读取；仅用户手动刷新时重新生成。
// payload 为聚合结果 JSON（天气/农事风险/作物档案/收益台账/农事日报引用）。
const DashboardSnapshot = sequelize.define('DashboardSnapshot', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '关联 user.id'
  },
  snapshotDate: {
    type: DataTypes.STRING(10),
    allowNull: false,
    comment: '快照日期 YYYY-MM-DD（每日一条）'
  },
  status: {
    type: DataTypes.STRING(8),
    allowNull: false,
    comment: 'ok / error'
  },
  errorMessage: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '生成失败原因（供前端展示与重试）'
  },
  payload: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '聚合结果 JSON 字符串'
  },
  durationMs: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '生成耗时（毫秒）'
  },
  generatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'dashboard_snapshot',
  timestamps: false,
  comment: '生产总览快照表'
});

module.exports = DashboardSnapshot;
