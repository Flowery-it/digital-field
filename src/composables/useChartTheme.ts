/**
 * 图表主题令牌读取器
 *
 * 背景：ECharts 渲染到 canvas，color 字段写 var(--xxx) 不会解析，
 * 因此不能把 CSS 变量直接塞进 option。这里在首次读取时把 style.css
 * 的图表色板令牌快照成普通字符串，各图表渲染时同步取用。
 * 令牌值即设计系统唯一权威；此处只做「快照」，不新建第二套颜色。
 */

export interface ChartTheme {
  /** 轴标签文字（AA 安全灰） */
  axisLabel: string;
  /** 轴线 / 分割线 */
  axisLine: string;
  /** 主系列 = 深森林绿 */
  seriesPrimary: string;
  /** 预测 / 对比系列 */
  seriesAccent: string;
  /** 辅助系列 = 松针绿 */
  seriesGreen: string;
  /** 第三系列（AI 预测中枢 / 农时窗口） */
  seriesAmber: string;
  /** 主系列纯色面积填充 */
  areaPrimary: string;
  /** 对比系列纯色面积填充 */
  areaAccent: string;
  /** 主色面积渐变起（顶部） */
  areaPrimaryFrom: string;
  /** 主色面积渐变止（底部） */
  areaPrimaryTo: string;
  /** 对比色面积渐变起（顶部） */
  areaAccentFrom: string;
  /** 对比色面积渐变止（底部） */
  areaAccentTo: string;
  /** 绿柱渐变止（底部，顶部用 seriesGreen 纯色） */
  areaGreenTo: string;
  /** 琥珀预测区间带填充 */
  areaAmberTo: string;
  /** 多分类色板（多作物/多市场等需要 N 条可区分系列的场景） */
  categorical: string[];
}

/** 与 style.css v6 令牌默认值一致：CSS 未加载时图表仍有正确配色 */
const DEFAULTS: ChartTheme = {
  axisLabel: '#5C6C63',
  axisLine: '#E0DBD0',
  seriesPrimary: '#1F3A2E',
  seriesAccent: '#6E8B5A',
  seriesGreen: '#4F7A5D',
  seriesAmber: '#A98A5B',
  areaPrimary: 'rgba(31, 58, 46, 0.10)',
  areaAccent: 'rgba(110, 139, 90, 0.10)',
  areaPrimaryFrom: 'rgba(31, 58, 46, 0.24)',
  areaPrimaryTo: 'rgba(31, 58, 46, 0.02)',
  areaAccentFrom: 'rgba(110, 139, 90, 0.26)',
  areaAccentTo: 'rgba(110, 139, 90, 0.02)',
  areaGreenTo: 'rgba(79, 122, 93, 0.34)',
  areaAmberTo: 'rgba(169, 138, 91, 0.18)',
  // 大地色分类板：森林绿 / 苔藓 / 干草 / 松针 / 树皮 / 岩蓝 / 陶土 / 橄榄 / 灰紫 / 砂
  categorical: [
    '#1F3A2E', '#6E8B5A', '#A98A5B', '#4F7A5D', '#8E7B62',
    '#5F7A86', '#9A6B5A', '#7E8B4F', '#6B6473', '#A88E7C'
  ]
};

const CATEGORICAL_TOKENS = DEFAULTS.categorical;
const FALLBACK_CATEGORICAL = '#1F3A2E';

let cached: ChartTheme | null = null;

/** 读取（并缓存）图表主题；在图表 setOption 之前调用 */
export function getChartTheme(): ChartTheme {
  if (cached) return cached;
  if (typeof window === 'undefined') return DEFAULTS;
  const s = getComputedStyle(document.documentElement);
  const pick = (token: string, fallback: string) => s.getPropertyValue(token).trim() || fallback;
  cached = {
    axisLabel: pick('--chart-axis-label', DEFAULTS.axisLabel),
    axisLine: pick('--chart-axis-line', DEFAULTS.axisLine),
    seriesPrimary: pick('--chart-series-primary', DEFAULTS.seriesPrimary),
    seriesAccent: pick('--chart-series-accent', DEFAULTS.seriesAccent),
    seriesGreen: pick('--chart-series-green', DEFAULTS.seriesGreen),
    seriesAmber: pick('--chart-series-amber', DEFAULTS.seriesAmber),
    areaPrimary: pick('--chart-area-primary', DEFAULTS.areaPrimary),
    areaAccent: pick('--chart-area-accent', DEFAULTS.areaAccent),
    areaPrimaryFrom: pick('--chart-area-primary-from', DEFAULTS.areaPrimaryFrom),
    areaPrimaryTo: pick('--chart-area-primary-to', DEFAULTS.areaPrimaryTo),
    areaAccentFrom: pick('--chart-area-accent-from', DEFAULTS.areaAccentFrom),
    areaAccentTo: pick('--chart-area-accent-to', DEFAULTS.areaAccentTo),
    areaGreenTo: pick('--chart-area-green-to', DEFAULTS.areaGreenTo),
    areaAmberTo: pick('--chart-area-amber-to', DEFAULTS.areaAmberTo),
    categorical: CATEGORICAL_TOKENS.slice()
  };
  return cached;
}

/** 按序号取分类色，序号超出时循环取用，保证任意条数都有可区分的颜色 */
export function chartCategorical(index: number): string {
  const { categorical } = getChartTheme();
  return categorical[index % categorical.length] ?? FALLBACK_CATEGORICAL;
}
