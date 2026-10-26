<template>
  <div class="app-header-wrap">
    <a href="#main-content" class="skip-link">跳到主内容</a>
    <el-header class="app-header">
      <div class="header-left">
        <router-link :to="homePath" class="brand">
          <img class="brand-logo" src="/images/favicon-48.png" alt="" width="32" height="32" />
          <span class="brand-text">
            <span class="brand-name">数字田野</span>
            <span class="brand-slogan">农产品价格与气象服务</span>
          </span>
        </router-link>
      </div>

      <!-- 主导航：桌面横排，中屏收进抽屉 -->
      <nav class="header-nav" aria-label="主导航">
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="nav-link"
          :class="{ 'is-admin': item.admin }"
        >
          <el-icon class="nav-icon" aria-hidden="true"><component :is="item.icon" /></el-icon>
          <span class="nav-label">{{ item.label }}</span>
        </router-link>
      </nav>

      <!-- 全局搜索：品种 / 市场，Enter 直达，快捷键 / 聚焦 -->
      <el-autocomplete
        ref="searchRef"
        v-model="searchKeyword"
        class="global-search"
        size="small"
        placeholder="搜索品种 / 市场"
        :fetch-suggestions="searchSuggestions"
        value-key="name"
        clearable
        @select="handleSearchSelect"
      >
        <template #default="{ item }">
          <span class="gs-name">{{ item.name }}</span>
          <span class="gs-kind">{{ item.kind }}</span>
        </template>
      </el-autocomplete>

      <div class="header-right">
        <!-- 用户区：头像 + 昵称，退出收进下拉，减少页头横向占用 -->
        <el-dropdown trigger="click" @command="handleUserCommand">
          <button type="button" class="user-trigger">
            <span class="user-avatar" aria-hidden="true">{{ avatarChar }}</span>
            <span class="user-name">{{ userStore.username || '访客' }}</span>
            <el-icon class="user-caret" aria-hidden="true"><ArrowDown /></el-icon>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item disabled>
                {{ userStore.isAdmin ? '管理员' : '普通用户' }} · {{ userStore.username }}
              </el-dropdown-item>
              <el-dropdown-item command="home">返回首页</el-dropdown-item>
              <el-dropdown-item v-if="userStore.isAdmin" command="admin">
                进入管理后台
              </el-dropdown-item>
              <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>

        <el-button
          class="nav-toggle"
          size="small"
          :aria-label="drawer ? '关闭导航菜单' : '打开导航菜单'"
          @click="drawer = !drawer"
        >
          <el-icon aria-hidden="true"><Fold /></el-icon>
        </el-button>
      </div>

      <!-- 移动端导航抽屉 -->
      <el-drawer v-model="drawer" title="导航" direction="rtl" size="auto" :with-header="true">
        <nav class="drawer-nav" aria-label="主导航（移动端）">
          <router-link
            v-for="item in navItems"
            :key="item.path"
            :to="item.path"
            class="drawer-link"
            @click="drawer = false"
          >
            <el-icon class="drawer-icon" aria-hidden="true"><component :is="item.icon" /></el-icon>
            <span class="drawer-text">
              <span class="drawer-label">{{ item.label }}</span>
              <span class="drawer-desc">{{ item.desc }}</span>
            </span>
          </router-link>
        </nav>
      </el-drawer>
    </el-header>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import type { Component } from 'vue';
import {
  ArrowDown,
  ChatDotRound,
  Fold,
  HomeFilled,
  OfficeBuilding,
  Sunny
} from '@element-plus/icons-vue';
import { useUserStore } from '../stores/userStore';
import axiosInstance from '../utils/axios';

const router = useRouter();
const userStore = useUserStore();
const drawer = ref(false);

const homePath = computed(() => (userStore.isAdmin ? '/admin/home' : '/home'));

// 头像字符：用户名首字母，中文取首字
const avatarChar = computed(() => (userStore.username || '访客').charAt(0).toUpperCase());

// 导航项：图标 + 描述（描述用于移动端抽屉，桌面端只显图标与文字）
interface NavItem {
  path: string;
  label: string;
  desc: string;
  icon: Component;
  admin?: boolean;
}

const navItems = computed<NavItem[]>(() => {
  const items: NavItem[] = [
    { path: '/home', label: '首页', desc: '行情总览与平台能力', icon: HomeFilled },
    { path: '/production', label: '气象生产', desc: '气象 · 荐种 · 施肥 · 产量 · 对接', icon: Sunny },
    { path: '/my-focus', label: '我的关注', desc: '农场档案 · 关注看板 · 收益台账', icon: OfficeBuilding },
    { path: '/forum', label: '论坛', desc: '农友交流与经验分享', icon: ChatDotRound }
  ];
  if (userStore.isAdmin) {
    items.push({ path: '/admin/home', label: '管理后台', desc: '用户 / 作物 / 帖子管理', icon: OfficeBuilding, admin: true });
  }
  return items;
});

// ---------- 全局搜索（品种 + 市场，首次聚焦时懒加载索引） ----------
interface SearchItem {
  name: string;
  kind: string;
  path: string;
}

