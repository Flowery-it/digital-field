/** 「我的关注」本地配置（原 HomeView / MyFocusView / AiAdvisor 三处隐式耦合同一 key） */

export interface FocusConfig {
  /** 关注的品种 productId 列表 */
  products: string[];
  /** 种植区域（城市名，如「石家庄」） */
  region: string;
  /** 种植区域所属省份（2026-10-16 新增，兼容无该字段的旧配置） */
  province: string;
  /** 参考市场 marketId 列表 */
  markets: string[];
}

const DEFAULT_PROVINCE = '河北省';

/** 配置存储 key：按用户名隔离，游客落到 guest */
export const focusStorageKey = (username?: string | null) => `focus_${username || 'guest'}`;

const emptyConfig = (): FocusConfig => ({
  products: [],
  region: '',
  province: DEFAULT_PROVINCE,
  markets: []
});

/** 读取关注配置；本地数据损坏或不存在时回退默认值（不抛错） */
export const loadFocusConfig = (username?: string | null): FocusConfig => {
  try {
    const raw = localStorage.getItem(focusStorageKey(username));
    if (!raw) return emptyConfig();
    const parsed = JSON.parse(raw);
    return {
      products: Array.isArray(parsed.products) ? parsed.products : [],
      region: typeof parsed.region === 'string' ? parsed.region : '',
      province: typeof parsed.province === 'string' && parsed.province ? parsed.province : DEFAULT_PROVINCE,
      markets: Array.isArray(parsed.markets) ? parsed.markets : []
    };
  } catch {
    return emptyConfig();
  }
};

/** 写入关注配置 */
export const saveFocusConfig = (username: string | null | undefined, config: FocusConfig) => {
  localStorage.setItem(focusStorageKey(username), JSON.stringify(config));
};

/** 清除关注配置（重置关注设置） */
export const clearFocusConfig = (username?: string | null) => {
  localStorage.removeItem(focusStorageKey(username));
};

/** 仅取关注品种 id 列表（AiAdvisor 问答上下文用，默认取前 5 个） */
export const loadFocusProductIds = (username?: string | null, limit = 5): string[] =>
  loadFocusConfig(username).products.slice(0, limit);
