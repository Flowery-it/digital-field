<template>
  <PageShell>
    <!-- 模块横幅：与全站横幅同骨架 -->
    <section class="page-hero forum-hero" aria-label="农友论坛简介">
      <div class="page-hero-body">
        <p class="page-hero-kicker">农友交流 · 经验分享</p>
        <h1 class="page-hero-title">田间地头的经验，值得被记录下来</h1>
        <p class="page-hero-sub">提问种植问题、分享产量经验，也可以看看别人家的行情判断是怎么做的</p>
      </div>
    </section>

    <div class="forum-layout">
        <!-- 左侧：板块导航 + 统计 -->
        <aside class="forum-sidebar" aria-label="论坛板块导航">
          <el-card class="side-card" shadow="never">
            <template #header>
              <h2 class="side-title">论坛板块</h2>
            </template>
            <div class="board-list">
              <button
                v-for="b in boards"
                :key="b.value"
                type="button"
                class="board-item"
                :class="{ active: activeCategory === b.value, mine: b.value === 'mine' }"
                :aria-current="activeCategory === b.value ? 'true' : undefined"
                @click="switchCategory(b.value)"
              >
                <span class="board-name">{{ b.label }}</span>
                <span v-if="b.count !== null" class="board-count">{{ b.count }}</span>
              </button>
            </div>
          </el-card>

          <el-card class="side-card" shadow="never">
            <h2 class="side-title">论坛统计</h2>
            <div class="stat-row">
              <span>帖子总数</span>
              <b>{{ totalCount }}</b>
            </div>
            <div class="stat-row">
              <span>板块数量</span>
              <b>{{ POST_CATEGORIES.length }}</b>
            </div>
          </el-card>
        </aside>

        <!-- 右侧：工具栏 + 帖子列表 -->
        <section class="forum-content">
          <el-card class="toolbar-card" shadow="never">
            <div class="toolbar-row">
              <el-input
                v-model="keywordInput"
                class="search-input"
                placeholder="搜索标题或内容"
                clearable
                @keyup.enter="applySearch"
                @clear="applySearch"
              >
                <template #prefix>
                  <span class="search-icon" aria-hidden="true">🔍</span>
                </template>
              </el-input>
              <el-select v-model="sort" class="sort-select" @change="applySearch">
                <el-option label="最新发布" value="newest" />
                <el-option label="最早发布" value="oldest" />
              </el-select>
              <el-button type="primary" @click="openCreate">发布帖子</el-button>
            </div>
            <div class="toolbar-hint">
              当前范围：{{ currentScopeLabel }}
              <template v-if="keywordInput"> · 关键词「{{ keywordInput }}」</template>
            </div>
          </el-card>

          <!-- 首屏加载：骨架屏 -->
          <div v-if="loading && !posts.length" class="post-skeletons" aria-busy="true">
            <el-card v-for="n in 3" :key="'sk' + n" class="post-item skeleton-post" shadow="never">
              <div class="sk-line" style="width: 42%"></div>
              <div class="sk-line" style="width: 92%; margin-top: 12px"></div>
              <div class="sk-line" style="width: 68%; margin-top: 8px"></div>
              <div class="sk-line" style="width: 26%; margin-top: 12px"></div>
            </el-card>
          </div>

          <!-- 空态：区分「无帖子」与「筛选无结果」 -->
          <el-empty
            v-else-if="!posts.length"
            :image="'/images/empty-community.jpg'"
            :image-size="120"
            :description="keywordInput ? `没有找到与「${keywordInput}」相关的帖子` : '该板块还没有帖子，来发布第一条吧'"
          >
            <el-button type="primary" @click="openCreate">发布帖子</el-button>
          </el-empty>

          <!-- 帖子列表 -->
          <el-card v-for="post in posts" :key="post.id" class="post-item" shadow="never">
            <div class="post-row">
              <span
                class="avatar"
                :style="{ background: avatarColor(post.User?.username || '匿名') }"
                aria-hidden="true"
              >{{ (post.User?.username || '匿').charAt(0) }}</span>
              <div class="post-body">
                <div class="post-title-line">
                  <h3 class="post-title">{{ post.title }}</h3>
                  <span
                    class="cat-tag"
                    :style="{ color: catColor(post.category), borderColor: catColor(post.category) }"
                  >{{ post.category }}</span>
                </div>
                <p class="post-excerpt">{{ post.content }}</p>
                <div class="post-meta">
                  <span class="meta-author">{{ post.User?.username || '未知用户' }}</span>
                  <span class="meta-dot" aria-hidden="true">·</span>
                  <span class="meta-time">{{ formatRelativeTime(post.createTime) }}</span>
                  <!-- 仅作者本人或管理员可见编辑/删除 -->
                  <span v-if="canManage(post)" class="post-actions">
                    <el-button type="text" size="small" @click="openEdit(post)">编辑</el-button>
                    <el-button
                      type="text"
                      size="small"
                      danger
                      :disabled="deletingId === post.id"
                      @click="handleDelete(post)"
                    >
                      删除
                    </el-button>
                  </span>
                </div>
              </div>
            </div>
          </el-card>

          <!-- 分页 -->
          <div v-if="total > 0" class="pagination-container">
            <el-pagination
              v-model:current-page="currentPage"
              v-model:page-size="pageSize"
              :page-sizes="[5, 10, 20]"
              layout="total, sizes, prev, pager, next, jumper"
              :total="total"
              @size-change="handleSizeChange"
              @current-change="handleCurrentChange"
            />
          </div>
        </section>
      </div>

    <!-- 发帖 / 编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingPost ? '编辑帖子' : '发布帖子'"
      :width="dialogWidth"
    >
      <el-form
        ref="postFormRef"
        :model="form"
        :rules="rules"
        label-width="80px"
        @keyup.enter="handleSubmit"
      >
        <el-form-item label="标题" prop="title">
          <el-input v-model="form.title" placeholder="一句话说明你的问题或经验" maxlength="100" show-word-limit />
        </el-form-item>
        <el-form-item label="板块" prop="category">
          <el-select v-model="form.category" class="category-select">
            <el-option v-for="c in POST_CATEGORIES" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="内容" prop="content">
          <el-input
            v-model="form.content"
            type="textarea"
            placeholder="详细描述你的种植情况、遇到的问题或想分享的经验"
            rows="8"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="submitting" @click="handleSubmit">
            {{ editingPost ? '更新' : '发布' }}
          </el-button>
        </span>
      </template>
    </el-dialog>
  </PageShell>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageShell from '../components/PageShell.vue';
