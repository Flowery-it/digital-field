/**
 * 演示数据种子脚本
 * 用法: node seed.js
 * 说明: 向 crop_data / crop_recommend / post 三张表灌入演示数据。
 *
 * 产量数据说明（重要，三层口径）：
 *   第一层  粮食（合计）：国家统计局分省真实数据（2020—2024，31 省，免费公开）。
 *   第二层  品种结构：
 *           - 基本粮食作物（稻谷/小麦/玉米/大豆/其他粮食）：以产区带种植结构为先验，
 *             用 IPF（迭代比例拟合）按统计局分品种全国总量校准，全国合计与官方口径零偏差；
 *           - 经济作物（棉花/花生/油菜籽/甘蔗/茶叶）：全国总量为历年统计公报真实数据，
 *             省级按「产区带先验 × 省内粮食占比 × 专业化倾斜」分摊，
 *             高集中度作物（棉花-新疆、甘蔗-广西）的主产省份额按公开产区格局锚定；
 *           - 蔬菜与水果（水果/苹果/柑橘）：全国总量为历年统计公报真实数据，
 *             分摊模型同经济作物（苹果-陕鲁、柑橘-桂湘赣鄂为优势产省加权）。
 *   第三层  市级拆分：省内确定性权重分摊，所有城市合计 = 省份总量。
 *   价格字段为演示数据（参考价 × 年际涨幅 × 抖动），仅用于跑通页面交互。
 *
 *   注意：省级/市级拆分均为模型分摊，不代表真实单产；甜菜/烤烟仅有适宜度推荐，不灌产量。
 *   幂等：重复执行会先重建表再写入。
 */
const fs = require('fs');
const path = require('path');
const { Sequelize } = require('sequelize');
const sequelize = require('./config/database');
const CropData = require('./models/CropData');
const CropRecommend = require('./models/CropRecommend');
const Post = require('./models/Post');
const User = require('./models/User');
const {
  GRAIN_CROPS,
  CASH_CROPS,
  VEG_CROPS,
  FRUIT_CROPS,
  GRAIN_RECOMMEND_CROPS,
  CASH_RECOMMEND_CROPS
} = require('./config/crops');
const {
  CITY_SPECIALTY,
  PROVINCE_SPECIALTY,
  GRAIN_VARIETY,
  CASH_KNOWLEDGE,
  PROVINCE_VARIETY
} = require('./config/agriKnowledge');

const YEARS = [2020, 2021, 2022, 2023, 2024];

// ============================================================
// 一、国家统计局分省粮食产量（万吨）——真实数据
// 来源：国家统计局历年粮食产量公告
//   https://www.stats.gov.cn/sj/zxfb/202412/t20241213_1957744.html （2024）
//   https://www.stats.gov.cn/sj/zxfb/202312/t20231211_1945417.html （2023）
//   https://www.stats.gov.cn/sj/zxfb/202302/t20230203_1901673.html （2022）
//   https://www.stats.gov.cn/xxgk/sjfb/zxfb2020/202112/t20211206_1825071.html （2021）
//   https://www.stats.gov.cn/xxgk/sjfb/zxfb2020/202012/t20201211_1808748.html （2020）
// ============================================================
const NBS_GRAIN = {
  2020: { 北京: 31, 天津: 228, 河北: 3796, 山西: 1424, 内蒙古: 3664, 辽宁: 2339, 吉林: 3803, 黑龙江: 7541, 上海: 91, 江苏: 3729, 浙江: 606, 安徽: 4019, 福建: 502, 江西: 2164, 山东: 5447, 河南: 6826, 湖北: 2727, 湖南: 3015, 广东: 1268, 广西: 1370, 海南: 145, 重庆: 1081, 四川: 3527, 贵州: 1058, 云南: 1896, 西藏: 103, 陕西: 1275, 甘肃: 1202, 青海: 107, 宁夏: 380, 新疆: 1583 },
  2021: { 北京: 37.8, 天津: 249.9, 河北: 3825.1, 山西: 1421.2, 内蒙古: 3840.3, 辽宁: 2538.7, 吉林: 4039.2, 黑龙江: 7867.7, 上海: 94.0, 江苏: 3746.1, 浙江: 620.9, 安徽: 4087.6, 福建: 506.4, 江西: 2192.3, 山东: 5500.7, 河南: 6544.2, 湖北: 2764.3, 湖南: 3074.4, 广东: 1279.9, 广西: 1386.5, 海南: 146.0, 重庆: 1092.8, 四川: 3582.1, 贵州: 1094.9, 云南: 1930.3, 西藏: 106.5, 陕西: 1270.4, 甘肃: 1231.5, 青海: 109.1, 宁夏: 368.4, 新疆: 1735.8 },
  2022: { 北京: 45.4, 天津: 256.2, 河北: 3865.1, 山西: 1464.3, 内蒙古: 3900.6, 辽宁: 2484.5, 吉林: 4080.8, 黑龙江: 7763.1, 上海: 95.6, 江苏: 3769.1, 浙江: 621.0, 安徽: 4100.1, 福建: 508.7, 江西: 2151.9, 山东: 5543.8, 河南: 6789.4, 湖北: 2741.1, 湖南: 3018.0, 广东: 1291.5, 广西: 1393.1, 海南: 146.6, 重庆: 1072.8, 四川: 3510.5, 贵州: 1114.6, 云南: 1958.0, 西藏: 107.3, 陕西: 1297.9, 甘肃: 1265.0, 青海: 107.3, 宁夏: 375.8, 新疆: 1813.5 },
  2023: { 北京: 47.8, 天津: 255.7, 河北: 3809.9, 山西: 1478.1, 内蒙古: 3957.8, 辽宁: 2563.4, 吉林: 4186.5, 黑龙江: 7788.2, 上海: 101.9, 江苏: 3797.7, 浙江: 638.8, 安徽: 4150.8, 福建: 511.0, 江西: 2198.3, 山东: 5655.3, 河南: 6624.3, 湖北: 2777.0, 湖南: 3068.0, 广东: 1285.2, 广西: 1395.4, 海南: 147.0, 重庆: 1095.9, 四川: 3593.8, 贵州: 1119.7, 云南: 1974.0, 西藏: 108.9, 陕西: 1323.7, 甘肃: 1272.9, 青海: 116.2, 宁夏: 378.8, 新疆: 2119.2 },
  2024: { 北京: 57.6, 天津: 270.6, 河北: 3908.8, 山西: 1468.7, 内蒙古: 4100.5, 辽宁: 2500.3, 吉林: 4266.0, 黑龙江: 8001.7, 上海: 98.3, 江苏: 3810.1, 浙江: 650.2, 安徽: 4184.3, 福建: 514.4, 江西: 2196.0, 山东: 5710.2, 河南: 6719.4, 湖北: 2785.3, 湖南: 3078.1, 广东: 1313.4, 广西: 1403.8, 海南: 142.4, 重庆: 1100.7, 四川: 3633.8, 贵州: 1146.1, 云南: 1993.5, 西藏: 112.9, 陕西: 1352.3, 甘肃: 1296.1, 青海: 118.3, 宁夏: 385.9, 新疆: 2330.2 }
};

