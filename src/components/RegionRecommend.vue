<template>
  <div class="region-recommend">
    <div class="recommend-header">
      <el-select
        v-model="selectedRegion"
        class="region-select"
        filterable
        clearable
        placeholder="请选择地区"
        @change="handleRegionChange"
      >
        <el-option label="请选择地区" value="" />
        <el-option v-for="r in regions" :key="r" :label="r" :value="r" />
      </el-select>
    </div>
    <div v-loading="loadState === 'loading'" v-if="recommendList.length > 0" class="recommend-list">
      <div v-for="g in groups" :key="g.name" class="recommend-group">
        <div class="group-title">
          <span class="group-name">{{ g.name }}</span>
          <span class="group-desc">{{ g.desc }}</span>
        </div>
        <div class="recommend-cards">
          <!-- 推荐卡片：作物图全幅背景 + 深色渐变遮罩，白字保证对比度 -->
          <div
            v-for="item in g.items"
            :key="item.id"
            class="recommend-card"
            role="button"
            tabindex="0"
            @click="handleRecommendClick(item)"
            @keydown.enter.prevent="handleRecommendClick(item)"
            @keydown.space.prevent="handleRecommendClick(item)"
          >
            <div
              class="rc-bg"
              :style="recommendImgStyle(item.cropType)"
              aria-hidden="true"
            ></div>
            <div class="rc-inner">
              <div class="card-header">
                <span class="crop-type">{{ item.cropType }}</span>
                <el-tag :type="getTagType(item.recommendIndex)" effect="dark" round>
                  推荐指数: {{ item.recommendIndex }}
                </el-tag>
              </div>
              <div class="card-body">
                <p class="recommend-reason">{{ item.reason }}</p>
                <p class="estimate-yield" v-if="item.estimateYield">
                  预估产量: {{ item.estimateYield }}万吨
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div v-else-if="loadState === 'error'" class="state-error state-error-block" role="alert">
      <el-icon><WarningFilled /></el-icon>
      <span>推荐数据加载失败，请稍后重试</span>
      <el-button size="small" type="primary" @click="loadRecommendData">重试</el-button>
    </div>
    <div v-else class="empty-container">
      <el-empty
        image="/images/empty-fields.jpg"
        :description="selectedRegion ? '该地区暂无推荐数据，请切换其他地区' : '请选择地区查看作物推荐'"
        :image-size="120"
      />
    </div>

    <!-- 推荐详情弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="selectedRecommend?.cropType + '推荐详情'"
      :width="dialogWidth"
    >
      <div class="dialog-content">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="地区">{{ selectedRecommend?.region }}</el-descriptions-item>
          <el-descriptions-item label="作物分类">
            <el-tag size="small" :type="getCategoryTag(selectedRecommend?.category)">
              {{ selectedRecommend?.category || '基本粮食作物' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="作物类型">{{ selectedRecommend?.cropType }}</el-descriptions-item>
          <el-descriptions-item label="推荐指数">{{ selectedRecommend?.recommendIndex }}</el-descriptions-item>
          <el-descriptions-item label="预估产量">
            {{ selectedRecommend?.estimateYield || '暂无' }}万吨
          </el-descriptions-item>
          <el-descriptions-item label="推荐理由">
            {{ selectedRecommend?.reason }}
          </el-descriptions-item>
        </el-descriptions>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { WarningFilled } from '@element-plus/icons-vue';
import axiosInstance from '../utils/axios';
import { useViewportWidth } from '../composables/useViewportWidth';
import { cropImage } from '../utils/cropImages';

const selectedRegion = ref('');
const regions = ref<string[]>([]);
const recommendList = ref<any[]>([]);
const dialogVisible = ref(false);
const selectedRecommend = ref<any | null>(null);

// 四态状态机：loading / error / ready
type LoadState = 'loading' | 'error' | 'ready';
const loadState = ref<LoadState>('ready');

// 弹窗响应式宽度：小屏用百分比，避免 500px 固定宽溢出
const viewportWidth = useViewportWidth();
const dialogWidth = computed(() => (viewportWidth.value <= 640 ? '92%' : '500px'));

// 按大类分组：基本粮食作物 / 经济作物 / 特色作物（组内按推荐指数降序）
const grainRecommends = computed(() =>
  recommendList.value
    .filter(r => r.category !== '经济作物' && r.category !== '特色作物')
    .sort((a, b) => b.recommendIndex - a.recommendIndex)
);
const cashRecommends = computed(() =>
  recommendList.value
    .filter(r => r.category === '经济作物')
    .sort((a, b) => b.recommendIndex - a.recommendIndex)
);
const specialtyRecommends = computed(() =>
  recommendList.value
    .filter(r => r.category === '特色作物')
    .sort((a, b) => b.recommendIndex - a.recommendIndex)
);

// 模板按组渲染：组定义集中一处，避免三份重复结构
const groups = computed(() => [
  { name: '基本粮食作物', desc: '口粮安全，种植基础扎实', items: grainRecommends.value },
  { name: '经济作物', desc: '市场化程度高，效益弹性大', items: cashRecommends.value },
  { name: '特色作物', desc: '地理标志与地方特产，品牌溢价高', items: specialtyRecommends.value }
]);

// 作物背景图映射（与价格总览共用，含 165 种作物的关键词归桶逻辑）
// 见 src/utils/cropImages.ts

/**
 * 推荐卡背景图：整批预探测 + 缓存，与 HomeView 同一套做法。
 * 背景图场景没有 onerror，路径失效只会静默不显示；
 * 这里先探测再挂载，失败的交给 .rc-bg 自身渐变底色兜底。
 */
const imgOk = ref<Record<string, boolean>>({});

watch(
  recommendList,
  async (list) => {
    const urls = [...new Set(list.map((r: any) => cropImage(r.cropType)))];
    const probe = (url: string) =>
      new Promise<boolean>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = url;
      });
    const results = await Promise.all(urls.map(probe));
    const next: Record<string, boolean> = {};
    urls.forEach((u, i) => {
      next[u] = results[i] === true;
    });
    imgOk.value = next;
  },
  { immediate: true }
);

