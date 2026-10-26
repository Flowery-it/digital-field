<template>
  <AdminShell>
    <el-card class="admin-card">
      <template #header>
        <div class="card-header">
          <span>帖子管理</span>
        </div>
      </template>
          <div class="post-manage-content">
            <!-- 搜索和筛选 -->
            <div class="search-container">
              <el-input
                v-model="searchForm.title"
                placeholder="请输入帖子标题"
                prefix-icon="Search"
                class="search-input"
              />
              <el-input
                v-model="searchForm.username"
                placeholder="请输入用户名"
                prefix-icon="User"
                class="search-input"
              />
              <el-button type="primary" @click="handleSearch">搜索</el-button>
              <el-button @click="resetSearch">重置</el-button>
            </div>

            <!-- 帖子列表 -->
            <el-table
              v-loading="loading"
              :data="postList"
              style="width: 100%"
              border
            >
              <el-table-column prop="id" label="帖子ID" width="80" />
              <el-table-column prop="title" label="标题" min-width="200" />
              <el-table-column prop="User.username" label="用户名" width="120" />
              <el-table-column prop="createTime" label="创建时间" width="200" />
              <el-table-column prop="updateTime" label="更新时间" width="200" />
              <el-table-column label="操作" width="150">
                <template #default="scope">
                  <el-button type="danger" size="small" @click="handleDelete(scope.row.id)">
                    删除
                  </el-button>
                </template>
              </el-table-column>
            </el-table>

            <!-- 分页 -->
            <div class="pagination-container">
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
          </div>
        </el-card>
  </AdminShell>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { usePostStore } from '../../stores/postStore';
import { ElMessage } from 'element-plus';
import AdminShell from '../../components/AdminShell.vue';
import { useAdminGuard } from '../../composables/useAdminGuard';

const adminGuard = useAdminGuard();
const postStore = usePostStore();

const currentPage = ref(1);
const pageSize = ref(10);

const searchForm = ref({
  title: '',
  username: ''
});

const loading = computed(() => postStore.loading);
const postList = computed(() => postStore.posts);
const total = computed(() => postStore.total);

// 加载帖子列表
const loadPostList = async () => {
  await postStore.loadPosts({
    limit: pageSize.value,
    offset: (currentPage.value - 1) * pageSize.value
  });
};

// 处理删除帖子
const handleDelete = async (id: number) => {
  try {
    const result = await postStore.deletePost(id);
    if (result.success) {
      ElMessage.success('帖子删除成功');
    } else {
      ElMessage.error('帖子删除失败');
    }
  } catch (error) {
    console.error('删除帖子失败:', error);
  }
};

// 搜索处理
const handleSearch = () => {
  currentPage.value = 1;
  loadPostList();
};

// 重置搜索
const resetSearch = () => {
  searchForm.value = {
    title: '',
    username: ''
  };
  currentPage.value = 1;
  loadPostList();
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

onMounted(() => {
  // 管理端守卫：未登录或非管理员回落管理员登录页
  if (!adminGuard()) return;
  loadPostList();
});
</script>

<style scoped>
/* 壳层（页头/侧栏/主区/卡片）与菜单、分页样式已由全局 design tokens 统一提供 */

.search-container {
  display: flex;
  gap: var(--space-4);
  margin-bottom: var(--space-5);
  align-items: center;
}

.search-input {
  width: 250px;
  max-width: 100%;
}
</style>
