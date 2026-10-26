/**
 * 价格样例数据种子脚本（方案第 0 期：数据底座）
 * 用法: node seedPrice.js
 *
 * 依据《农产品价格与气象服务平台方案雏形》4.6 节规范生成：
 *   - 时间跨度 2025-04-01 至 2026-10-12（约 560 天）
 *   - 覆盖 30 品种 × 10 市场，允许部分组合缺失（验证空态）
 *   - 粮食双峰、蔬菜冬高夏低、水果上市期下探的季节性因子
 *   - 叠加随机游走，并计算日/周/年涨跌幅
 *   - 数据必须落库，不写死在前端
 */
const { Product, Market, PriceDaily, AgroRule, sequelize } = require('./models');

// ---------- 确定性伪随机，保证每次生成一致 ----------
let seedState = 20251013;
function rand() {
  seedState = (seedState * 1103515245 + 12345) & 0x7fffffff;
  return seedState / 0x7fffffff;
}
function gauss() {
  // Box-Muller，近似正态分布
  const u = Math.max(rand(), 1e-9);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ---------- 30 个品种（方案 2.1 节 + 扩充） ----------
// 季节性曲线按方案 4.6：粮食做双峰、蔬菜做冬高夏低、水果做上市期下探
// 说明：「粮食」档为粮油大类口径，含口粮与油料、杂粮；价格为演示参考价
const PRODUCTS = [
  { id: 'GRAIN_WHEAT',   name: '冬小麦',     cat: 'grain', base: 2.6,  spec: '中等',  stage: [{ n: '返青期', a: 3, b: 4 }, { n: '灌浆期', a: 5, b: 5 }, { n: '成熟期', a: 6, b: 6 }] },
  { id: 'GRAIN_CORN',    name: '玉米',       cat: 'grain', base: 2.3,  spec: '二等',  stage: [{ n: '拔节期', a: 6, b: 7 }, { n: '灌浆期', a: 8, b: 8 }, { n: '成熟期', a: 9, b: 9 }] },
  { id: 'GRAIN_SOY',     name: '大豆',       cat: 'grain', base: 4.8,  spec: '三等',  stage: [{ n: '开花期', a: 7, b: 7 }, { n: '结荚期', a: 8, b: 8 }, { n: '成熟期', a: 9, b: 9 }] },
  { id: 'GRAIN_RICE',    name: '水稻',       cat: 'grain', base: 2.8,  spec: '中等',  stage: [{ n: '拔节孕穗期', a: 7, b: 7 }, { n: '抽穗期', a: 8, b: 8 }] },
  { id: 'GRAIN_POTATO',  name: '马铃薯',     cat: 'grain', base: 1.8,  spec: '通货',  stage: [{ n: '块茎膨大期', a: 6, b: 7 }, { n: '成熟期', a: 8, b: 9 }] },
  { id: 'GRAIN_PEANUT',  name: '花生',       cat: 'grain', base: 7.8,  spec: '通货',  stage: [{ n: '苗期', a: 5, b: 6 }, { n: '下针期', a: 7, b: 8 }, { n: '结荚期', a: 8, b: 9 }, { n: '成熟期', a: 9, b: 10 }] },
  { id: 'GRAIN_SWEETPOTATO', name: '甘薯',   cat: 'grain', base: 2.2,  spec: '商品薯', stage: [{ n: '薯块膨大期', a: 7, b: 9 }, { n: '收获期', a: 10, b: 11 }] },
  { id: 'GRAIN_MUNGBEAN', name: '绿豆',      cat: 'grain', base: 6.5,  spec: '商品豆', stage: [{ n: '开花结荚期', a: 6, b: 8 }, { n: '成熟期', a: 8, b: 9 }] },
  { id: 'VEG_CABBAGE',   name: '大白菜',     cat: 'veg',   base: 1.2,  spec: '通货',  stage: [{ n: '莲座期', a: 10, b: 11 }, { n: '结球期', a: 11, b: 12 }] },
  { id: 'VEG_RADISH',    name: '白萝卜',     cat: 'veg',   base: 1.3,  spec: '通货',  stage: [{ n: '肉质根膨大期', a: 10, b: 11 }, { n: '成熟期', a: 11, b: 12 }] },
  { id: 'VEG_CUCUMBER',  name: '黄瓜',       cat: 'veg',   base: 4.5,  spec: '密刺',  stage: [{ n: '开花坐果期', a: 5, b: 6 }, { n: '采收期', a: 6, b: 9 }] },
  { id: 'VEG_TOMATO',    name: '西红柿',     cat: 'veg',   base: 4.0,  spec: '硬粉',  stage: [{ n: '开花坐果期', a: 5, b: 6 }, { n: '转色期', a: 6, b: 7 }] },
  { id: 'VEG_GARLIC',    name: '大蒜',       cat: 'veg',   base: 6.5,  spec: '通货',  stage: [{ n: '鳞芽分化期', a: 4, b: 4 }, { n: '蒜薹伸长期', a: 4, b: 5 }, { n: '成熟期', a: 5, b: 6 }] },
  { id: 'VEG_PEPPER',    name: '辣椒',       cat: 'veg',   base: 5.5,  spec: '螺丝椒', stage: [{ n: '开花坐果期', a: 5, b: 7 }, { n: '采收期', a: 6, b: 10 }] },
  { id: 'VEG_GINGER',    name: '生姜',       cat: 'veg',   base: 6.0,  spec: '老姜',  stage: [{ n: '苗期', a: 5, b: 6 }, { n: '块茎膨大期', a: 8, b: 9 }] },
  { id: 'VEG_CELERY',    name: '芹菜',       cat: 'veg',   base: 3.0,  spec: '西芹',  stage: [{ n: '莲座期', a: 9, b: 11 }, { n: '采收期', a: 11, b: 12 }] },
  { id: 'VEG_SPINACH',   name: '菠菜',       cat: 'veg',   base: 4.5,  spec: '大叶菠菜', stage: [{ n: '生长期', a: 10, b: 12 }, { n: '采收期', a: 3, b: 4 }] },
  { id: 'VEG_EGGPLANT',  name: '茄子',       cat: 'veg',   base: 4.0,  spec: '紫长茄', stage: [{ n: '开花坐果期', a: 5, b: 6 }, { n: '采收期', a: 6, b: 9 }] },
  { id: 'VEG_BEAN',      name: '豆角',       cat: 'veg',   base: 5.0,  spec: '架豆',  stage: [{ n: '开花结荚期', a: 6, b: 8 }, { n: '采收期', a: 7, b: 9 }] },
  { id: 'VEG_MUSHROOM',  name: '香菇',       cat: 'veg',   base: 12.0, spec: '鲜香菇', stage: [{ n: '出菇期', a: 9, b: 12 }, { n: '养菌期', a: 1, b: 3 }] },
  { id: 'FRUIT_PEAR',    name: '砀山酥梨',   cat: 'fruit', base: 3.2,  spec: '一级',  stage: [{ n: '幼果期', a: 5, b: 6 }, { n: '膨大期', a: 7, b: 8 }, { n: '成熟期', a: 9, b: 9 }] },
  { id: 'FRUIT_APPLE',   name: '富士苹果',   cat: 'fruit', base: 5.0,  spec: '一级',  stage: [{ n: '幼果期', a: 5, b: 6 }, { n: '膨大期', a: 7, b: 9 }, { n: '采收期', a: 10, b: 10 }] },
  { id: 'FRUIT_WATERMELON', name: '西瓜',    cat: 'fruit', base: 2.5,  spec: '8424',  stage: [{ n: '伸蔓期', a: 5, b: 5 }, { n: '膨瓜期', a: 6, b: 6 }, { n: '成熟期', a: 7, b: 7 }] },
  { id: 'FRUIT_GRAPE',   name: '葡萄',       cat: 'fruit', base: 7.0,  spec: '巨峰',  stage: [{ n: '花期', a: 5, b: 6 }, { n: '果实膨大期', a: 7, b: 8 }, { n: '成熟期', a: 8, b: 9 }] },
  { id: 'FRUIT_BANANA',  name: '香蕉',       cat: 'fruit', base: 4.2,  spec: '统货',  stage: [{ n: '抽蕾期', a: 6, b: 8 }, { n: '采收期', a: 9, b: 11 }] },
  { id: 'FRUIT_CITRUS',  name: '柑橘',       cat: 'fruit', base: 4.0,  spec: '沃柑',  stage: [{ n: '幼果期', a: 5, b: 6 }, { n: '膨大期', a: 7, b: 10 }, { n: '成熟期', a: 11, b: 2 }] },
  { id: 'FRUIT_KIWI',    name: '猕猴桃',     cat: 'fruit', base: 8.0,  spec: '徐香',  stage: [{ n: '幼果期', a: 5, b: 6 }, { n: '膨大期', a: 7, b: 9 }, { n: '成熟期', a: 9, b: 10 }] },
  { id: 'FRUIT_MANGO',   name: '芒果',       cat: 'fruit', base: 8.5,  spec: '台农一号', stage: [{ n: '果实膨大期', a: 4, b: 6 }, { n: '成熟期', a: 7, b: 8 }] },
  { id: 'FRUIT_STRAWBERRY', name: '草莓',    cat: 'fruit', base: 20.0, spec: '红颜',  stage: [{ n: '花期', a: 11, b: 2 }, { n: '采收期', a: 1, b: 4 }] },
  { id: 'FRUIT_WINTERJUJUBE', name: '冬枣',  cat: 'fruit', base: 8.0,  spec: '沾冬2号', stage: [{ n: '果实膨大期', a: 8, b: 9 }, { n: '成熟期', a: 9, b: 10 }] }
];

// ---------- 10 个参考市场（方案 2.2 节） ----------
const MARKETS = [
  { id: 'MKT_SHOUGUANG',  name: '山东寿光地利农产品物流园',       prov: '山东省', city: '潍坊市', lon: 118.736, lat: 36.856, type: '集散型', tier: 1, key: '寿光农产品物流园' },
  { id: 'MKT_XINFADI',    name: '北京新发地农副产品批发市场',     prov: '北京市', city: '北京市', lon: 116.337, lat: 39.812, type: '销地型', tier: 1, key: '北京新发地' },
  { id: 'MKT_WANBANG',    name: '河南郑州万邦国际农产品物流城',   prov: '河南省', city: '郑州市', lon: 113.685, lat: 34.797, type: '集散型', tier: 1, key: '郑州万邦' },
  { id: 'MKT_ZHOUGUIDUI', name: '安徽合肥周谷堆农产品批发市场',   prov: '安徽省', city: '合肥市', lon: 117.315, lat: 31.849, type: '销地型', tier: 1, key: '合肥周谷堆' },
  { id: 'MKT_LINGJIATANG',name: '江苏凌家塘农副产品批发市场',     prov: '江苏省', city: '常州市', lon: 119.935, lat: 31.748, type: '销地型', tier: 2, key: '常州凌家塘' },
  { id: 'MKT_JIANGNAN',   name: '广州江南果菜批发市场',           prov: '广东省', city: '广州市', lon: 113.335, lat: 23.126, type: '销地型', tier: 1, key: '广州江南市场' },
  { id: 'MKT_LONGQUAN',   name: '四川成都龙泉聚和国际果蔬交易中心', prov: '四川省', city: '成都市', lon: 104.351, lat: 30.564, type: '销地型', tier: 2, key: '成都龙泉聚和' },
  { id: 'MKT_XINYANGGUANG', name: '陕西咸阳新阳光农副产品批发市场', prov: '陕西省', city: '咸阳市', lon: 108.709, lat: 34.329, type: '产地型', tier: 2, key: '咸阳新阳光' },
  { id: 'MKT_JIUDING',    name: '新疆九鼎农产品批发市场',         prov: '新疆维吾尔自治区', city: '乌鲁木齐市', lon: 87.617, lat: 43.793, type: '产地型', tier: 2, key: '新疆九鼎' },
  { id: 'MKT_SJZGUOJI',   name: '河北石家庄国际农产品批发交易中心', prov: '河北省', city: '石家庄市', lon: 114.502, lat: 38.045, type: '产地型', tier: 2, key: '石家庄国际农产品' }
];

// ---------- 农事提醒规则（方案 3.4 节 + 调研报告建议的耐受阈值） ----------
const RULES = [
  // 冬小麦
  { p: 'GRAIN_WHEAT', s: '灌浆期', a: 5, b: 5, r: 'wind', t: { windScaleGte: 6 }, adv: '未来 48 小时有 6 级以上大风，冬小麦正值灌浆期，大风易导致倒伏与叶片机械损伤。建议检查田块排水，避免在风前灌水；已出现倾斜的麦田可及时培土扶稳。', sev: 2 },
  { p: 'GRAIN_WHEAT', s: '成熟期', a: 6, b: 6, r: 'rain', t: { precipGt: 25, days: 3 }, adv: '未来 3 天累计降水超过 25mm，冬小麦临近成熟，连阴雨会增加霉变与穗发芽风险。建议提前检修收割机械，抢晴收割，收获后及时晾晒或烘干。', sev: 3 },
  { p: 'GRAIN_WHEAT', s: '返青期', a: 3, b: 4, r: 'frost', t: { tempMinLt: 0 }, adv: '最低气温将降至 0℃ 以下，冬小麦处于返青期，抗寒能力下降。可在降温前 2—3 天追施速效氮并浇一次水，提高地温；已受冻田块待气温回升后补施恢复肥。', sev: 3 },
  // 玉米
  { p: 'GRAIN_CORN', s: '灌浆期', a: 8, b: 8, r: 'heat', t: { tempMaxGte: 35 }, adv: '持续 35℃ 以上高温，玉米处于灌浆期，高温逼熟会缩短灌浆时间、降低粒重。有条件地区可早晚喷水或叶面肥降温，同时注意防治玉米螟与蚜虫。', sev: 2 },
  { p: 'GRAIN_CORN', s: '成熟期', a: 9, b: 9, r: 'rain', t: { precipGt: 30, days: 3 }, adv: '未来 3 天降水偏多，玉米进入成熟期，田间积水易造成倒伏与霉变。建议提前开挖排水沟，具备条件的抢收离田。', sev: 3 },
  // 大豆
  { p: 'GRAIN_SOY', s: '开花期', a: 7, b: 7, r: 'rain', t: { precipGt: 20, days: 2 }, adv: '开花期遇连续降水，会影响授粉受精并加重病害发生。建议雨前疏通沟渠，雨后及时中耕散墒，并防治大豆霜霉病与蚜虫。', sev: 2 },
  // 水稻
  { p: 'GRAIN_RICE', s: '抽穗期', a: 8, b: 8, r: 'heat', t: { tempMaxGte: 35 }, adv: '抽穗期持续高温，水稻颖花不育率上升、空秕粒增加。建议保持 3—5 厘米水层降温，叶面喷施磷酸二氢钾提高抗逆性。', sev: 3 },
  // 黄瓜 / 西红柿（设施蔬菜）
  { p: 'VEG_CUCUMBER', s: '采收期', a: 6, b: 9, r: 'rain', t: { precipGt: 30, days: 2 }, adv: '连续阴雨高湿，黄瓜霜霉病、灰霉病发生风险显著上升。建议大棚及时通风降湿，雨后喷施保护性杀菌剂；露地黄瓜要提前清沟排水。', sev: 3 },
  { p: 'VEG_CUCUMBER', s: '开花坐果期', a: 5, b: 6, r: 'frost', t: { tempMinLt: 5 }, adv: '最低气温接近 5℃，黄瓜耐寒性差，低温会造成花打顶与化瓜。建议关闭棚室、加盖小拱棚或二膜，寒潮过后再逐步通风。', sev: 2 },
  { p: 'VEG_TOMATO', s: '转色期', a: 6, b: 7, r: 'rain', t: { precipGt: 25, days: 2 }, adv: '转色期遇雨，番茄裂果与晚疫病风险增加。建议提前铺设地膜减少溅水，雨后及时喷药防治晚疫病，并避开雨天采收。', sev: 2 },
  // 大蒜
  { p: 'VEG_GARLIC', s: '鳞芽分化期', a: 4, b: 4, r: 'rain', t: { precipGt: 20, days: 2 }, adv: '鳞芽分化期水分过多会引起蒜头腐烂与二次生长。建议控制灌水，雨前清理排水沟，保持土壤见干见湿。', sev: 2 },
  // 砀山酥梨
  { p: 'FRUIT_PEAR', s: '膨大期', a: 7, b: 8, r: 'wind', t: { windScaleGte: 6 }, adv: '6 级以上大风正值梨果膨大期，落果与枝叶擦伤风险高。建议提前巡查，对结果多的枝条疏果并吊枝固定；灾后及时喷药保护伤口。', sev: 3 },
  { p: 'FRUIT_PEAR', s: '成熟期', a: 9, b: 9, r: 'rain', t: { precipGt: 20, days: 3 }, adv: '成熟期连阴雨会显著降低酥梨可溶性固形物，并诱发褐斑病与裂果。建议抢晴采收，采后预冷贮存，避免带水装箱。', sev: 3 },
  { p: 'FRUIT_PEAR', s: '开花期', a: 4, b: 4, r: 'frost', t: { tempMinLt: 2 }, adv: '花期遇 2℃ 以下低温，梨树花器易受冻害，直接影响坐果率。可在降温前果园灌水或熏烟增温，冻后喷施硼肥与尿素混合液保花保果。', sev: 3 },
  // 富士苹果
  { p: 'FRUIT_APPLE', s: '膨大期', a: 7, b: 9, r: 'heat', t: { tempMaxGte: 35 }, adv: '持续高温干旱影响苹果膨大，且易发日灼。建议少量多次灌溉或滴灌，避开中午高温时段浇水；有条件果园可覆盖秸秆保墒降温。', sev: 2 },
  { p: 'FRUIT_APPLE', s: '采收期', a: 10, b: 10, r: 'rain', t: { precipGt: 15, days: 2 }, adv: '采收期降雨会增加苹果裂果与贮藏期病害风险，也会影响采收作业。建议关注降水窗口抢晴采摘，采后及时入库预冷。', sev: 2 },
  // 西瓜
  { p: 'FRUIT_WATERMELON', s: '膨瓜期', a: 6, b: 6, r: 'rain', t: { precipGt: 40, days: 2 }, adv: '膨瓜期遇暴雨，瓜田积水易导致裂瓜与疫病蔓延。建议提前做好排水，雨后立即喷药防治疫病；已裂瓜及时清除减少病菌来源。', sev: 3 },
  // 葡萄
  { p: 'FRUIT_GRAPE', s: '成熟期', a: 8, b: 9, r: 'rain', t: { precipGt: 15, days: 2 }, adv: '成熟期降雨是葡萄裂果、酸腐病与炭疽病的主要诱因。建议尽快抢收，未收果园雨后喷施一次保护性杀菌剂，并保持架面通风透光。', sev: 3 },
  // 花生 / 甘薯 / 绿豆
  { p: 'GRAIN_PEANUT', s: '结荚期', a: 8, b: 9, r: 'rain', t: { precipGt: 20, days: 2 }, adv: '花生结荚期连阴雨易造成荚果腐烂与发芽，直接影响产量与商品率。建议提前清沟排水，成熟后抢晴收获并及时晾晒或烘干。', sev: 3 },
  { p: 'GRAIN_PEANUT', s: '下针期', a: 7, b: 8, r: 'heat', t: { tempMaxGte: 35 }, adv: '持续 35℃ 以上高温影响果针下扎与结荚。建议小水勤浇保持土壤湿润，有条件的覆盖秸秆降温保墒，并注意防治叶斑病。', sev: 2 },
  { p: 'GRAIN_SWEETPOTATO', s: '薯块膨大期', a: 7, b: 9, r: 'rain', t: { precipGt: 30, days: 3 }, adv: '甘薯薯块膨大期田间积水易引起裂薯、软腐与「水浸薯」。建议高垄栽培，雨前疏通沟渠，雨后及时提蔓通风散墒。', sev: 3 },
  { p: 'GRAIN_MUNGBEAN', s: '开花结荚期', a: 6, b: 8, r: 'rain', t: { precipGt: 20, days: 2 }, adv: '绿豆开花结荚期连阴雨会造成大量落花落荚并诱发叶斑病。建议及时中耕散墒，雨后喷药保护，提高结荚率。', sev: 2 },
  // 辣椒 / 生姜 / 芹菜 / 菠菜 / 茄子 / 豆角 / 香菇
  { p: 'VEG_PEPPER', s: '开花坐果期', a: 5, b: 7, r: 'heat', t: { tempMaxGte: 35 }, adv: '持续高温干燥，辣椒落花落果加剧、病毒病风险上升。建议小水勤灌、覆盖遮阳网降温，并注意防治蚜虫与烟青虫。', sev: 2 },
  { p: 'VEG_GINGER', s: '块茎膨大期', a: 8, b: 9, r: 'rain', t: { precipGt: 40, days: 3 }, adv: '生姜块茎膨大期怕涝，积水是姜瘟病（细菌性枯萎病）的主要诱因。建议高垄栽培、及时排水，发现病株立即拔除并穴施生石灰消毒。', sev: 3 },
  { p: 'VEG_CELERY', s: '莲座期', a: 9, b: 11, r: 'rain', t: { precipGt: 25, days: 2 }, adv: '连阴雨后高湿易诱发芹菜斑枯病与叶斑病。建议及时通风降湿，喷施代森锰锌等保护性杀菌剂，并清除病叶减少菌源。', sev: 2 },
  { p: 'VEG_SPINACH', s: '采收期', a: 3, b: 4, r: 'rain', t: { precipGt: 15, days: 2 }, adv: '菠菜采收期降雨会造成软腐与烂叶，商品性明显下降。建议抢晴采收，雨后待叶面水干后再割收，采后预冷降温。', sev: 2 },
  { p: 'VEG_EGGPLANT', s: '采收期', a: 6, b: 9, r: 'heat', t: { tempMaxGte: 35 }, adv: '持续高温下茄子日灼果增多、授粉不良导致畸形果。建议小水勤浇、叶面补钙减轻日灼，并注意防治茶黄螨与蓟马。', sev: 2 },
  { p: 'VEG_BEAN', s: '开花结荚期', a: 6, b: 8, r: 'rain', t: { precipGt: 20, days: 2 }, adv: '菜豆开花结荚期遇雨，落花落荚与锈病风险高。建议及时清沟排水、喷药保护，并避开雨天与雨后中午采摘以防伤口感染。', sev: 2 },
  { p: 'VEG_MUSHROOM', s: '出菇期', a: 9, b: 12, r: 'heat', t: { tempMaxGte: 30 }, adv: '香菇出菇期棚温超过 30℃ 易开伞、品质下降并诱发病害。建议加强通风、覆盖遮阳网，错峰在早晚喷水保湿。', sev: 2 },
  // 柑橘 / 猕猴桃 / 芒果 / 草莓 / 冬枣
  { p: 'FRUIT_CITRUS', s: '成熟期', a: 11, b: 2, r: 'rain', t: { precipGt: 15, days: 2 }, adv: '晚熟柑橘成熟期连阴雨易裂果并诱发褐斑病、炭疽病。建议保持土壤水分均衡、叶面补钙，雨后及时喷药保护，分批抢晴采摘。', sev: 2 },
  { p: 'FRUIT_KIWI', s: '膨大期', a: 7, b: 9, r: 'wind', t: { windScaleGte: 6 }, adv: '6 级以上大风正值猕猴桃果实膨大期，落果与叶片擦伤风险高。建议提前疏果定果，对结果枝绑蔓固定，灾后及时喷药护果。', sev: 3 },
  { p: 'FRUIT_MANGO', s: '成熟期', a: 7, b: 8, r: 'rain', t: { precipGt: 10, days: 2 }, adv: '芒果成熟期降雨易诱发炭疽病与裂果，雨后暴晒还会加重日灼。建议抢晴分批采收，采后及时分级预冷，减少贮运损耗。', sev: 3 },
  { p: 'FRUIT_STRAWBERRY', s: '花期', a: 11, b: 2, r: 'frost', t: { tempMinLt: 2 }, adv: '花期遇 2℃ 以下低温，草莓花器易受冻、畸形果增多。建议大棚加盖二膜或小拱棚保温，寒潮前关闭风口并熏烟增温。', sev: 3 },
  { p: 'FRUIT_WINTERJUJUBE', s: '成熟期', a: 9, b: 10, r: 'rain', t: { precipGt: 15, days: 2 }, adv: '冬枣成熟期降雨是裂果与浆烂的主要诱因，直接影响商品果率。建议雨前叶面补钙、保持土壤水分稳定，及时抢收并入库预冷。', sev: 3 }
];

const round2 = n => Math.round(n * 100) / 100;

// 季节性因子：按方案 4.6 三类曲线
function seasonalFactor(cat, month) {
  // month 1-12
  if (cat === 'grain') {
    // 双峰：3-4 月（青黄不接）与 10-11 月（新粮未大量上市）
    return 1 + 0.10 * Math.cos((month - 3.5) * Math.PI / 3)
             + 0.07 * Math.cos((month - 10.5) * Math.PI / 2.5);
  }
  if (cat === 'veg') {
    // 冬高夏低
    return 1 + 0.28 * Math.cos((month - 1) * Math.PI / 6);
  }
  // 水果：夏季集中上市期下探
  return 1 - 0.16 * Math.exp(-Math.pow(month - 7.5, 2) / 6)
           + 0.05 * Math.cos((month - 11) * Math.PI / 4);
}

// 市场价差系数：产地型偏低，销地型偏高
function marketFactor(type, prov) {
  if (type === '产地型') return 0.88;
  if (type === '集散型') return 1.0;
  // 销地型按区域略有差异
  if (prov === '广东省') return 1.18;
  if (prov === '北京市') return 1.12;
  if (prov === '新疆维吾尔自治区') return 1.15;
  return 1.06;
}

async function seedDimensions() {
  await Product.destroy({ where: {} });
  await Market.destroy({ where: {} });
  await AgroRule.destroy({ where: {} });

  await Product.bulkCreate(PRODUCTS.map(p => ({
    productId: p.id,
    name: p.name,
    category: p.cat,
    alias: p.name,
    baseUnit: 'kg',
    spec: p.spec,
    growthStages: p.stage,
    isActive: true
  })));
  console.log(`dim_product     写入 ${PRODUCTS.length} 条`);

  await Market.bulkCreate(MARKETS.map(m => ({
    marketId: m.id,
    name: m.name,
    province: m.prov,
    city: m.city,
    lon: m.lon,
    lat: m.lat,
    marketType: m.type,
    tier: m.tier,
    sourceKey: m.key
  })));
  console.log(`dim_market      写入 ${MARKETS.length} 条`);

  await AgroRule.bulkCreate(RULES.map(r => ({
    productId: r.p,
    growthStage: r.s,
    windowStart: r.a,
    windowEnd: r.b,
    riskType: r.r,
    thresholdJson: r.t,
    adviceText: r.adv,
    severity: r.sev
  })));
  console.log(`dim_agro_rule   写入 ${RULES.length} 条`);
}

async function seedPrices() {
  await PriceDaily.destroy({ where: {} });

  // 方案 4.6：2025-04-01 至 2026-10-12
  const start = new Date(Date.UTC(2025, 3, 1));
  const end = new Date(Date.UTC(2026, 9, 12));
  const days = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(new Date(d));
  }
  console.log(`时间跨度：${days.length} 天（${days[0].toISOString().slice(0, 10)} ~ ${days[days.length - 1].toISOString().slice(0, 10)}）`);

  const BATCH = 1000;
  let batch = [];
  let total = 0;
  let skipped = 0;

  for (const p of PRODUCTS) {
    for (const m of MARKETS) {
      // 允许部分组合缺失：水果在非华南/集散市场偶发缺录
      const isGap = p.cat === 'fruit' && m.type === '产地型' && rand() < 0.35;
      if (isGap) { skipped++; continue; }

      const mf = marketFactor(m.type, m.prov);
      const series = [];   // 本组合已生成的价格序列，用于回溯计算涨跌幅
      let price = p.base * mf * (0.95 + rand() * 0.1);

      for (let i = 0; i < days.length; i++) {
        const day = days[i];
        const month = day.getUTCMonth() + 1;
        const sf = seasonalFactor(p.cat, month);

        // 均值回归随机游走：向季节性目标价靠拢，叠加正态噪声
        const target = p.base * mf * sf;
        price = price + (target - price) * 0.05 + gauss() * target * 0.012;
        const avg = Math.max(target * 0.7, price);
        const spread = avg * (0.05 + rand() * 0.09);

        // 涨跌幅：相对序列历史值计算
        const dod = i > 0 ? ((avg - series[i - 1]) / series[i - 1]) * 100 : null;
        const wow = i >= 7 ? ((avg - series[i - 7]) / series[i - 7]) * 100 : null;
        const yoy = i >= 365 ? ((avg - series[i - 365]) / series[i - 365]) * 100 : null;
        series.push(avg);

        batch.push({
          productId: p.id,
          marketId: m.id,
          priceDate: day.toISOString().slice(0, 10),
          priceLow: round2(avg - spread),
          priceHigh: round2(avg + spread),
          priceAvg: round2(avg),
          unit: 'kg',
          currency: 'CNY',
          changePctDod: dod === null ? null : round2(dod),
          changePctWow: wow === null ? null : round2(wow),
          changePctYoy: yoy === null ? null : round2(yoy),
          source: 'pfsc.agri.cn',
          sourceUrl: 'https://pfsc.agri.cn',
          collectedAt: new Date(day.getTime() + 36e5 * 12),
          qualityFlag: rand() < 0.01 ? 1 : 0
        });

        if (batch.length >= BATCH) {
          await PriceDaily.bulkCreate(batch);
          total += batch.length;
          batch = [];
        }
      }
    }
  }
  if (batch.length) {
    await PriceDaily.bulkCreate(batch);
    total += batch.length;
  }
  console.log(`fact_price_daily 写入 ${total} 条（跳过的空组合 ${skipped} 个）`);
}

(async () => {
  try {
    await sequelize.authenticate();
    console.log('数据库连接成功:', sequelize.getDialect());
    await sequelize.sync();
    await seedDimensions();
    await seedPrices();
    console.log('\n价格样例数据灌入完成');
    process.exit(0);
  } catch (err) {
    console.error('价格种子执行失败:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
