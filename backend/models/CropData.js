const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CropData = sequelize.define('CropData', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  cropType: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  year: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  yield: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  price: {
    type: DataTypes.DECIMAL(8, 2),
    allowNull: false
  },
  region: {
    type: DataTypes.STRING(50),
    allowNull: false
  }
}, {
  tableName: 'crop_data',
  timestamps: false
});

module.exports = CropData;