const searchRef = ref<any>(null);
const searchKeyword = ref('');
const searchIndex = ref<SearchItem[]>([]);
const searchIndexLoaded = ref(false);

const loadSearchIndex = async () => {
  if (searchIndexLoaded.value) return;
  try {
    const [productsRes, marketsRes]: any[] = await Promise.all([
      axiosInstance.get('/price/products'),
      axiosInstance.get('/price/markets')
    ]);
    const products: SearchItem[] = (productsRes.data?.products || []).map((x: any) => ({
      name: x.name,
      kind: '品种',
      path: `/price/${x.productId}`
    }));
    const markets: SearchItem[] = (marketsRes.data || []).map((x: any) => ({
      name: x.name,
      kind: '市场',
      path: `/market/${x.marketId}`
    }));
    searchIndex.value = [...products, ...markets];
    searchIndexLoaded.value = true;
  } catch {
    /* 索引加载失败时静默，不影响其他功能 */
  }
};

const searchSuggestions = (query: string, cb: (list: SearchItem[]) => void) => {
  loadSearchIndex();
  const q = query.trim();
  if (!q) {
    cb([]);
    return;
  }
  cb(searchIndex.value.filter(x => x.name.includes(q)).slice(0, 8));
};

const handleSearchSelect = (item: SearchItem) => {
  if (item?.path) router.push(item.path);
  searchKeyword.value = '';
};

// 快捷键「/」聚焦搜索框（输入框内不拦截）
const onGlobalKeydown = (e: KeyboardEvent) => {
  const tag = (e.target as HTMLElement | null)?.tagName;
  if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
    e.preventDefault();
    searchRef.value?.focus();
  }
};
onMounted(() => window.addEventListener('keydown', onGlobalKeydown));
onUnmounted(() => window.removeEventListener('keydown', onGlobalKeydown));

const handleUserCommand = (cmd: string) => {
  if (cmd === 'logout') {
    userStore.logout();
    ElMessage.success('退出登录成功');
    router.push('/login');
  } else if (cmd === 'admin') {
    router.push('/admin/home');
  } else if (cmd === 'home') {
    router.push('/home');
  }
};
</script>

<style scoped>
/* 页头：纸面浅底 + 1px 细线 + 文字下划线激活态（不用实心色块导航） */
.app-header-wrap {
  position: sticky;
  top: 0;
  z-index: 100;
}

/* 键盘用户跳过重复页头 */
.skip-link {
  position: absolute;
  top: -52px;
  left: 16px;
  z-index: 10;
  padding: var(--space-2) var(--space-4);
  background: var(--brand-forest);
  color: var(--text-inverse);
  border-radius: 0 0 var(--radius-md) var(--radius-md);
  font-size: var(--fs-sm);
  letter-spacing: 0.06em;
  text-decoration: none;
  transition: top 0.24s ease;
}

.skip-link:focus {
  top: 0;
}

.app-header {
  /* 纸面导航：比页面底浅一档，顶部一道苔藓绿细线收口 */
  background: var(--surface-header);
  color: var(--text-primary);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-6);
  padding: 0 clamp(16px, 3.4vw, 72px);
  height: var(--header-h);
  border-top: 2px solid var(--brand-moss);
  border-bottom: 1px solid var(--border-color);
  box-shadow: none;
}

.header-left {
  display: flex;
  align-items: center;
  /* 品牌区永不压缩：标题在任何管理员/访客场景下都完整显示 */
  flex-shrink: 0;
}

.brand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--text-primary);
  text-decoration: none;
  flex-shrink: 0;
}

.brand-logo {
  width: 34px;
  height: 34px;
  border-radius: var(--radius-xs);
  flex-shrink: 0;
}

.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
  gap: 2px;
}

.brand-name {
  font-family: var(--font-serif);
  font-size: 19px;
  font-weight: var(--fw-medium);
  letter-spacing: 0.08em;
  color: var(--brand-forest);
  white-space: nowrap;
}

/* 副标语：等宽小字宽字距，像仪器铭牌 */
.brand-slogan {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--text-secondary);
  white-space: nowrap;
}

.header-nav {
  display: flex;
  align-items: center;
  gap: 0;
  flex: 1;
  justify-content: center;
  height: 100%;
}

/* 导航项：纯文字，激活态为 1px 下划线，与页头细线呼应 */
.nav-link {
  position: relative;
  display: inline-flex;
  align-items: center;
  height: 100%;
  margin: 0 clamp(8px, 1.2vw, 18px);
  padding: 0;
  border-radius: 0;
  color: var(--text-regular);
  font-family: var(--font-sans);
  font-size: var(--fs-md);
  letter-spacing: 0.04em;
  text-decoration: none;
  white-space: nowrap;
  transition: color 0.24s ease;
}

.nav-link::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 1px;
  background: var(--brand-forest);
  transform: scaleX(0);
  transform-origin: left center;
  transition: transform 0.42s cubic-bezier(0.22, 1, 0.36, 1);
}

.nav-icon {
  display: none; /* 桌面导航只留文字，减少图标噪音 */
}

.nav-link:hover {
  background: none;
  color: var(--brand-forest);
}