// 统计局全国口径分品种产量（万吨），用于校准品种结构模型
// 稻谷取自历年粮食产量公告；2021/2022 官方公告未列分品种明细，按 2020-2023 线性插值
const NBS_CROP_NATIONAL = {
  2020: { 稻谷: 21186.0, 小麦: 13425, 玉米: 26067, 大豆: 2288 },
  2023: { 稻谷: 20660.3, 小麦: 13659.0, 玉米: 28884.2, 大豆: 2384.1 },
  2024: { 稻谷: 20753.5, 小麦: 14009.9, 玉米: 29491.7, 大豆: 2362.8 }
};
YEARS.forEach(y => {
  if (!NBS_CROP_NATIONAL[y]) {
    const t = (y - 2020) / 3;
    NBS_CROP_NATIONAL[y] = {};
    ['稻谷', '小麦', '玉米', '大豆'].forEach(c => {
      NBS_CROP_NATIONAL[y][c] = NBS_CROP_NATIONAL[2020][c] + (NBS_CROP_NATIONAL[2023][c] - NBS_CROP_NATIONAL[2020][c]) * t;
    });
  }
});

// ============================================================
// 一之二、经济作物全国产量（万吨）——国家统计局真实数据（免费公开）
// 来源：历年《国民经济和社会发展统计公报》
//   2020: https://www.stats.gov.cn/sj/zxfb/202302/t20230203_1901004.html
//   2021: https://www.stats.gov.cn/xxgk/sjfb/tjgb2020/202202/t20220228_1827971.html
//   2023: https://www.stats.gov.cn/sj/zxfb/202402/t20240228_1947915.html
//   2024: https://www.stats.gov.cn/xxgk/sjfb/zxfb2020/202502/t20250228_1958817.html
//   花生/油菜籽/甘蔗 2021—2024 另见统计局《"十四五"经济社会发展成就系列报告之三》
//   https://www.stats.gov.cn/sj/zxfbhjd/202606/t20260602_1963862.html
// 说明：
//   - 2022 年单项公报未列明细，按 2023 年公报同比增速回推；
//   - 花生 2020 按 2021—2022 线性回补；甘蔗 2020 按糖料总量扣除甜菜后回推；
//   - 油菜籽 2020 取历年公报口径 1405，2022—2024 为公报/成就报告值。
// ============================================================
const NBS_CASH_NATIONAL = {
  棉花: { 2020: 591, 2021: 573, 2022: 598.5, 2023: 562, 2024: 616 },
  花生: { 2020: 1829, 2021: 1831, 2022: 1833, 2023: 1923, 2024: 1961 },
  油菜籽: { 2020: 1405, 2021: 1471, 2022: 1553.1, 2023: 1631.7, 2024: 1650 },
  甘蔗: { 2020: 10812, 2021: 10666, 2022: 10338, 2023: 10457, 2024: 10209 },
  茶叶: { 2020: 297, 2021: 318, 2022: 335, 2023: 355, 2024: 374 }
};

