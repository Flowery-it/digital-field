const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// dim_agro_rule 农事提醒规则库
// 字段设计依据《农产品价格与气象服务平台方案雏形》4.5 节，
// 并按调研报告建议补充「耐受阈值」维度（参考 Nala Earth 的
// 「作物 × 生育期 × 耐受阈值」风险建模思路）
const AgroRule = sequelize.define('AgroRule', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  productId: {
    type: DataTypes.STRING(32),
    allowNull: false,
    comment: '适用品种，关联 dim_product.product_id'
  },
  growthStage: {
    type: DataTypes.STRING(32),
    allowNull: false,
    comment: '适用生育期，如 开花期'
  },
  windowStart: {
    type: DataTypes.SMALLINT,
    allowNull: false,
    comment: '生育期起始月份 1-12'
  },
  windowEnd: {
    type: DataTypes.SMALLINT,
    allowNull: false,
    comment: '生育期结束月份 1-12'
  },
  riskType: {
    type: DataTypes.STRING(32),
    allowNull: false,
    comment: '风险类型：frost 霜冻 / rain 连阴雨 / heat 高温 / wind 大风'
  },
  thresholdJson: {
    type: DataTypes.JSON,
    allowNull: false,
    comment: '触发阈值，如 {"tempMinLt":3,"precipGt":25}'
  },
  adviceText: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: '命中后展示的建议文案'
  },
  severity: {
    type: DataTypes.SMALLINT,
    defaultValue: 1,
    comment: '严重程度 1-3，3 最高，用于排序'
  }
}, {
  tableName: 'dim_agro_rule',
  timestamps: false,
  comment: '农事提醒规则库'
});

module.exports = AgroRule;
