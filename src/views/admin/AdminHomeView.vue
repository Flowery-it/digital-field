<template>
  <AdminShell>
    <el-card class="admin-card">
          <template #header>
            <div class="card-header">
              <span>管理系统首页</span>
            </div>
          </template>
          <div class="home-content">
            <el-row :gutter="20">
              <el-col :xs="24" :sm="24" :md="8">
                <el-card class="stats-card" shadow="hover" v-loading="statsLoading">
                  <template #header>
                    <div class="stats-header">
                      <span>用户数量</span>
                      <el-icon><UserFilled /></el-icon>
                    </div>
                  </template>
                  <div class="stats-value">{{ formatNumber(stats?.userCount) }}</div>
                  <div class="stats-desc">当前系统用户数</div>
                </el-card>
              </el-col>
              <el-col :xs="24" :sm="24" :md="8">
                <el-card class="stats-card" shadow="hover" v-loading="statsLoading">
                  <template #header>
                    <div class="stats-header">
                      <span>作物数据</span>
                      <el-icon><DataAnalysis /></el-icon>
                    </div>
                  </template>
                  <div class="stats-value">{{ formatNumber(stats?.cropCount) }}</div>
                  <div class="stats-desc">系统作物数据记录数</div>
                </el-card>
              </el-col>
              <el-col :xs="24" :sm="24" :md="8">
                <el-card class="stats-card" shadow="hover" v-loading="statsLoading">
                  <template #header>
                    <div class="stats-header">
                      <span>帖子数量</span>
                      <el-icon><ChatDotRound /></el-icon>
                    </div>
                  </template>
                  <div class="stats-value">{{ formatNumber(stats?.postCount) }}</div>
                  <div class="stats-desc">用户发布帖子数</div>
                </el-card>
              </el-col>
            </el-row>

            <el-card class="welcome-card" shadow="hover">
              <template #header>
                <div class="welcome-header">
                  <span>系统简介</span>
                </div>
              </template>
              <div class="welcome-text">
                <p>大数据作物网站管理系统是一个用于管理作物数据、用户账号和帖子的综合管理平台。</p>
                <p>系统功能包括：</p>
                <ul>
                  <li>用户账号管理：查看、禁用/启用用户账号</li>
                  <li>作物数据管理：查看、添加、编辑、删除作物数据</li>
                  <li>帖子管理：查看、删除用户发布的帖子</li>
                </ul>
                <p>通过本系统，管理员可以方便地管理网站的各项数据和功能，确保网站的正常运行。</p>
              </div>
            </el-card>
          </div>
        </el-card>
  </AdminShell>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { UserFilled } from '@element-plus/icons-vue';
import AdminShell from '../../components/AdminShell.vue';
import { useAdminGuard } from '../../composables/useAdminGuard';
import axiosInstance from '../../utils/axios';

const adminGuard = useAdminGuard();

// 首页统计：真实接口数据，失败显示「—」而非假数字
const stats = ref<{ userCount: number; cropCount: number; postCount: number } | null>(null);
const statsLoading = ref(false);

const formatNumber = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : n.toLocaleString('zh-CN');

const fetchStats = async () => {
  statsLoading.value = true;
  try {
    const res: any = await axiosInstance.get('/admin/stats');
    stats.value = res.data || null;
  } catch {
    stats.value = null;
  } finally {
    statsLoading.value = false;
  }
};

onMounted(() => {
  // 管理端守卫：未登录或非管理员回落管理员登录页
  if (!adminGuard()) return;
  fetchStats();
});
</script>

<style scoped>
/* 统计卡：最小高度防内容裁剪，图标点缀品牌色（圆角/阴影来自全局 .el-card） */
.stats-card {
  min-height: 170px;
  display: flex;
  flex-direction: column;
}

.stats-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stats-header .el-icon {
  color: var(--brand-blue);
}

.stats-value {
  font-size: var(--fs-display);
  font-weight: 700;
  color: var(--brand-blue);
  margin: var(--space-4) 0;
  line-height: var(--lh-tight);
}

.stats-desc {
  font-size: var(--fs-md);
  color: var(--text-regular);
  margin-top: auto;
}

.welcome-card {
  margin-top: var(--space-5);
}

.welcome-text {
  line-height: var(--lh-relaxed);
  color: var(--text-regular);
}

.welcome-text ul {
  margin-left: var(--space-5);
}

.welcome-text li {
  margin-bottom: var(--space-2);
}
</style>