// ============================================================
// 一之三、蔬菜与水果全国产量（万吨）——国家统计局真实数据（免费公开）
// 来源：历年《国民经济和社会发展统计公报》及权威媒体援引统计局数据
//   - 水果 2020 28692 / 2024 33966（公报口径，"十四五"成就系列报告之三）
//   - 苹果 2020 4406.6 / 2024 5128.51（统计局口径，媒体与行业报告广泛引用）
//   - 柑橘 2020 5121.9 / 2024 6791.49（同上）
//   - 蔬菜 2020 74912.9 / 2024 约 86000（2024 年统计公报，人民日报援引）
//   说明：中间年份（2021—2023）公报未列单品明细，按首末年线性插值，仅用于趋势演示。
// ============================================================
function interpolateAnchor(anchor, years) {
  // anchor: { 2020: v, 2024: v }，补齐中间年份
  const keys = Object.keys(anchor).map(Number).sort((a, b) => a - b);
  const out = {};
  years.forEach(y => {
    if (anchor[y] != null) { out[y] = anchor[y]; return; }
    const lo = keys.filter(k => k < y).pop();
    const hi = keys.find(k => k > y);
    if (lo == null || hi == null) { out[y] = anchor[keys[0]]; return; }
    out[y] = anchor[lo] + (anchor[hi] - anchor[lo]) * (y - lo) / (hi - lo);
  });
  return out;
}

const NBS_FRUIT_NATIONAL = {
  水果: interpolateAnchor({ 2020: 28692, 2024: 33966 }, YEARS),
  苹果: interpolateAnchor({ 2020: 4406.6, 2024: 5128.51 }, YEARS),
  柑橘: interpolateAnchor({ 2020: 5121.9, 2024: 6791.49 }, YEARS)
};
const NBS_VEG_NATIONAL = {
  蔬菜: interpolateAnchor({ 2020: 74912.9, 2024: 86000 }, YEARS)
};

// 统计局简称 -> 城市清单 CSV 中的省级全称
const PROVINCE_ALIAS = {
  北京: '北京市', 天津: '天津市', 河北: '河北省', 山西: '山西省', 内蒙古: '内蒙古自治区',
  辽宁: '辽宁省', 吉林: '吉林省', 黑龙江: '黑龙江省', 上海: '上海市', 江苏: '江苏省',
  浙江: '浙江省', 安徽: '安徽省', 福建: '福建省', 江西: '江西省', 山东: '山东省',
  河南: '河南省', 湖北: '湖北省', 湖南: '湖南省', 广东: '广东省', 广西: '广西壮族自治区',
  海南: '海南省', 重庆: '重庆市', 四川: '四川省', 贵州: '贵州省', 云南: '云南省',
  西藏: '西藏自治区', 陕西: '陕西省', 甘肃: '甘肃省', 青海: '青海省', 宁夏: '宁夏回族自治区',
  新疆: '新疆维吾尔自治区'
};

// 省份 -> 产区带
const PROVINCE_ZONE = {
  黑龙江: '东北平原', 吉林: '东北平原', 辽宁: '东北平原', 内蒙古: '东北平原',
  河北: '华北平原', 河南: '华北平原', 山东: '华北平原', 北京: '华北平原', 天津: '华北平原', 山西: '华北平原',
  新疆: '西北地区', 甘肃: '西北地区', 宁夏: '西北地区', 青海: '西北地区', 陕西: '西北地区',
  江苏: '长江中下游', 安徽: '长江中下游', 湖北: '长江中下游', 湖南: '长江中下游', 江西: '长江中下游', 浙江: '长江中下游', 上海: '长江中下游',
  广东: '华南地区', 广西: '华南地区', 海南: '华南地区', 福建: '华南地区',
  四川: '西南地区', 重庆: '西南地区', 贵州: '西南地区', 云南: '西南地区', 西藏: '西南地区'
};

// 产区带 -> 品种结构先验（稻谷/小麦/玉米/大豆/其他粮食），合计为 1
// “其他粮食”包含薯类、谷子高粱等杂粮
const ZONE_STRUCTURE_PRIOR = {
  东北平原:    { 稻谷: 0.12, 小麦: 0.03, 玉米: 0.42, 大豆: 0.075, 其他粮食: 0.355 },
  华北平原:    { 稻谷: 0.025, 小麦: 0.40, 玉米: 0.42, 大豆: 0.01, 其他粮食: 0.145 },
  西北地区:    { 稻谷: 0.04, 小麦: 0.40, 玉米: 0.36, 大豆: 0.02, 其他粮食: 0.18 },
  长江中下游:  { 稻谷: 0.58, 小麦: 0.10, 玉米: 0.08, 大豆: 0.03, 其他粮食: 0.21 },
  华南地区:    { 稻谷: 0.62, 小麦: 0.01, 玉米: 0.07, 大豆: 0.015, 其他粮食: 0.285 },
  西南地区:    { 稻谷: 0.45, 小麦: 0.04, 玉米: 0.20, 大豆: 0.02, 其他粮食: 0.29 }
};

const ZONE_DESC = {
  东北平原: '黑土粮仓，一年一熟，玉米大豆水稻主产区',
  华北平原: '黄淮海平原，小麦玉米轮作，全国最大的粮食产区之一',
  西北地区: '灌溉农业与旱作农业并存，绿洲农业特色明显',
  长江中下游: '稻麦两熟区，水热条件充沛，单产水平高',
  华南地区: '水热资源丰富，水稻为主、一年多熟',
  西南地区: '立体气候明显，水稻马铃薯种植比例高'
};