import { POST_CATEGORIES, usePostStore, type Post } from '../stores/postStore';
import { useUserStore } from '../stores/userStore';
import axiosInstance from '../utils/axios';
import { formatRelativeTime } from '../utils/formatTime';
import { useAuthGuard } from '../composables/useAuthGuard';
import { useViewportWidth } from '../composables/useViewportWidth';
import { chartCategorical } from '../composables/useChartTheme';

const route = useRoute();
const router = useRouter();
const postStore = usePostStore();
const userStore = useUserStore();
const guard = useAuthGuard();

const posts = computed(() => postStore.posts);
const total = computed(() => postStore.total);
const loading = computed(() => postStore.loading);

// ---------- 筛选状态：与 URL query 双向同步（可分享、刷新不丢失） ----------
// activeCategory：'all' 全部 / 'mine' 我的帖子 / 具体板块名
const activeCategory = ref('all');
const keywordInput = ref('');
const sort = ref<'newest' | 'oldest'>('newest');
const currentPage = ref(1);
const pageSize = ref(10);

const boardCounts = ref<Record<string, number>>({});
const totalCount = ref(0);

const boards = computed(() => [
  { value: 'all', label: '全部帖子', count: totalCount.value as number | null },
  { value: 'mine', label: '我的帖子', count: null as number | null },
  ...POST_CATEGORIES.map(c => ({ value: c, label: c, count: (boardCounts.value[c] ?? 0) as number | null }))
]);

