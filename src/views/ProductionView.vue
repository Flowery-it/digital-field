<template>
  <PageShell>
    <!-- 模块横幅：统一全站横幅骨架，只换背景图与文案 -->
    <section class="page-hero prod-hero" aria-label="气象生产模块简介">
      <div class="page-hero-body">
        <p class="page-hero-kicker">气象 · 荐种 · 施肥 · 产量 · 对接</p>
        <h1 class="page-hero-title">把天气与行情，变成今天能执行的动作</h1>
        <p class="page-hero-sub">一个模块收拢产前产中的六项决策能力：先看总览掌握今天该做什么，再按需进入单项工具</p>
      </div>
    </section>

    <!-- 模块导航：分组呈现（决策类 / 执行类），当前项高亮 -->
    <nav class="prod-nav" aria-label="生产决策模块">
      <span class="nav-group-label">决策</span>
      <div class="nav-group">
        <router-link
          v-for="t in decisionTabs"
          :key="t.path"
          :to="t.path"
          class="prod-tab"
          :class="{ active: isActive(t.path) }"
        >
          <el-icon class="tab-icon" aria-hidden="true"><component :is="t.icon" /></el-icon>
          <span class="tab-text">
            <span class="tab-label">{{ t.label }}</span>
            <span class="tab-desc">{{ t.desc }}</span>
          </span>
        </router-link>
      </div>

      <span class="nav-group-label">执行</span>
      <div class="nav-group">
        <router-link
          v-for="t in actionTabs"
          :key="t.path"
          :to="t.path"
          class="prod-tab"
          :class="{ active: isActive(t.path) }"
        >
          <el-icon class="tab-icon" aria-hidden="true"><component :is="t.icon" /></el-icon>
          <span class="tab-text">
            <span class="tab-label">{{ t.label }}</span>
            <span class="tab-desc">{{ t.desc }}</span>
          </span>
        </router-link>
      </div>
    </nav>

    <router-view v-slot="{ Component }">
      <component :is="Component" :key="route.fullPath" embedded />
    </router-view>
  </PageShell>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router';
import {
  DataLine,
  Goods,
  MagicStick,
  Odometer,
  Sunny,
  Van
} from '@element-plus/icons-vue';
import PageShell from '../components/PageShell.vue';

const route = useRoute();

// 决策类：先看信息、再做判断（总览 → 气象 → 荐种）
const decisionTabs = [
  { path: '/production/overview', label: '生产总览', desc: '一眼看完今天该做什么', icon: Odometer },
  { path: '/production/weather', label: '气象与农事', desc: '逐日预报 · 风险预警 · AI 问答', icon: Sunny },
  { path: '/production/recommend', label: '智能荐种', desc: '四因子动态推荐指数', icon: MagicStick }
];

// 执行类：拿着结论去做动作（施肥 → 产量 → 对接）
const actionTabs = [
  { path: '/production/fertilize', label: '施肥打药', desc: '按生育期给用量与病害预警', icon: Goods },
  { path: '/production/yield', label: '产量预估', desc: '量价双预测与收益测算', icon: DataLine },
  { path: '/production/match', label: '产销对接', desc: '供需匹配 · AI 报价评估', icon: Van }
];

const isActive = (path: string) => route.path === path;
</script>

<style scoped>
.prod-hero {
  background:
    var(--hero-scrim),
    url('/images/bg-production.jpg') center 52% / cover no-repeat var(--brand-forest-mid);
}

/* 模块导航：杂志索引式的横向标签栏 —— 细线分隔 + 下划线激活，不用色块 */
.prod-nav {
  display: flex;
  align-items: stretch;
  gap: 0;
  flex-wrap: wrap;
  margin-bottom: var(--space-8);
  padding: 0;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--border-color);
  border-radius: 0;
  box-shadow: none;
}

.nav-group-label {
  align-self: center;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: var(--ls-label);
  color: var(--text-secondary);
  padding: 0 var(--space-3) 0 0;
  flex-shrink: 0;
}

.nav-group {
  display: flex;
  gap: 0;
  flex-wrap: wrap;
  align-items: stretch;
}

.prod-tab {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5) var(--space-4);
  border: none;
  border-radius: 0;
  background: transparent;
  text-decoration: none;
  transition: color 0.24s ease;
  flex: 0 1 auto;
  min-width: 0;
}

.prod-tab + .prod-tab {
  border-left: 1px solid var(--border-subtle);
}

/* 激活态：2px 深绿下划线，压在页签底线上 */
.prod-tab::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  background: var(--brand-forest);
  transform: scaleX(0);
  transform-origin: left center;
  transition: transform 0.42s cubic-bezier(0.22, 1, 0.36, 1);
}

.prod-tab:hover {
  background: transparent;
}

.prod-tab:hover .tab-label {
  color: var(--brand-forest);
}

.tab-icon {
  display: none; /* 页签只留文字，图标交给子页承担 */
}

.tab-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.35;
}

.tab-label {
  font-family: var(--font-serif);
  font-size: var(--fs-base);
  font-weight: var(--fw-medium);
  letter-spacing: 0.02em;
  color: var(--text-regular);
  white-space: nowrap;
  transition: color 0.24s ease;
}

.tab-desc {
  font-family: var(--font-sans);
  font-size: 11px;
  letter-spacing: 0.02em;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prod-tab.active::after,
.prod-tab[aria-current='page']::after {
  transform: scaleX(1);
}

.prod-tab.active .tab-label,
.prod-tab[aria-current='page'] .tab-label {
  color: var(--brand-forest);
  font-weight: var(--fw-semibold);
}

/* ≤1200：页签内边距收敛，避免六个页签挤成两行 */
@media (max-width: 1200px) {
  .prod-tab {
    padding: var(--space-3) var(--space-4) var(--space-4);
  }

  .tab-desc {
    max-width: 14ch;
  }
}

/* ≤992：两组各自铺满一行，说明文字隐藏，只留标题 */
@media (max-width: 992px) {
  .prod-nav {
    gap: var(--space-2) 0;
    margin-bottom: var(--space-6);
  }

  .nav-group {
    width: 100%;
  }

  .nav-group-label {
    width: 100%;
    padding: 0 0 var(--space-2) 0;
  }

  .prod-tab {
    flex: 1 1 auto;
    padding: var(--space-2) var(--space-3) var(--space-3);
    justify-content: center;
  }

  .tab-desc {
    display: none;
  }
}

/* ≤480：手机，两列页签 */
@media (max-width: 480px) {
  .prod-tab {
    flex: 1 1 calc(50% - 1px);
    padding: var(--space-2) var(--space-2) var(--space-3);
  }

  .tab-label {
    font-size: var(--fs-sm);
  }
}
</style>
