<template>
  <div class="post-interaction">
    <div class="post-header">
      <el-button type="primary" @click="dialogVisible = true">发布帖子</el-button>
    </div>

    <!-- 空态：无帖子时引导发布第一条 -->
    <el-empty
      v-if="!postList.length && !postStore.loading"
      image="/images/empty-community.jpg"
      :image-size="140"
      description="还没有帖子，来发布第一条吧"
    >
      <el-button type="primary" @click="dialogVisible = true">发布帖子</el-button>
    </el-empty>

    <!-- 首屏加载：骨架屏 -->
    <div v-if="postStore.loading && !postList.length" class="post-skeletons" aria-busy="true">
      <el-card v-for="n in 3" :key="'sk' + n" class="post-card skeleton-post">
        <div class="sk-line" style="width: 45%"></div>
        <div class="sk-line" style="width: 90%; margin-top: 12px"></div>
        <div class="sk-line" style="width: 76%; margin-top: 8px"></div>
        <div class="sk-line" style="width: 30%; margin-top: 12px"></div>
      </el-card>
    </div>

    <!-- 帖子列表 -->
    <el-card v-for="post in postList" :key="post.id" class="post-card">
      <template #header>
        <div class="card-header">
          <h3 class="post-title">{{ post.title }}</h3>
          <span class="post-author">{{ post.User?.username || '未知用户' }}</span>
        </div>
      </template>
      <div class="card-body">
        <p
          class="post-content"
          :class="{ clamped: !isExpanded(post.id) }"
          :data-post-id="post.id"
        >{{ post.content }}</p>
        <el-button
          v-if="isOverflowed(post.id)"
          class="expand-toggle"
          type="primary"
          link
          @click="toggleExpand(post.id)"
        >
          {{ isExpanded(post.id) ? '收起' : '展开' }}
        </el-button>
        <div class="post-footer">
          <span class="post-time">{{ formatTime(post.createTime) }}</span>
          <!-- 仅作者本人或管理员可见编辑/删除 -->
          <div class="post-actions" v-if="canManage(post)">
            <el-button type="text" size="small" @click="handleEdit(post)">
              编辑
            </el-button>
            <el-button
              type="text"
              size="small"
              danger
              :disabled="deletingId === post.id"
              @click="handleDelete(post)"
            >
              删除
            </el-button>
          </div>
        </div>
      </div>
    </el-card>

    <!-- 分页 -->
    <div class="pagination-container" v-if="total > 0">
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

    <!-- 帖子编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingPost ? '编辑帖子' : '发布帖子'"
      :width="dialogWidth"
    >
      <el-form
        ref="postFormRef"
        :model="postForm"
        :rules="postRules"
        label-width="80px"
        @keyup.enter="handleSubmit"
      >
        <el-form-item label="标题" prop="title">
          <el-input v-model="postForm.title" placeholder="请输入帖子标题" />
        </el-form-item>
        <el-form-item label="内容" prop="content">
          <el-input
            v-model="postForm.content"
            type="textarea"
            placeholder="请输入帖子内容"
            rows="6"
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
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { usePostStore } from '../stores/postStore';
import { useUserStore } from '../stores/userStore';

// limit：首页嵌入时传较小值只展示最近几条，论坛页不传则用默认 10
const props = withDefaults(defineProps<{ limit?: number }>(), { limit: 10 });

const dialogVisible = ref(false);
const editingPost = ref<any>(null);
const currentPage = ref(1);
const pageSize = ref(props.limit);
const postFormRef = ref();
// 提交中：防止重复点击发布/更新；删除中：防止确认后重复触发
const submitting = ref(false);
const deletingId = ref<number | null>(null);

const postStore = usePostStore();
const userStore = useUserStore();
const postList = computed(() => postStore.posts);
const total = computed(() => postStore.total);

// 视口宽度：resize 时同步，驱动弹窗宽度 computed 重新求值
const viewportWidth = ref(window.innerWidth);

// 弹窗宽度：小屏改用百分比，避免固定 600px 溢出屏幕
const dialogWidth = computed(() => (viewportWidth.value <= 640 ? '92%' : '600px'));

// 仅作者本人或管理员可编辑/删除
const canManage = (post: any) =>
  post.User?.username === userStore.username || userStore.isAdmin;

const postForm = ref({
  title: '',
  content: ''
});

const postRules = ref({
  title: [{ required: true, message: '请输入标题', trigger: 'blur' }],
  content: [{ required: true, message: '请输入内容', trigger: 'blur' }]
});

// 加载帖子列表
const loadPostList = async () => {
  await postStore.loadPosts({
    limit: pageSize.value,
    offset: (currentPage.value - 1) * pageSize.value
  });
};

