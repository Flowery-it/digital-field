const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// user_crop 用户作物档案（主动式 AI 农事管家的数据基础）
// 用户登记自己种的作物，农事管家据此生成个性化日报与灾害预警
const UserCrop = sequelize.define('UserCrop', {
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
  cropType: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: '作物名称，如 冬小麦'
  },
  region: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: '种植区域（城市名，与天气服务口径一致）'
  },
  area: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    comment: '种植面积（亩）'
  },
  sowDate: {
    type: DataTypes.STRING(10),
    allowNull: true,
    comment: '播种/移栽日期 YYYY-MM-DD'
  },
  currentStage: {
    type: DataTypes.STRING(32),
    allowNull: true,
    comment: '当前生育期，如 拔节期'
  },
  status: {
    type: DataTypes.TINYINT,
    defaultValue: 1,
    comment: '1 在种 / 0 已收获或删除'
  },
  createTime: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'user_crop',
  timestamps: false,
  comment: '用户作物档案表'
});

module.exports = UserCrop;
