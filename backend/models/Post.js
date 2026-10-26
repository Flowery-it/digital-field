const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Post = sequelize.define('Post', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  title: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  // 论坛板块分类：种植技术 / 病虫害防治 / 市场行情 / 政策资讯 / 综合讨论
  category: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: '综合讨论'
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'user',
      key: 'id'
    }
  },
  createTime: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updateTime: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'post',
  timestamps: false
});

module.exports = Post;
