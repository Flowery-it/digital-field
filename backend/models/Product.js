const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// dim_product 品种维度表
// 字段设计依据《农产品价格与气象服务平台方案雏形》4.1 节
const Product = sequelize.define('Product', {
  productId: {
    type: DataTypes.STRING(32),
    primaryKey: true,
    comment: '主键，如 GRAIN_WHEAT'
  },
  name: {
    type: DataTypes.STRING(32),
    allowNull: false,
    comment: '中文名，如 冬小麦'
  },
  category: {
    type: DataTypes.STRING(16),
    allowNull: false,
    comment: 'grain 粮食 / veg 蔬菜 / fruit 水果'
  },
  alias: {
    type: DataTypes.STRING(128),
    comment: '别名，用于匹配不同数据源的叫法'
  },
  baseUnit: {
    type: DataTypes.STRING(8),
    defaultValue: 'kg',
    comment: '标准单位，固定 kg'
  },
  spec: {
    type: DataTypes.STRING(64),
    comment: '规格口径，如「中等」「通货」'
  },
  growthStages: {
    type: DataTypes.JSON,
    comment: '生育期定义及起止月份，供农事提醒使用'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: '是否上线'
  }
}, {
  tableName: 'dim_product',
  timestamps: false,
  comment: '品种维度表'
});

module.exports = Product;