const currentScopeLabel = computed(() => {
  if (activeCategory.value === 'all') return '全部板块';
  if (activeCategory.value === 'mine') return '我发布的帖子';
  return `板块「${activeCategory.value}」`;
});

// ---------- 数据加载 ----------
const loadList = async () => {
  await postStore.loadPosts({
    limit: pageSize.value,
    offset: (currentPage.value - 1) * pageSize.value,
    keyword: keywordInput.value.trim() || undefined,
    category: activeCategory.value === 'all' || activeCategory.value === 'mine' ? undefined : activeCategory.value,
    sort: sort.value,
    mine: activeCategory.value === 'mine'
  });
};

const loadBoards = async () => {
  try {
    const res: any = await axiosInstance.get('/post/categories');
    const list = res.data?.list || [];
    const map: Record<string, number> = {};
    list.forEach((item: any) => {
      if (item?.name) map[item.name] = item.count;
    });
    boardCounts.value = map;
    totalCount.value = res.data?.total ?? 0;
  } catch {
    /* 板块计数失败不阻塞帖子列表 */
  }
};

// 筛选变化 → 同步 URL（不带默认值，保持链接干净）
const syncQuery = () => {
  const query: Record<string, string> = {};
  if (activeCategory.value !== 'all') query.category = activeCategory.value;
  if (keywordInput.value.trim()) query.keyword = keywordInput.value.trim();
  if (sort.value !== 'newest') query.sort = sort.value;
  if (currentPage.value > 1) query.page = String(currentPage.value);
  router.replace({ query });
};

// URL 变化（含浏览器前进后退）→ 回填筛选条件并重载
watch(
  () => route.query,
  (q) => {
    const c = typeof q.category === 'string' ? q.category : 'all';
    const k = typeof q.keyword === 'string' ? q.keyword : '';
    const s = q.sort === 'oldest' ? 'oldest' : 'newest';
    const p = Number(q.page) > 0 ? Number(q.page) : 1;
    if (c === activeCategory.value && k === keywordInput.value && s === sort.value && p === currentPage.value) return;
    activeCategory.value = c;
    keywordInput.value = k;
    sort.value = s;
    currentPage.value = p;
    loadList();
  },
  { immediate: true }
);

// 关键词输入防抖 300ms，避免每敲一个字都请求一次
let searchTimer: number | undefined;
watch(keywordInput, () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    currentPage.value = 1;
    loadList();
    syncQuery();
  }, 300);
});

const applySearch = () => {
  window.clearTimeout(searchTimer);
  currentPage.value = 1;
  loadList();
  syncQuery();
};

const switchCategory = (value: string) => {
  if (activeCategory.value === value) return;
  activeCategory.value = value;
  currentPage.value = 1;
  loadList();
  syncQuery();
};

const handleCurrentChange = (current: number) => {
  currentPage.value = current;
  loadList();
  syncQuery();
};

const handleSizeChange = (size: number) => {
  pageSize.value = size;
  currentPage.value = 1;
  loadList();
  syncQuery();
};

// ---------- 发帖 / 编辑 / 删除 ----------
const dialogVisible = ref(false);
const editingPost = ref<Post | null>(null);
const submitting = ref(false);
const deletingId = ref<number | null>(null);
const postFormRef = ref();

const form = reactive({ title: '', category: '综合讨论', content: '' });

const rules = {
  title: [{ required: true, message: '请输入标题', trigger: 'blur' }],
  content: [{ required: true, message: '请输入内容', trigger: 'blur' }]
};

// 仅作者本人或管理员可编辑/删除
const canManage = (post: Post) =>
  post.User?.username === userStore.username || userStore.isAdmin;

