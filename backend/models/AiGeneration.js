const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// ai_generation AI 生成结果持久化表
// ----------------------------------
// 设计目标（2026-10-16 用户需求）：所有 AI 生成的项目在**用户首次生成后持久化保留**，
// 用户切换到其他页面再返回时数据不丢失、不重置，持续显示直到用户**主动触发重新生成**。
//
// 用法：模块 + 范围键唯一确定一条记录。
//   module: recommend 品种推荐 / fertilize 施肥打药 / yield 产量预估 /
//           chat 农事问答 / annual_report 年度报告
//   scopeKey: 该模块内的业务范围（如 region|category、crop|stage|region、year）
const AiGeneration = sequelize.define('AiGeneration', {
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
    type: DataTypes.STRING(24),
    allowNull: false,
    comment: '模块：recommend / fertilize / yield / chat / annual_report'
  },
  scopeKey: {
    type: DataTypes.STRING(128),
    allowNull: false,
    comment: '范围键，如 region|category、crop|stage|region、year、city'
  },
  source: {
    type: DataTypes.STRING(16),
    allowNull: false,
    defaultValue: 'llm',
    comment: '生成来源：llm / rule-engine / template'
  },
  payload: {
    type: DataTypes.TEXT,
    allowNull: null,
    comment: '生成结果 JSON 字符串'
  },
  status: {
    type: DataTypes.STRING(8),
    allowNull: false,
    defaultValue: 'ok',
    comment: 'ok / error'
  },
  errorMessage: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  generatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'ai_generation',
  timestamps: false,
  indexes: [
    { unique: true, fields: ['userId', 'module', 'scopeKey'], name: 'uniq_ai_gen_scope' }
  ],
  comment: 'AI 生成结果持久化表'
});

module.exports = AiGeneration;
