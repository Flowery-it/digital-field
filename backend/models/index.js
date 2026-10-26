const sequelize = require('../config/database');
const User = require('./User');
const CropData = require('./CropData');
const CropRecommend = require('./CropRecommend');
const Post = require('./Post');
const Product = require('./Product');
const Market = require('./Market');
const PriceDaily = require('./PriceDaily');
const AgroRule = require('./AgroRule');
const UserCrop = require('./UserCrop');
const AdvisoryPush = require('./AdvisoryPush');
const BenefitLedger = require('./BenefitLedger');
const DashboardSnapshot = require('./DashboardSnapshot');
const AiGeneration = require('./AiGeneration');
const MatchIntent = require('./MatchIntent');

// 关联关系
User.hasMany(Post, { foreignKey: 'userId' });
Post.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(UserCrop, { foreignKey: 'userId' });
UserCrop.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(AdvisoryPush, { foreignKey: 'userId' });
AdvisoryPush.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(BenefitLedger, { foreignKey: 'userId' });
BenefitLedger.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(DashboardSnapshot, { foreignKey: 'userId' });
DashboardSnapshot.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(AiGeneration, { foreignKey: 'userId' });
AiGeneration.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(MatchIntent, { foreignKey: 'userId' });
MatchIntent.belongsTo(User, { foreignKey: 'userId' });

module.exports = {
  sequelize,
  User,
  CropData,
  CropRecommend,
  Post,
  Product,
  Market,
  PriceDaily,
  AgroRule,
  UserCrop,
  AdvisoryPush,
  BenefitLedger,
  DashboardSnapshot,
  AiGeneration,
  MatchIntent
};
