const { Sequelize } = require('sequelize');
require('dotenv').config();

// 数据库方言：通过 DB_DIALECT 切换，默认 sqlite（本地演示无需安装 MySQL）
// 生产/容器环境设为 mysql 即可，MySQL 连接参数保持不变
const dialect = process.env.DB_DIALECT || 'sqlite';

let sequelize;

if (dialect === 'sqlite') {
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: process.env.DB_STORAGE || './crop_data.db',
    logging: false
  });
} else {
  sequelize = new Sequelize({
    dialect: 'mysql',
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'crop_data',
    logging: false
  });
}

module.exports = sequelize;