const openCreate = () => {
  editingPost.value = null;
  form.title = '';
  form.category = '综合讨论';
  form.content = '';
  dialogVisible.value = true;
};

const openEdit = (post: Post) => {
  editingPost.value = post;
  form.title = post.title;
  form.category = post.category || '综合讨论';
  form.content = post.content;
  dialogVisible.value = true;
};

const handleSubmit = async (event?: Event) => {
  // 内容多行输入框内的回车用于换行，不触发提交
  if (event && (event.target as HTMLElement | null)?.tagName === 'TEXTAREA') return;
  if (!postFormRef.value) return;

  try {
    await postFormRef.value.validate();
    submitting.value = true;

    if (editingPost.value) {
      const result = await postStore.updatePost(
        editingPost.value.id,
        form.title,
        form.content,
        form.category
      );
      if (result.success) {
        ElMessage.success('帖子更新成功');
        dialogVisible.value = false;
        loadBoards();
      } else {
        ElMessage.error(result.message);
      }
    } else {
      const result = await postStore.addPost(form.title, form.content, form.category);
      if (result.success) {
        ElMessage.success('帖子发布成功');
        dialogVisible.value = false;
        currentPage.value = 1;
        loadList();
        loadBoards();
      } else {
        ElMessage.error(result.message);
      }
    }
  } catch {
    /* 表单校验失败，不执行提交 */
  } finally {
    submitting.value = false;
  }
};

// 删除：先二次确认，确认后禁用按钮防重复触发
const handleDelete = async (post: Post) => {
  if (deletingId.value === post.id) return;
  try {
    await ElMessageBox.confirm(
      `确定删除帖子「${post.title}」吗？删除后不可恢复。`,
      '删除帖子',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    );
  } catch {
    // 用户取消，不执行删除
    return;
  }

  deletingId.value = post.id;
  try {
    const result = await postStore.deletePost(post.id);
    if (result.success) {
      ElMessage.success('帖子删除成功');
      loadBoards();
    } else {
      ElMessage.error(result.message);
    }
  } finally {
    deletingId.value = null;
  }
};

// ---------- 展示辅助 ----------
// 板块标签配色：取图表分类色板（与全站色板同源，JS 内不能读 CSS 变量）
const CATEGORY_KEYS = ['种植技术', '病虫害防治', '市场行情', '政策资讯', '综合讨论'] as const;
const CATEGORY_COLORS: Record<string, string> = Object.fromEntries(
  CATEGORY_KEYS.map((k, i) => [k, chartCategorical(i)])
);
const catColor = (category: string) => CATEGORY_COLORS[category] ?? chartCategorical(7);

// 头像底色按用户名稳定散列；色值取图表分类色板（JS 内读不到 CSS 变量）
const avatarColor = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 9973;
  return chartCategorical(hash);
};

// 弹窗宽度：小屏改用百分比，避免固定宽度溢出（resize 监听由 useViewportWidth 统一管理）
const viewportWidth = useViewportWidth();
const dialogWidth = computed(() => (viewportWidth.value <= 640 ? '92%' : '600px'));

onMounted(() => {
  if (!guard()) return;
  loadBoards();
});

// 卸载时清理防抖定时器
onUnmounted(() => {
  window.clearTimeout(searchTimer);
});
</script>

<style scoped>
/* ---- 模块横幅：骨架来自全局 .page-hero-* ，此处只换背景图 ---- */
.forum-hero {
  background:
    var(--hero-scrim),
    url('/images/bg-forum.jpg') center 50% / cover no-repeat var(--surface-soft);
}

.forum-layout {
  display: flex;
  align-items: flex-start;
  gap: var(--space-5);
}

/* ---------- 左侧板块栏 ---------- */
.forum-sidebar {
  width: 220px;
  flex-shrink: 0;
  position: sticky;
  top: calc(var(--header-h) + var(--space-5));
}

.side-card {
  margin-bottom: var(--space-4);
}

