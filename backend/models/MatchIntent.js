const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// match_intent 产销对接意向
// 种植户发布「卖」意向、经销商发布「买」意向，平台按三维规则匹配：
// 时空（地区 + 上市时间）+ 价格适配（价格预测给报价区间）+ 智能排序
const MatchIntent = sequelize.define('MatchIntent', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '发布人 user.id'
  },
  role: {
    type: DataTypes.STRING(8),
    allowNull: false,
    comment: 'grower 卖 / buyer 买'
  },
  product: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: '品种，如 冬小麦'
  },
  quantity: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true,
    comment: '数量（吨）'
  },
  priceExpect: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    comment: '期望价（元/公斤）'
  },
  region: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: '所在地（城市名）'
  },
  availableDate: {
    type: DataTypes.STRING(10),
    allowNull: true,
    comment: '可上市/可收购日期 YYYY-MM-DD'
  },
  contact: {
    type: DataTypes.STRING(64),
    allowNull: true,
    comment: '联系方式（演示用，真实场景应做隐私保护）'
  },
  remark: {
    type: DataTypes.STRING(200),
    allowNull: true
  },
  status: {
    type: DataTypes.STRING(8),
    defaultValue: 'open',
    comment: 'open 开放 / closed 已成交或撤销'
  },
  createTime: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'match_intent',
  timestamps: false,
  comment: '产销对接意向表'
});

module.exports = MatchIntent;