// 经济作物产区带先验：该作物全国产量在各产区带的分配比例，合计为 1
// （苹果/柑橘/蔬菜/油菜籽同模型，一并列出；先验为公开产区格局的经验估计）
const CASH_ZONE_SHARE = {
  棉花: { 东北平原: 0.005, 华北平原: 0.045, 西北地区: 0.90, 长江中下游: 0.045, 华南地区: 0.003, 西南地区: 0.002 },
  花生: { 东北平原: 0.12, 华北平原: 0.50, 西北地区: 0.03, 长江中下游: 0.10, 华南地区: 0.20, 西南地区: 0.05 },
  油菜籽: { 东北平原: 0.07, 华北平原: 0.06, 西北地区: 0.08, 长江中下游: 0.50, 华南地区: 0.01, 西南地区: 0.28 },
  甘蔗: { 东北平原: 0, 华北平原: 0.003, 西北地区: 0, 长江中下游: 0.007, 华南地区: 0.74, 西南地区: 0.25 },
  茶叶: { 东北平原: 0.005, 华北平原: 0.02, 西北地区: 0.03, 长江中下游: 0.34, 华南地区: 0.30, 西南地区: 0.305 },
  苹果: { 东北平原: 0.10, 华北平原: 0.30, 西北地区: 0.42, 长江中下游: 0.05, 华南地区: 0.01, 西南地区: 0.12 },
  柑橘: { 东北平原: 0.005, 华北平原: 0.02, 西北地区: 0.005, 长江中下游: 0.32, 华南地区: 0.36, 西南地区: 0.29 },
  蔬菜: { 东北平原: 0.06, 华北平原: 0.28, 西北地区: 0.06, 长江中下游: 0.30, 华南地区: 0.18, 西南地区: 0.12 },
  水果: { 东北平原: 0.04, 华北平原: 0.24, 西北地区: 0.18, 长江中下游: 0.20, 华南地区: 0.20, 西南地区: 0.14 }
};

// 高集中度作物：主产省全国份额按公开产区格局锚定
// 2020 年新疆棉花约占全国 87.3%、广西甘蔗约占 68.6%
// （广东省农业农村厅援引国家统计局数据，https://dara.gd.gov.cn/ywdt/tt/content/post_4548152.html）
const CASH_PROVINCE_ANCHOR = {
  棉花: { 新疆: 0.87 },
  甘蔗: { 广西: 0.68 }
};

// 省份专业化倾斜系数：在主产省内按粮食占比分摊的基础上，对传统优势省份加权
const PROVINCE_CASH_TILT = {
  棉花: { 新疆: 2.5, 甘肃: 1.3, 山东: 1.6, 河北: 1.2, 湖北: 1.6, 安徽: 1.2 },
  花生: { 河南: 2.5, 山东: 1.4, 辽宁: 1.3, 广东: 1.3, 河北: 1.2, 四川: 1.1 },
  油菜籽: { 四川: 2.0, 湖北: 1.8, 湖南: 1.6, 江西: 1.4, 安徽: 1.3, 重庆: 1.2, 贵州: 1.3, 云南: 1.2, 青海: 1.1, 内蒙古: 1.2 },
  甘蔗: { 广西: 2.0, 云南: 2.0, 广东: 1.3, 海南: 1.4, 福建: 0.5 },
  茶叶: { 福建: 1.8, 云南: 1.8, 浙江: 1.5, 湖北: 1.4, 四川: 1.4, 安徽: 1.2, 贵州: 1.4, 湖南: 1.3 },
  苹果: { 陕西: 2.2, 山东: 2.0, 甘肃: 1.8, 山西: 1.4, 辽宁: 1.3, 河北: 1.2, 新疆: 1.2, 四川: 1.2, 河南: 1.3, 云南: 1.1 },
  柑橘: { 广西: 2.0, 湖南: 1.8, 江西: 1.7, 湖北: 1.7, 四川: 1.8, 福建: 1.6, 重庆: 1.4, 浙江: 1.4, 广东: 1.3, 云南: 1.3, 贵州: 1.1 },
  蔬菜: { 山东: 2.0, 河南: 1.9, 江苏: 1.6, 广东: 1.5, 河北: 1.5, 四川: 1.4, 湖北: 1.3, 湖南: 1.3, 广西: 1.3, 云南: 1.2, 浙江: 1.2, 辽宁: 1.1, 新疆: 1.1 },
  水果: { 山东: 1.6, 广西: 1.5, 河南: 1.4, 陕西: 1.6, 河北: 1.3, 广东: 1.4, 新疆: 1.5, 甘肃: 1.2 }
};

// 经济作物产区适宜度（0—1），用于地区推荐打分
const ZONE_CASH_SUITABILITY = {
  东北平原:    { 棉花: 0.10, 花生: 0.55, 油菜籽: 0.12, 甘蔗: 0.02, 甜菜: 0.60, 茶叶: 0.04, 水果: 0.35, 烤烟: 0.06, 苹果: 0.55, 柑橘: 0.05, 蔬菜: 0.45 },
  华北平原:    { 棉花: 0.45, 花生: 0.80, 油菜籽: 0.18, 甘蔗: 0.03, 甜菜: 0.08, 茶叶: 0.05, 水果: 0.60, 烤烟: 0.22, 苹果: 0.80, 柑橘: 0.15, 蔬菜: 0.75 },
  西北地区:    { 棉花: 0.95, 花生: 0.22, 油菜籽: 0.20, 甘蔗: 0.03, 甜菜: 0.40, 茶叶: 0.05, 水果: 0.65, 烤烟: 0.10, 苹果: 0.90, 柑橘: 0.05, 蔬菜: 0.60 },
  长江中下游:  { 棉花: 0.35, 花生: 0.38, 油菜籽: 0.78, 甘蔗: 0.12, 甜菜: 0.02, 茶叶: 0.62, 水果: 0.50, 烤烟: 0.06, 苹果: 0.30, 柑橘: 0.60, 蔬菜: 0.85 },
  华南地区:    { 棉花: 0.08, 花生: 0.55, 油菜籽: 0.10, 甘蔗: 0.92, 甜菜: 0.01, 茶叶: 0.55, 水果: 0.85, 烤烟: 0.10, 苹果: 0.05, 柑橘: 0.85, 蔬菜: 0.90 },
  西南地区:    { 棉花: 0.10, 花生: 0.30, 油菜籽: 0.45, 甘蔗: 0.55, 甜菜: 0.04, 茶叶: 0.70, 水果: 0.55, 烤烟: 0.62, 苹果: 0.45, 柑橘: 0.75, 蔬菜: 0.80 }
};

