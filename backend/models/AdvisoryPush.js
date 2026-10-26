const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// advisory_push 农事管家推送记录
// 每日为用户生成的农事日报留痕：内容、来源（llm/rule-engine）均可追溯
const AdvisoryPush = sequelize.define('AdvisoryPush', {
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
  pushDate: {
    type: DataTypes.STRING(10),
    allowNull: false,
    comment: '推送日期 YYYY-MM-DD'
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: '日报正文'
  },
  source: {
    type: DataTypes.STRING(16),
    allowNull: false,
    comment: '生成来源：llm / rule-engine'
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'advisory_push',
  timestamps: false,
  comment: '农事管家推送记录表'
});

module.exports = AdvisoryPush;
