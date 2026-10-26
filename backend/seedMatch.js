/**
 * 产销对接演示数据种子
 * ====================
 *
 * 目的：答辩/演示现场打开「产销对接」就有内容可看，不用临时手工发布。
 *
 * **数据性质：全部是演示数据**（userId 挂在演示账号下，联系方式为占位符），
 * 不是真实交易。种子按 (userId+role+product+region) 幂等，重复执行不产生重复行。
 *
 * 用法：node seedMatch.js
 */

require('dotenv').config();
const { MatchIntent, User } = require('./models');

const DEMO_INTENTS = [
  // 经销商收购意向（演示账号 admin 作为收购方）
  { username: 'admin', role: 'buyer', product: '冬小麦', quantity: 500, priceExpect: 2.95, region: '石家庄', availableDate: null, contact: '138****0001', remark: '面粉厂常年收购，到库付款' },
  { username: 'admin', role: 'buyer', product: '玉米', quantity: 800, priceExpect: 2.55, region: '石家庄', availableDate: null, contact: '138****0001', remark: '饲料厂批量采购，需过风过筛' },
  { username: 'admin', role: 'buyer', product: '水稻', quantity: 300, priceExpect: 3.1, region: '哈尔滨', availableDate: null, contact: '138****0002', remark: '米业公司收购优质粳稻' },
  { username: 'admin', role: 'buyer', product: '苹果', quantity: 120, priceExpect: 4.2, region: '北京', availableDate: null, contact: '138****0003', remark: '商超直采，需套袋果' },
  { username: 'admin', role: 'buyer', product: '花生', quantity: 200, priceExpect: 8.6, region: '郑州', availableDate: null, contact: '138****0004', remark: '榨油厂收购，含油率优先' },
  // 种植户供货意向（演示账号 demo 作为供货方）
  { username: 'demo', role: 'grower', product: '冬小麦', quantity: 50, priceExpect: 3.0, region: '石家庄', availableDate: '2027-06-15', contact: '139****1001', remark: '50 亩麦田，六月上旬可收割' },
  { username: 'demo', role: 'grower', product: '玉米', quantity: 30, priceExpect: 2.6, region: '石家庄', availableDate: '2026-10-20', contact: '139****1001', remark: '30 亩春玉米，水分 14% 左右' },
  { username: 'demo', role: 'grower', product: '水稻', quantity: 80, priceExpect: 3.2, region: '哈尔滨', availableDate: '2026-10-25', contact: '139****1002', remark: '五常产区稻花香，可看田订' }
];

(async () => {
  try {
    const users = await User.findAll({ raw: true });
    const userOf = {};
    users.forEach(u => { userOf[u.username] = u.id; });

    let created = 0;
    let skipped = 0;
    for (const it of DEMO_INTENTS) {
      const userId = userOf[it.username];
      if (!userId) {
        console.warn(`跳过：用户 ${it.username} 不存在（请先启动一次后端以兜底创建演示账号）`);
        skipped++;
        continue;
      }
      const exists = await MatchIntent.findOne({
        where: { userId, role: it.role, product: it.product, region: it.region }
      });
      if (exists) {
        skipped++;
        continue;
      }
      // username 只是查找用的键，落库时换成 userId，其余字段照写
      const { username, ...rest } = it;
      await MatchIntent.create({ userId, ...rest });
      created++;
    }
    console.log(`[seedMatch] 完成：新增 ${created} 条，跳过 ${skipped} 条（演示数据，非真实交易）`);
    process.exit(0);
  } catch (err) {
    console.error('[seedMatch] 失败:', err.message);
    process.exit(1);
  }
})();