.side-card :deep(.el-card__body) {
  padding: 14px 16px;
}

.side-title {
  font-size: var(--fs-md);
  font-weight: 700;
  color: var(--text-primary);
}

.board-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.board-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-regular);
  font-size: var(--fs-md);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.2s, color 0.2s;
}

.board-item:hover {
  background: var(--el-color-primary-light-9, #E8EFFF);
  color: var(--brand-blue);
}

.board-item.active {
  background: var(--el-color-primary-light-9, #E8EFFF);
  color: var(--brand-blue);
  font-weight: var(--fw-semibold);
}

.board-item.mine .board-name::before {
  content: '👤 ';
}

.board-count {
  flex-shrink: 0;
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  background: var(--background-color);
  border-radius: 10px;
  padding: 1px 8px;
}

.board-item.active .board-count {
  background: var(--card-background);
  color: var(--brand-blue);
}

.stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  font-size: var(--fs-md);
  color: var(--text-regular);
  border-bottom: 1px dashed var(--border-color);
}

.stat-row:last-child {
  border-bottom: none;
}

.stat-row b {
  color: var(--brand-blue);
  font-size: var(--fs-lg);
}

/* ---------- 右侧主区 ---------- */
.forum-content {
  flex: 1;
  min-width: 0;
}

.toolbar-card {
  margin-bottom: var(--space-4);
}

.toolbar-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.search-input {
  flex: 1;
  min-width: 200px;
}

.sort-select {
  width: 130px;
}

.search-icon {
  font-size: 13px;
  line-height: 1;
}

.toolbar-hint {
  margin-top: 10px;
  font-size: var(--fs-xs);
  color: var(--text-secondary);
}

/* ---------- 帖子卡片 ---------- */
.post-item {
  margin-bottom: 12px;
}

.post-row {
  display: flex;
  gap: 14px;
}

.avatar {
  flex-shrink: 0;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: var(--fs-lg);
  font-weight: 700;
}

.post-body {
  flex: 1;
  min-width: 0;
}

.post-title-line {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.post-title {
  margin: 0;
  font-size: var(--fs-lg);
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.4;
}

.cat-tag {
  flex-shrink: 0;
  font-size: var(--fs-xs);
  border: 1px solid;
  border-radius: 10px;
  padding: 1px 8px;
  line-height: 1.5;
}

.post-excerpt {
  margin: 8px 0 0;
  font-size: var(--fs-md);
  color: var(--text-regular);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  word-break: break-word;
}

.post-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  font-size: var(--fs-xs);
  color: var(--text-secondary);
}

.meta-author {
  font-weight: var(--fw-semibold);
  color: var(--text-regular);
}

.post-actions {
  margin-left: auto;
  display: flex;
  gap: 4px;
}

/* ---------- 骨架屏 ---------- */
.skeleton-post {
  cursor: default;
}

/* ---------- 分页 ---------- */
.pagination-container {
  display: flex;
  justify-content: center;
  margin-top: 16px;
}

/* 移动端：板块栏改为横向滚动 chips，帖子卡片紧凑 */
@media (max-width: 992px) {
  .forum-layout {
    flex-direction: column;
  }

  .forum-sidebar {
    width: 100%;
    position: static;
  }

  .board-list {
    flex-direction: row;
    overflow-x: auto;
    gap: 8px;
    padding-bottom: 4px;
  }

  .board-item {
    flex-shrink: 0;
    white-space: nowrap;
    border: 1px solid var(--border-color);
  }
}

@media (max-width: 768px) {
  .pagination-container :deep(.el-pagination__total),
  .pagination-container :deep(.el-pagination__sizes),
  .pagination-container :deep(.el-pagination__jumper) {
    display: none;
  }
}

/* 触屏设备：操作按钮触控热区 ≥40px */
@media (pointer: coarse) {
  .post-actions .el-button {
    min-height: 40px;
  }
}
</style>
