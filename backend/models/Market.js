const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// dim_market 市场维度表
// 字段设计依据《农产品价格与气象服务平台方案雏形》4.2 节
const Market = sequelize.define('Market', {
  marketId: {
    type: DataTypes.STRING(32),
    primaryKey: true,
    comment: '主键'
  },
  name: {
    type: DataTypes.STRING(64),
    allowNull: false,
    comment: '市场全称'
  },
  province: {
    type: DataTypes.STRING(32),
    comment: '所在省'
  },
  city: {
    type: DataTypes.STRING(32),
    comment: '所在市'
  },
  lon: {
    type: DataTypes.DECIMAL(9, 6),
    comment: '经度，供天气定位'
  },
  lat: {
    type: DataTypes.DECIMAL(9, 6),
    comment: '纬度'
  },
  marketType: {
    type: DataTypes.STRING(16),
    allowNull: false,
    comment: '产地型 / 销地型 / 集散型'
  },
  tier: {
    type: DataTypes.SMALLINT,
    defaultValue: 2,
    comment: '重要度分级，1 为标杆市场'
  },
  sourceKey: {
    type: DataTypes.STRING(64),
    comment: '在源系统中的市场名称，用于对齐'
  }
}, {
  tableName: 'dim_market',
  timestamps: false,
  comment: '市场维度表'
});

module.exports = Market;