// 经济作物推荐理由（产区特色一句话）
const CASH_REASON = {
  棉花: '机械化采收成熟，订单农业覆盖广',
  花生: '耐旱耐瘠、适合与粮食作物轮作',
  油菜籽: '稻油轮作衔接顺畅，冬闲田利用率高',
  甘蔗: '光热充足，糖厂收购体系完善',
  甜菜: '昼夜温差大，利于糖分积累',
  茶叶: '丘陵山地适宜，名优茶溢价明显',
  水果: '品种结构丰富，冷链外销渠道畅通',
  苹果: '黄土高原与渤海湾优生区，着色糖度俱佳',
  柑橘: '亚热带丘陵气候适配，晚熟错峰效益好',
  蔬菜: '设施与露地并举，供应周期长',
  烤烟: '标准化烤房配套齐全，收购价格稳定'
};

// 各作物参考价格（元/公斤）与年际涨幅，用于生成价格字段
// 注意：价格为演示数据，仅用于跑通页面交互，不代表真实行情
const CROP_PRICE = {
  粮食: { base: 2.45, growth: 0.03 },
  稻谷: { base: 2.75, growth: 0.03 },
  小麦: { base: 2.55, growth: 0.035 },
  玉米: { base: 2.25, growth: 0.03 },
  大豆: { base: 4.85, growth: 0.028 },
  其他粮食: { base: 2.70, growth: 0.03 },
  棉花: { base: 15.5, growth: 0.02 },
  花生: { base: 7.8, growth: 0.03 },
  油菜籽: { base: 6.0, growth: 0.03 },
  甘蔗: { base: 0.58, growth: 0.02 },
  茶叶: { base: 58, growth: 0.03 },
  苹果: { base: 6.8, growth: 0.025 },
  柑橘: { base: 4.5, growth: 0.025 },
  蔬菜: { base: 3.5, growth: 0.03 },
  水果: { base: 6.2, growth: 0.03 }
};

// 简单确定性伪随机，保证每次生成的数据一致
let seedState = 20260114;
function rand() {
  seedState = (seedState * 1103515245 + 12345) & 0x7fffffff;
  return seedState / 0x7fffffff;
}
function round2(n) {
  return Math.round(n * 100) / 100;
}

// ============================================================
// 二、城市清单：与气象系统同源（China-City-List-latest.csv）
//    覆盖大陆 31 个省级行政区的全部地级市
// ============================================================
function loadCities() {
  const file = path.join(__dirname, '..', 'China-City-List-latest.csv');
  const content = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const lines = content.split(/\r?\n/);
  const cities = [];
  for (let i = 2; i < lines.length; i++) {
    const cols = lines[i].trim().split(',');
    if (cols.length < 10) continue;
    const code = cols[0].trim();
    const name = cols[2].trim();
    const adm1 = cols[7].trim();
    const adm2 = cols[9].trim();
    if (!code || !name || !adm1) continue;
    if (adm2 !== `${name}市`) continue; // 只保留地级市
    // 只保留大陆 31 省（统计局有粮食数据的省份）
    const shortName = Object.keys(PROVINCE_ALIAS).find(k => PROVINCE_ALIAS[k] === adm1);
    if (!shortName) continue;
    cities.push({ code, name, province: shortName, zone: PROVINCE_ZONE[shortName] });
  }
  return cities;
}

// 省内城市权重：按城市名确定性生成，同省内归一化后合计为 1
function cityWeights(cities) {
  const raw = cities.map(c => {
    let h = 0;
    for (const ch of c.name) h = (h * 31 + ch.charCodeAt(0)) & 0x7fffffff;
    return 0.55 + (h % 1000) / 1000 * 0.9; // 0.55 ~ 1.45
  });
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map(v => v / sum);
}

