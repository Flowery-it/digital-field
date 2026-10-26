<template>
  <AdminShell>
    <el-card class="admin-card">
      <template #header>
        <div class="card-header">
          <span>用户管理</span>
        </div>
      </template>
          <div class="user-manage-content">
            <!-- 搜索和筛选 -->
            <div class="search-container">
              <el-input
                v-model="searchForm.username"
                placeholder="请输入用户名"
                prefix-icon="Search"
                class="search-input"
              />
              <el-select v-model="searchForm.status" placeholder="请选择状态" class="status-select">
                <el-option label="全部" value="" />
                <el-option label="启用" value="1" />
                <el-option label="禁用" value="0" />
              </el-select>
              <el-button type="primary" @click="handleSearch">搜索</el-button>
              <el-button @click="resetSearch">重置</el-button>
            </div>

            <!-- 用户列表 -->
            <el-table
              v-loading="loading"
              :data="userList"
              style="width: 100%"
              border
            >
              <el-table-column prop="id" label="用户ID" width="80" />
              <el-table-column prop="username" label="用户名" width="180" />
              <el-table-column prop="status" label="状态" width="100">
                <template #default="scope">
                  <el-tag :type="scope.row.status === 1 ? 'success' : 'danger'">
                    {{ scope.row.status === 1 ? '启用' : '禁用' }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="createTime" label="创建时间" width="200" />
              <el-table-column label="操作" width="150">
                <template #default="scope">
                  <el-button
                    type="primary"
                    size="small"
                    @click="handleStatusChange(scope.row)"
                  >
                    {{ scope.row.status === 1 ? '禁用' : '启用' }}
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
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import AdminShell from '../../components/AdminShell.vue';
import { useAdminGuard } from '../../composables/useAdminGuard';

const adminGuard = useAdminGuard();

const loading = ref(false);
const userList = ref<any[]>([]);
const currentPage = ref(1);
const pageSize = ref(10);
const total = ref(0);

const searchForm = ref({
  username: '',
  status: ''
});

// 加载用户列表
const loadUserList = async () => {
  loading.value = true;
  try {
    // 这里应该调用后端API获取用户列表
    // 由于后端API尚未实现，使用模拟数据
    userList.value = [
      { id: 1, username: 'admin', status: 1, createTime: '2024-01-01 10:00:00' },
      { id: 2, username: 'user1', status: 1, createTime: '2024-01-02 11:00:00' },
      { id: 3, username: 'user2', status: 1, createTime: '2024-01-03 12:00:00' },
      { id: 4, username: 'user3', status: 0, createTime: '2024-01-04 13:00:00' },
      { id: 5, username: 'user4', status: 1, createTime: '2024-01-05 14:00:00' }
    ];
    total.value = userList.value.length;
  } catch (error) {
    console.error('加载用户列表失败:', error);
  } finally {
    loading.value = false;
  }
};

// 处理状态变更
const handleStatusChange = async (user: any) => {
  try {
    // 这里应该调用后端API更新用户状态
    // 由于后端API尚未实现，直接模拟更新
    user.status = user.status === 1 ? 0 : 1;
    ElMessage.success(`用户${user.status === 1 ? '启用' : '禁用'}成功`);
  } catch (error) {
    console.error('更新用户状态失败:', error);
  }
};

// 搜索处理
const handleSearch = () => {
  currentPage.value = 1;
  loadUserList();
};

// 重置搜索
const resetSearch = () => {
  searchForm.value = {
    username: '',
    status: ''
  };
  currentPage.value = 1;
  loadUserList();
};

// 分页处理
const handleSizeChange = (size: number) => {
  pageSize.value = size;
  currentPage.value = 1;
  loadUserList();
};

const handleCurrentChange = (current: number) => {
  currentPage.value = current;
  loadUserList();
};

onMounted(() => {
  // 管理端守卫：未登录或非管理员回落管理员登录页
  if (!adminGuard()) return;
  loadUserList();
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
  width: 300px;
  max-width: 100%;
}

.status-select {
  width: 150px;
  max-width: 100%;
}
</style>
