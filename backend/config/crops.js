/**
 * 作物分类与口径常量
 * seed.js（灌数）与 routes/crop.js（接口）共用，避免两处定义漂移。
 *
 * 分类口径：
 *   total     —— 粮食（合计），统计局分省真实数据，同时是各品种分量的合计
 *   grain     —— 基本粮食作物品种分量（IPF 校准分摊模型）
 *   cash      —— 经济作物（全国总量为公报真实数据，省级为产区带分摊模型）
 *   vegetable —— 蔬菜（全国总量为公报真实数据，省级为产区带分摊模型）
 *   fruit     —— 水果（含「水果」合计口径与苹果/柑橘两个单品，合计为公报真实数据）
 */
const CROP_CATEGORY = {
  粮食: 'total',
  稻谷: 'grain',
  小麦: 'grain',
  玉米: 'grain',
  大豆: 'grain',
  其他粮食: 'grain',
  棉花: 'cash',
  花生: 'cash',
  油菜籽: 'cash',
  甘蔗: 'cash',
  茶叶: 'cash',
  蔬菜: 'vegetable',
  水果: 'fruit',
  苹果: 'fruit',
  柑橘: 'fruit'
};

const GRAIN_CROPS = ['稻谷', '小麦', '玉米', '大豆', '其他粮食'];
const CASH_CROPS = ['棉花', '花生', '油菜籽', '甘蔗', '茶叶'];
const VEG_CROPS = ['蔬菜'];
// 水果组：供下拉选择用（含「水果」合计口径）
const FRUIT_CROPS = ['水果', '苹果', '柑橘'];
// 图表默认展示的水果品种分量（不含合计，避免与合计同图重复、量级失真）
const FRUIT_ITEM_CROPS = ['苹果', '柑橘'];

// 推荐候选：基本粮食作物取四个主品种（合计与其他粮食不参与单品种推荐）
const GRAIN_RECOMMEND_CROPS = ['稻谷', '小麦', '玉米', '大豆'];
// 经济作物候选含两个「仅适宜度推荐」品种（暂无公开五年分省产量序列，不灌产量数据）
const CASH_RECOMMEND_CROPS = ['棉花', '花生', '油菜籽', '甘蔗', '甜菜', '茶叶', '水果', '烤烟'];

const CATEGORY_LABEL = {
  total: '粮食合计',
  grain: '基本粮食作物',
  cash: '经济作物',
  vegetable: '蔬菜',
  fruit: '水果'
};

// /crop/chart 的 category 参数 -> 默认聚合的作物清单
// 说明：粮食组与水果组默认只取「品种分量」，不含「粮食」「水果」合计口径，
//       避免合计与分量同图重复、且量级差异把分量压成平线；合计口径由下拉单品种显式选中。
const CATEGORY_CROPS = {
  total: ['粮食'],
  grain: GRAIN_CROPS,
  cash: CASH_CROPS,
  vegetable: VEG_CROPS,
  fruit: FRUIT_ITEM_CROPS
};

module.exports = {
  CROP_CATEGORY,
  GRAIN_CROPS,
  CASH_CROPS,
  VEG_CROPS,
  FRUIT_CROPS,
  FRUIT_ITEM_CROPS,
  GRAIN_RECOMMEND_CROPS,
  CASH_RECOMMEND_CROPS,
  CATEGORY_LABEL,
  CATEGORY_CROPS
};