// ============================================================
// 三、粮食品种结构校准（IPF 迭代比例拟合）
//    目标：各产区带按先验结构分摊后，全国分品种合计贴近统计局口径
// ============================================================
function buildZoneStructures(cities) {
  // 各省 -> 产区带 -> 该带的城市与省内权重
  const zoneProvinces = {};
  cities.forEach(c => {
    if (!zoneProvinces[c.zone]) zoneProvinces[c.zone] = new Set();
    zoneProvinces[c.zone].add(c.province);
  });

  const result = {};
  YEARS.forEach(year => {
    const grain = NBS_GRAIN[year];
    // 每个产区带该年的粮食总量
    const zoneTotal = {};
    Object.keys(zoneProvinces).forEach(zone => {
      zoneTotal[zone] = 0;
      zoneProvinces[zone].forEach(p => { zoneTotal[zone] += grain[p]; });
    });

    // 初始化先验
    const struct = {};
    Object.keys(zoneProvinces).forEach(zone => {
      struct[zone] = { ...ZONE_STRUCTURE_PRIOR[zone] };
    });

    const crops = GRAIN_CROPS;
    const target = { ...NBS_CROP_NATIONAL[year] };
    // “其他粮食”目标 = 全国总量 - 四个已校准品种之和
    const nationalTotal = Object.values(grain).reduce((a, b) => a + b, 0);
    target['其他粮食'] = nationalTotal - target['稻谷'] - target['小麦'] - target['玉米'] - target['大豆'];

    // IPF：反复按品种缩放 + 按带归一化，收敛后全国合计贴合目标
    for (let iter = 0; iter < 30; iter++) {
      crops.forEach(crop => {
        let current = 0;
        Object.keys(struct).forEach(zone => {
          current += zoneTotal[zone] * struct[zone][crop];
        });
        if (current <= 0) return;
        const scale = target[crop] / current;
        Object.keys(struct).forEach(zone => { struct[zone][crop] *= scale; });
      });
      Object.keys(struct).forEach(zone => {
        const s = crops.reduce((a, c) => a + struct[zone][c], 0);
        crops.forEach(c => { struct[zone][c] /= s; });
      });
    }
    result[year] = struct;
  });
  return result;
}

// ============================================================
// 三之二、经济作物/蔬菜/水果省份份额模型
//   主产省按锚定份额；其余按「产区带先验 × 省内粮食占比 × 专业化倾斜」分摊
// ============================================================
// 使用「产区带分摊模型」的全部作物：经济作物 + 蔬菜 + 水果（含合计与两个单品）
const CASH_MODEL_CROPS = [...CASH_CROPS, ...VEG_CROPS, ...FRUIT_CROPS];

// 全国真实总量查询（来源均为统计局免费公开口径）
function nationalOf(crop, year) {
  if (NBS_CASH_NATIONAL[crop]) return NBS_CASH_NATIONAL[crop][year];
  if (NBS_FRUIT_NATIONAL[crop]) return NBS_FRUIT_NATIONAL[crop][year];
  if (NBS_VEG_NATIONAL[crop]) return NBS_VEG_NATIONAL[crop][year];
  return null;
}

function cashProvinceShares(crop, year) {
  const grain = NBS_GRAIN[year];
  const anchor = CASH_PROVINCE_ANCHOR[crop] || {};
  const zoneShare = CASH_ZONE_SHARE[crop];

  // 产区带 -> 省份列表
  const zoneProvinces = {};
  Object.keys(PROVINCE_ZONE).forEach(p => {
    const z = PROVINCE_ZONE[p];
    if (!zoneProvinces[z]) zoneProvinces[z] = [];
    zoneProvinces[z].push(p);
  });

  // 有效产区带先验 = 先验 − 本带锚定省已占份额
  const effZone = { ...zoneShare };
  Object.keys(anchor).forEach(p => {
    const z = PROVINCE_ZONE[p];
    effZone[z] = Math.max(0, (effZone[z] || 0) - anchor[p]);
  });
  const effSum = Object.values(effZone).reduce((a, b) => a + b, 0);
  const restShare = 1 - Object.values(anchor).reduce((a, b) => a + b, 0);

  const shares = { ...anchor };
  Object.keys(effZone).forEach(zone => {
    if (effZone[zone] <= 0) return;
    const zoneRest = restShare * (effZone[zone] / effSum); // 该带分到的剩余份额
    const provinces = zoneProvinces[zone].filter(p => !anchor[p]);
    const zoneGrain = provinces.reduce((s, p) => s + (grain[p] || 0), 0);
    const raw = provinces.map(p => (grain[p] || 0) / zoneGrain * (PROVINCE_CASH_TILT[crop]?.[p] || 1));
    const rawSum = raw.reduce((a, b) => a + b, 0);
    provinces.forEach((p, i) => { shares[p] = zoneRest * raw[i] / rawSum; });
  });
  return shares;
}

