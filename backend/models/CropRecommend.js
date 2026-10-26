const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CropRecommend = sequelize.define('CropRecommend', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  region: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  cropType: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  // 作物大类：基本粮食作物 / 经济作物
  category: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  recommendIndex: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  reason: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  estimateYield: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  }
}, {
  tableName: 'crop_recommend',
  timestamps: false
});

module.exports = CropRecommend;