.nav-link:hover::after {
  transform: scaleX(1);
}

/* Vue Router 会自动为激活链接设置 aria-current="page" */
.nav-link.active,
.nav-link[aria-current='page'] {
  background: none;
  color: var(--brand-forest);
  font-weight: var(--fw-medium);
}

.nav-link.active::after,
.nav-link[aria-current='page']::after {
  transform: scaleX(1);
}

/* 管理后台入口：与主导航用细竖线分开 */
.nav-link.is-admin {
  color: var(--text-secondary);
}

.nav-link.is-admin::before {
  content: '';
  width: 1px;
  height: 12px;
  margin-right: 14px;
  background: var(--border-strong);
}

.header-right {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-shrink: 0;
}

/* 用户触发器：细线方框，不用胶囊 */
.user-trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: 5px 10px 5px 5px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-regular);
  font-family: var(--font-sans);
  font-size: var(--fs-sm);
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: border-color 0.24s ease, color 0.24s ease, background-color 0.24s ease;
}

.user-trigger:hover {
  background: var(--card-background);
  border-color: var(--brand-forest);
  color: var(--brand-forest);
}

.user-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-xs);
  background: var(--brand-forest);
  color: var(--text-inverse);
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  flex-shrink: 0;
}

.user-name {
  max-width: 96px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-caret {
  font-size: 11px;
  opacity: 0.7;
}

/* 全局搜索：细线描边输入框，与页头同一纸面基调。
   el-autocomplete 的根节点不带 scope id（多根组件），
   故必须走 :deep()，否则宽度与断点隐藏全部失效 */
:deep(.global-search) {
  width: 200px;
  flex-shrink: 0;
}

:deep(.global-search .el-input__wrapper) {
  background: transparent;
  box-shadow: 0 0 0 1px var(--border-strong) inset;
  border-radius: var(--radius-sm);
  padding: 1px 10px;
}

:deep(.global-search .el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px var(--brand-forest) inset;
}

:deep(.global-search .el-input__wrapper.is-focus) {
  background: var(--card-background);
  box-shadow: 0 0 0 1px var(--brand-forest) inset;
}

:deep(.global-search .el-input__inner) {
  font-family: var(--font-sans);
  font-size: var(--fs-sm);
  color: var(--text-regular);
}

:deep(.global-search .el-input__inner::placeholder) {
  color: var(--text-secondary);
}

.gs-name {
  font-family: var(--font-sans);
  font-size: var(--fs-md);
  color: var(--text-primary);
}

.gs-kind {
  float: right;
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  letter-spacing: 0.08em;
  color: var(--text-secondary);
}

.nav-toggle {
  display: none;
  background: transparent;
  border: 1px solid var(--border-strong);
  color: var(--brand-forest);
  border-radius: var(--radius-sm);
}

.nav-toggle:hover {
  background: var(--brand-soft);
  border-color: var(--brand-forest);
  color: var(--brand-forest);
}

/* 抽屉导航：图标 + 文字 + 说明 */
.drawer-nav {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.drawer-link {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-sm);
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-regular);
  text-decoration: none;
  transition: background-color 0.24s ease, color 0.24s ease;
}

.drawer-icon {
  font-size: 17px;
  color: var(--brand-moss);
  flex-shrink: 0;
}

.drawer-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.drawer-label {
  font-family: var(--font-serif);
  font-size: var(--fs-base);
  font-weight: var(--fw-medium);
}

.drawer-desc {
  font-family: var(--font-sans);
  font-size: var(--fs-xs);
  color: var(--text-secondary);
}

.drawer-link:hover,
.drawer-link.active,
.drawer-link[aria-current='page'] {
  background: var(--brand-soft);
  color: var(--brand-forest);
}

.drawer-link.active .drawer-label,
.drawer-link[aria-current='page'] .drawer-label {
  font-weight: var(--fw-semibold);
}

/* ≤1200：隐藏搜索与副标语，把空间让给导航 */
@media (max-width: 1200px) {
  :deep(.global-search) {
    display: none;
  }

  .brand-slogan {
    display: none;
  }

  .nav-link {
    margin: 0 10px;
  }
}

/* ≤992：导航收进抽屉 */
@media (max-width: 992px) {
  .header-nav {
    display: none;
  }

  .nav-toggle {
    display: inline-flex;
  }

  .header-left {
    flex: 1;
  }
}

/* ≤768：页头只留品牌与菜单按钮，用户昵称收进头像 */
@media (max-width: 768px) {
  .app-header {
    padding: 0 var(--space-4);
    gap: var(--space-3);
  }

  .brand-logo {
    width: 30px;
    height: 30px;
  }

  .brand-name {
    font-size: var(--fs-lg);
  }

  .user-name {
    display: none;
  }

  .user-trigger {
    padding: 4px;
    border-color: transparent;
  }
}

/* ≤480：手机，进一步压缩 */
@media (max-width: 480px) {
  .app-header {
    padding: 0 var(--space-3);
  }

  .brand {
    gap: var(--space-2);
  }

  .brand-name {
    font-size: var(--fs-base);
    letter-spacing: 0.04em;
  }
}
</style>