// ============================================================
// 四、灌库
// ============================================================
async function seedCropData(cities) {
  await CropData.sync({ force: true }); // 重建表，保证 schema 与模型一致

  const structures = buildZoneStructures(cities);
  const cashShares = {};
  CASH_MODEL_CROPS.forEach(c => { cashShares[c] = cashProvinceShares(c, 2024); });

  // 按省分组城市并计算省内权重
  const byProvince = {};
  cities.forEach(c => {
    if (!byProvince[c.province]) byProvince[c.province] = [];
    byProvince[c.province].push(c);
  });
  const provinceWeights = {};
  Object.keys(byProvince).forEach(p => {
    provinceWeights[p] = cityWeights(byProvince[p]);
  });

  const rows = [];
  // 2024 年市域产量存档，供推荐表 estimateYield 使用（与 crop_data 同源）
  const cityProduction = {};

  Object.keys(byProvince).forEach(province => {
    const cityList = byProvince[province];
    const weights = provinceWeights[province];
    const zone = cityList[0].zone;

    cityList.forEach((city, idx) => {
      YEARS.forEach(year => {
        const provinceGrain = NBS_GRAIN[year][province];
        const struct = structures[year][zone];
        // 城市粮食量 = 省份真实总量 × 省内权重
        const cityGrain = provinceGrain * weights[idx];

        const push = (crop, value) => {
          if (!(value > 0)) return; // 零份额省份不产生空行
          const pc = CROP_PRICE[crop];
          const price = pc.base * (1 + (year - 2020) * pc.growth) * (0.96 + rand() * 0.08);
          rows.push({
            cropType: crop,
            year,
            yield: round2(value),
            price: round2(price),
            region: city.name
          });
          if (year === 2024) {
            if (!cityProduction[city.name]) cityProduction[city.name] = {};
            cityProduction[city.name][crop] = round2(value);
          }
        };

        // 粮食口径：合计 + 五个品种分量
        push('粮食', cityGrain);
        GRAIN_CROPS.forEach(crop => push(crop, cityGrain * struct[crop]));

        // 经济作物/蔬菜/水果：全国真实总量 × 省份额 × 省内权重
        CASH_MODEL_CROPS.forEach(crop => {
          const share = cashShares[crop][province] || 0;
          push(crop, nationalOf(crop, year) * share * weights[idx]);
        });
      });
    });
  });

  await CropData.bulkCreate(rows);
  console.log(`crop_data       写入 ${rows.length} 条（${cities.length} 个地市 × ${YEARS.length} 年 × 14 个口径：粮食合计 + 5 粮食品种 + 5 种经济作物 + 蔬菜 + 水果/苹果/柑橘）`);
  return cityProduction;
}