const recommendImgStyle = (cropType: string) => {
  const url = cropImage(cropType);
  return imgOk.value[url] === true ? { backgroundImage: `url("${encodeURI(url)}")` } : {};
};

// 加载地区选项（与产量图表共用同一份地市清单）
const loadRegions = async () => {
  try {
    const res: any = await axiosInstance.get('/crop/regions');
    regions.value = res.data || [];
    // 默认选中平台主城市，保证首页该模块有内容可看
    if (!selectedRegion.value) {
      selectedRegion.value = regions.value.includes('石家庄') ? '石家庄' : (regions.value[0] || '');
    }
  } catch {
    /* 地区列表加载失败时保持为空 */
  }
};

// 加载推荐数据
const loadRecommendData = async () => {
  loadState.value = 'loading';
  try {
    const response = await axiosInstance.get('/recommend/list', {
      params: {
        region: selectedRegion.value
      }
    });
    recommendList.value = response.data;
    loadState.value = 'ready';
  } catch (error) {
    console.error('加载推荐数据失败:', error);
    recommendList.value = [];
    // 区分「加载失败」与「暂无数据」
    loadState.value = 'error';
  }
};

// 处理地区选择变化
const handleRegionChange = () => {
  // 清空选择器时不请求接口（后端要求地区必填），直接展示空态
  if (!selectedRegion.value) {
    recommendList.value = [];
    loadState.value = 'ready';
    return;
  }
  loadRecommendData();
};

// 处理推荐卡片点击
const handleRecommendClick = (item: any) => {
  selectedRecommend.value = item;
  dialogVisible.value = true;
};

