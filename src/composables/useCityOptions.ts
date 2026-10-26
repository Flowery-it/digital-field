import { ref } from 'vue';
import axiosInstance from '../utils/axios';

export interface CityItem {
  name: string;
  code: string;
}

interface CityOptionsConfig {
  /** 城市列表加载失败时的回调（如 ElMessage 提示）；不传则静默降级 */
  onError?: () => void;
}

/**
 * 省市联动数据源（全站 6 处同款：天气 / 荐种 / 施肥 / 产量 / 对接 / 我的关注）
 * 只负责「拉列表 + 管理状态」；各省视图自己的后续联动
 * （刷新天气、保存本地配置、反查定位等）在调用方处理，保持行为不变。
 */
export function useCityOptions(config: CityOptionsConfig = {}) {
  const provinces = ref<string[]>([]);
  const cities = ref<CityItem[]>([]);
  const loading = ref(false);

  const loadCities = async (province?: string) => {
    loading.value = true;
    try {
      const res: any = await axiosInstance.get('/weather/cities', {
        params: { province: province || '' }
      });
      cities.value = res.data?.cities || [];
      provinces.value = res.data?.provinces || [];
    } catch {
      cities.value = [];
      config.onError?.();
    } finally {
      loading.value = false;
    }
  };

  /** 当前省份下是否已包含某城市（切换省份后决定是否回退首城） */
  const hasCity = (name: string) => cities.value.some(c => c.name === name);

  return { provinces, cities, loading, loadCities, hasCity };
}
