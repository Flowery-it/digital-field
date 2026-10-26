const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// benefit_ledger AI 助农收益台账
// 每条记录必须带 basis（依据）：采纳了哪个建议、按什么口径估算，
// 保证「AI 帮我赚了多少钱」可追溯、可验算，不是拍脑袋数字
const BenefitLedger = sequelize.define('BenefitLedger', {
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
  module: {
    type: DataTypes.STRING(16),
    allowNull: false,
    comment: '来源模块：recommend 品种推荐 / fertilize 施肥打药 / forecast 价格预测 / match 产销对接'
  },
  item: {
    type: DataTypes.STRING(64),
    allowNull: false,
    comment: '条目，如作物名或建议名'
  },
  amountYuan: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    comment: '估算金额（元），正为增收/节本'
  },
  basis: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: '估算依据（必填），如推荐理由或节本率口径'
  },
  createTime: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'benefit_ledger',
  timestamps: false,
  comment: 'AI 助农收益台账表'
});

module.exports = BenefitLedger;