async function seedCropRecommend(cities, structures, cityProduction) {
  await CropRecommend.sync({ force: true }); // 重建表，带上 category 字段
  const rows = [];
  const latestYear = 2024;

  // 品种级知识查询（带兜底）
  const grainKnowledge = (crop, zone) =>
    GRAIN_VARIETY[crop]?.[zone] || { v: '当地主栽品种', n: '栽培历史悠久、购销渠道成熟' };
  // 经济作物知识：省份级覆盖优先（茶叶等地域性强的作物），否则用产区带知识
  const cashKnowledge = (crop, zone, province) =>
    PROVINCE_VARIETY[province]?.[crop] ||
    CASH_KNOWLEDGE[crop]?.[zone] ||
    { v: '当家品种', n: CASH_REASON[crop] || '产业基础扎实' };

  // 特色作物：城市级特产优先，不足时用省级兜底补齐；与已选粮经作物去重
  const pickSpecialties = (city, pickedCrops) => {
    const cityList = CITY_SPECIALTY[city.name] || [];
    const provinceList = PROVINCE_SPECIALTY[city.province] || [];
    const all = [...cityList, ...provinceList];
    return all
      .filter(sp => !pickedCrops.some(pc =>
        sp.crop.includes(pc) || pc.includes(sp.crop.replace(/原料|等.*/, ''))))
      .slice(0, 2);
  };

  cities.forEach(city => {
    const zone = city.zone;
    const struct = structures[latestYear][zone];

    // 基本粮食作物：按当年产区结构占比取前 2
    const grainScored = GRAIN_RECOMMEND_CROPS
      .map(c => ({ crop: c, score: struct[c] || 0 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);
    // 经济作物：按产区适宜度取前 2
    const cashScored = CASH_RECOMMEND_CROPS
      .map(c => ({ crop: c, score: ZONE_CASH_SUITABILITY[zone][c] || 0 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);

    const items = [];
    grainScored.forEach(s => {
      const kv = grainKnowledge(s.crop, zone);
      items.push({
        ...s,
        category: '基本粮食作物',
        reason: `${city.name}地处${zone}，${ZONE_DESC[zone]}。${s.crop}主推${kv.v}，${kv.n}，与当地种植制度衔接顺畅，是稳产增收的基本盘。`
      });
    });
    cashScored.forEach(s => {
      const ck = cashKnowledge(s.crop, zone, city.province);
      items.push({
        ...s,
        category: '经济作物',
        reason: `${city.name}${s.crop}产业基础扎实，主推${ck.v}，${ck.n}；市场化收购渠道成熟，效益弹性大。`
      });
    });

    // 特色作物：具体到地标产品 / 特产（预估产量多为 null，不与产量口径混淆）
    const picked = [...grainScored, ...cashScored].map(s => s.crop);
    pickSpecialties(city, picked).forEach((sp, i) => {
      items.push({
        crop: sp.crop,
        score: 0.95 - i * 0.05,
        category: '特色作物',
        reason: `${sp.tag}｜${sp.reason}`
      });
    });

    items.forEach((item, idx) => {
      const index = item.category === '特色作物'
        ? Math.max(7, 9 - Math.floor(rand() * 2))
        : Math.max(6, 10 - idx - Math.floor(rand() * 2));
      const production = cityProduction[city.name]?.[item.crop];
      rows.push({
        region: city.name,
        cropType: item.crop,
        category: item.category,
        recommendIndex: index,
        reason: item.reason,
        // 预估产量与 crop_data 同源；特色作物与无产量序列品种（甜菜/烤烟）为 null
        estimateYield: production != null && production > 0 ? production : null
      });
    });
  });

  await CropRecommend.bulkCreate(rows);
  console.log(`crop_recommend  写入 ${rows.length} 条（${cities.length} 市 × 最多 6 条：基本粮食作物 2 + 经济作物 2 + 特色作物 2）`);
}

async function seedPosts() {
  await Post.destroy({ where: {} });
  const admin = await User.findOne({ where: { username: 'admin' } });
  if (!admin) {
    console.log('未找到 admin 用户，跳过帖子种子');
    return;
  }

  const posts = [
    {
      title: '小麦越冬管理技术要点',
      content: '春季小麦返青期要及时追施氮肥，每亩尿素10-15公斤。\n同时注意纹枯病和蚜虫防治，建议在拔节期喷施一次杀菌剂。\n有经验的农户欢迎在评论区补充。'
    },
    {
      title: '今年玉米价格走势分析',
      content: '从近五年数据看，玉米价格整体呈温和上行趋势。\n去年受气候影响产区减产，价格出现阶段性高点。\n建议大家关注期货市场动态，合理安排售粮节奏。'
    },
    {
      title: '大豆玉米带状复合种植经验分享',
      content: '采用2:4带状复合模式，即2行大豆配4行玉米。\n关键点在于行距控制和耐荫大豆品种选择。\n我们合作社试种两年，亩均增收约300元。'
    },
    {
      title: '高标准农田建设带来的变化',
      content: '完成土地平整和灌溉管网改造后，浇水时间从三天缩短到一天。\n大型机械也能进地了，播种效率明显提升。\n配套的机耕道解决了以往农机下田难的问题。'
    },
    {
      title: '新疆棉田种植密度讨论',
      content: '新疆机采棉亩保苗株数一般在1.2-1.4万株。\n密度过大影响通风透光，增加脱叶难度。\n大家当地都是什么密度？'
    },
    {
      title: '花生黄叶病怎么治',
      content: '花生中后期黄叶多半是缺铁或缺钾。\n可以叶面喷施硫酸亚铁加磷酸二氢钾，7-10天一次，连续两次。\n严重地块建议结合土壤检测结果调整施肥方案。'
    }
  ];

  const rows = posts.map((p, i) => ({
    ...p,
    userId: admin.id,
    createTime: new Date(Date.now() - (posts.length - i) * 86400000),
    updateTime: new Date(Date.now() - (posts.length - i) * 86400000)
  }));
  await Post.bulkCreate(rows);
  console.log(`post            写入 ${rows.length} 条`);
}

(async () => {
  try {
    await sequelize.authenticate();
    console.log('数据库连接成功:', sequelize.getDialect());
    await sequelize.sync();

    const cities = loadCities();
    console.log(`城市清单加载完成：${cities.length} 个地级市（大陆 31 省份）`);

    const cityProduction = await seedCropData(cities);
    await seedCropRecommend(cities, buildZoneStructures(cities), cityProduction);
    await seedPosts();

    // 校验：全国合计应贴近统计局口径
    const grainRows = await CropData.findAll({ where: { year: 2024, cropType: '粮食' }, raw: true });
    const grainTotal = grainRows.reduce((s, r) => s + Number(r.yield), 0);
    console.log(`校验 2024 全国粮食合计: ${grainTotal.toFixed(1)} 万吨（统计局口径 70649.9）`);

    const partRows = await CropData.findAll({ where: { year: 2024, cropType: GRAIN_CROPS }, raw: true });
    const partSum = partRows.reduce((s, r) => s + Number(r.yield), 0);
    console.log(`校验 2024 品种分量之和: ${partSum.toFixed(1)} 万吨（与粮食合计偏差 ${((partSum - grainTotal) / grainTotal * 100).toFixed(3)}%）`);

    for (const crop of ['稻谷', '小麦', '玉米', '大豆']) {
      const rs = await CropData.findAll({ where: { year: 2024, cropType: crop }, raw: true });
      const t = rs.reduce((s, r) => s + Number(r.yield), 0);
      const target = NBS_CROP_NATIONAL[2024][crop];
      console.log(`校验 2024 ${crop} 全国合计: ${t.toFixed(1)} 万吨（统计局口径 ${target}，偏差 ${((t - target) / target * 100).toFixed(2)}%）`);
    }

    for (const crop of CASH_CROPS) {
      const rs = await CropData.findAll({ where: { year: 2024, cropType: crop }, raw: true });
      const t = rs.reduce((s, r) => s + Number(r.yield), 0);
      const target = NBS_CASH_NATIONAL[crop][2024];
      console.log(`校验 2024 ${crop} 全国合计: ${t.toFixed(1)} 万吨（公报口径 ${target}，偏差 ${((t - target) / target * 100).toFixed(2)}%）`);
    }

    for (const crop of [...FRUIT_CROPS, ...VEG_CROPS]) {
      const rs = await CropData.findAll({ where: { year: 2024, cropType: crop }, raw: true });
      const t = rs.reduce((s, r) => s + Number(r.yield), 0);
      const target = nationalOf(crop, 2024);
      console.log(`校验 2024 ${crop} 全国合计: ${t.toFixed(1)} 万吨（公报口径 ${target.toFixed(1)}，偏差 ${((t - target) / target * 100).toFixed(2)}%）`);
    }

    // 特色推荐覆盖校验：每个城市至少 1 条特色作物
    const specRows = await CropRecommend.findAll({ where: { category: '特色作物' }, raw: true });
    const specCities = new Set(specRows.map(r => r.region));
    console.log(`校验 特色作物推荐覆盖: ${specCities.size}/${cities.length} 个城市`);

    console.log('\n演示数据灌入完成');
    process.exit(0);
  } catch (err) {
    console.error('种子数据执行失败:', err.message);
    process.exit(1);
  }
})();