// 处理发布/更新帖子
const handleSubmit = async (event?: Event) => {
  // 内容多行输入框内的回车用于换行，不触发提交
  if (event && (event.target as HTMLElement | null)?.tagName === 'TEXTAREA') return;
  if (!postFormRef.value) return;

  try {
    await postFormRef.value.validate();
    submitting.value = true;

    if (editingPost.value) {
      // 更新帖子
      const result = await postStore.updatePost(
        editingPost.value.id,
        postForm.value.title,
        postForm.value.content
      );
      if (result.success) {
        ElMessage.success('帖子更新成功');
      } else {
        ElMessage.error(result.message);
      }
    } else {
      // 发布新帖子
      const result = await postStore.addPost(
        postForm.value.title,
        postForm.value.content
      );
      if (result.success) {
        ElMessage.success('帖子发布成功');
      } else {
        ElMessage.error('帖子发布失败');
      }
    }

    dialogVisible.value = false;
    resetForm();
  } catch (error) {
    console.error('提交帖子失败:', error);
  } finally {
    submitting.value = false;
  }
};

// 处理编辑帖子
const handleEdit = (post: any) => {
  editingPost.value = post;
  postForm.value = {
    title: post.title,
    content: post.content
  };
  dialogVisible.value = true;
};

// 处理删除帖子：先二次确认，确认后禁用按钮防重复触发
const handleDelete = async (post: any) => {
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
    } else {
      ElMessage.error('帖子删除失败');
    }
  } catch (error) {
    console.error('删除帖子失败:', error);
  } finally {
    deletingId.value = null;
  }
};

// 分页处理
const handleSizeChange = (size: number) => {
  pageSize.value = size;
  currentPage.value = 1;
  loadPostList();
};

const handleCurrentChange = (current: number) => {
  currentPage.value = current;
  loadPostList();
};

// 重置表单
const resetForm = () => {
  postForm.value = {
    title: '',
    content: ''
  };
  editingPost.value = null;
};

// 相对时间：<1小时「刚刚」、<24小时「N 小时前」、<7天「N 天前」，更早显示绝对时间
const formatTime = (time: any) => {
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return '—';
  const diff = Date.now() - date.getTime();
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  if (diff < HOUR) return '刚刚';
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} 天前`;
  return date.toLocaleString();
};

// ---- 长内容展开/收起 ----
const expandedIds = ref<Set<number>>(new Set());
const overflowIds = ref<Set<number>>(new Set());

const isExpanded = (id: number) => expandedIds.value.has(id);
const isOverflowed = (id: number) => overflowIds.value.has(id);

const toggleExpand = (id: number) => {
  const next = new Set(expandedIds.value);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  expandedIds.value = next;
};

// 测量哪些帖子内容被 4 行截断，仅对截断的帖子显示「展开」
const measureOverflow = () => {
  const next = new Set<number>();
  document.querySelectorAll('.post-content[data-post-id]').forEach((el) => {
    const id = Number(el.getAttribute('data-post-id'));
    if (Number.isNaN(id)) return;
    // 已展开过的帖子保持显示「收起」入口
    if (expandedIds.value.has(id)) {
      next.add(id);
      return;
    }
    if (el.scrollHeight > el.clientHeight + 1) next.add(id);
  });
  overflowIds.value = next;
};

let resizeTimer: number | undefined;
const onResize = () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    viewportWidth.value = window.innerWidth;
    measureOverflow();
  }, 150);
};

// 列表变化（首次加载 / 翻页 / 增删）后重新测量截断情况
watch(postList, async () => {
  await nextTick();
  measureOverflow();
});

// 生命周期
onMounted(() => {
  loadPostList();
  window.addEventListener('resize', onResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', onResize);
  window.clearTimeout(resizeTimer);
});
</script>

<style scoped>
.post-interaction {
  width: 100%;
  height: 100%;
}

.post-header {
  margin-bottom: var(--space-5);
  display: flex;
  justify-content: flex-end;
}

/* 帖子为内容卡：不加 hover 抬升与额外阴影，圆角/阴影统一由全局 .el-card 提供 */
.post-card {
  margin-bottom: var(--space-block);
}

/* 骨架屏（帖子列表首屏加载） */
.post-skeletons .skeleton-post {
  cursor: default;
}

@media (prefers-reduced-motion: reduce) {
  .sk-line {
    animation: none;
  }
}

.post-title {
  font-size: var(--fs-lg);
  font-weight: 700;
}

.post-author {
  font-size: var(--fs-md);
  color: var(--text-regular);
}

.post-content {
  margin: var(--space-2) 0;
  line-height: 1.6;
}

/* 长内容默认折叠 4 行 */
.post-content.clamped {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  overflow: hidden;
}

.post-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: var(--space-5);
  padding-top: var(--space-2);
  border-top: 1px solid var(--border-color);
}

.post-time {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
}

/* 本页分页居中（margin/display 继承全局 .pagination-container，此处仅覆盖右对齐） */
.pagination-container {
  justify-content: center;
}

/* 移动端：分页仅保留上一页 / 页码 / 下一页 */
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
