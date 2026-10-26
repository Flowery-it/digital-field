const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// fact_price_daily 价格日表（核心事实表）
// 字段设计依据《农产品价格与气象服务平台方案雏形》4.4 节
const PriceDaily = sequelize.define('PriceDaily', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  productId: {
    type: DataTypes.STRING(32),
    allowNull: false,
    comment: '关联 dim_product.product_id'
  },
  marketId: {
    type: DataTypes.STRING(32),
    allowNull: false,
    comment: '关联 dim_market.market_id'
  },
  priceDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    comment: '报价日期，非采集时间'
  },
  priceLow: {
    type: DataTypes.DECIMAL(10, 2),
    comment: '最低价'
  },
  priceHigh: {
    type: DataTypes.DECIMAL(10, 2),
    comment: '最高价'
  },
  priceAvg: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: '均价，页面主用字段'
  },
  unit: {
    type: DataTypes.STRING(8),
    defaultValue: 'kg',
    comment: '原始单位，kg 或 jin'
  },
  currency: {
    type: DataTypes.STRING(8),
    defaultValue: 'CNY',
    comment: '固定 CNY'
  },
  changePctDod: {
    type: DataTypes.DECIMAL(6, 2),
    comment: '较昨日涨跌百分比'
  },
  changePctWow: {
    type: DataTypes.DECIMAL(6, 2),
    comment: '较上周涨跌百分比'
  },
  changePctYoy: {
    type: DataTypes.DECIMAL(6, 2),
    comment: '较去年同期涨跌百分比'
  },
  source: {
    type: DataTypes.STRING(32),
    defaultValue: 'pfsc.agri.cn',
    comment: '数据源标识'
  },
  sourceUrl: {
    type: DataTypes.STRING(255),
    comment: '原始出处链接，便于溯源'
  },
  collectedAt: {
    type: DataTypes.DATE,
    comment: '采集时间'
  },
  qualityFlag: {
    type: DataTypes.SMALLINT,
    defaultValue: 0,
    comment: '0 正常 / 1 缺失补插 / 2 异常待核'
  }
}, {
  tableName: 'fact_price_daily',
  timestamps: false,
  comment: '价格日表',
  indexes: [
    { fields: ['productId', 'marketId', 'priceDate'], unique: true },
    { fields: ['priceDate'] }
  ]
});

module.exports = PriceDaily;