// 获取标签类型
const getTagType = (recommendIndex: number) => {
  if (recommendIndex >= 8) {
    return 'success';
  } else if (recommendIndex >= 6) {
    return 'warning';
  } else {
    return 'info';
  }
};

// 分类标签配色
const getCategoryTag = (category?: string) => {
  if (category === '经济作物') return 'warning';
  if (category === '特色作物') return 'danger';
  return 'success';
};

// 生命周期
onMounted(async () => {
  await loadRegions();
  if (selectedRegion.value) {
    await loadRecommendData();
  }
});
</script>

<style scoped>
.region-recommend {
  width: 100%;
  height: 100%;
}

.recommend-header {
  margin-bottom: var(--space-5);
}

.region-select {
  width: 200px;
  max-width: 100%;
}

.recommend-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.recommend-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.group-title {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  border-left: 2px solid var(--brand-forest);
  padding-left: var(--space-2);
}

.group-name {
  font-family: var(--font-serif);
  font-size: var(--fs-base);
  font-weight: var(--fw-medium);
  color: var(--text-primary);
}

.group-desc {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
}

/* auto-fit：空轨道自动折叠，少量卡片时拉伸填满整行，不在右侧留空白 */
.recommend-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr));
  gap: var(--space-5);
}

/* ---- 推荐卡片：作物图全幅背景 + 深色渐变遮罩 ----
   遮罩 165deg 上浅下深：标题区透出更多作物画面，正文区对比度充足；
   白字 + 轻投影保证任何亮度的作物图上都可读（最亮情况（油菜花黄）仍 ≥4.5:1） */
.recommend-card {
  position: relative;
  overflow: hidden;
  min-height: 190px;
  display: flex;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--surface-soft);
  cursor: pointer;
  transition: border-color 0.24s ease;
}

.recommend-card:hover {
  border-color: var(--brand-moss);
}

.recommend-card:active {
  border-color: var(--brand-forest);
}

/* 背景图：悬停缓慢放大，营造「凑近看」的感受 */
.rc-bg {
  position: absolute;
  inset: 0;
  /* 图片探测失败时的占位：深森林绿纯色，保证叠加的遮罩层与白字仍可读 */
  background-color: var(--brand-forest-mid);
  background-size: cover;
  background-position: center;
}

/* 深色遮罩：同色系单层叠加，不用蓝紫渐变 */
.recommend-card::after {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--card-scrim);
}

.rc-inner {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-4);
}

.crop-type {
  font-family: var(--font-serif);
  font-size: var(--fs-lg);
  font-weight: var(--fw-medium);
  letter-spacing: 0.02em;
  color: #FBF8F0;
}

/* 标签改半透明白底：照片背景上避免饱和色块打架 */
.rc-inner :deep(.el-tag) {
  background: rgba(245, 242, 233, 0.14);
  border-color: rgba(245, 242, 233, 0.42);
  color: #FBF8F0;
  --el-tag-text-color: #FBF8F0;
  font-family: var(--font-sans);
}

.card-body {
  padding: var(--space-2) 0;
}

.recommend-reason {
  font-family: var(--font-serif);
  font-size: var(--fs-md);
  line-height: 1.7;
  color: rgba(245, 242, 233, 0.9);
  margin-bottom: var(--space-2);
}

.estimate-yield {
  font-family: var(--font-mono);
  font-size: var(--fs-md);
  letter-spacing: 0.02em;
  color: var(--brand-teal);
}

.empty-container {
  min-height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 错误态修饰类（state-error / state-error-block）已上提全局 style.css */

.dialog-content {
  padding: var(--space-2) 0;
}

@media (max-width: 480px) {
  .recommend-cards {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .recommend-card,
  .rc-bg {
    transition: none;
  }

  .recommend-card:hover {
    transform: none;
  }

  .recommend-card:hover .rc-bg {
    transform: none;
  }
}
</style>
