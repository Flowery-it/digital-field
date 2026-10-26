<template>
  <!-- 管理端壳层：四个管理页（首页/用户/作物数据/帖子）原各写一遍页头+侧栏+菜单+退出，
       收敛为一份；菜单激活态与退出逻辑随壳层一起提供。 -->
  <div class="admin-shell-container">
    <!-- 顶部导航栏 -->
    <el-header class="admin-header">
      <div class="header-left">
        <h1 class="admin-site-title">数字田野 · 管理后台</h1>
      </div>
      <div class="header-right">
        <span class="welcome-text">欢迎，{{ userStore.username }}</span>
        <el-button type="primary" @click="handleLogout">退出登录</el-button>
      </div>
    </el-header>

    <!-- 主内容区 -->
    <el-container class="admin-container">
      <!-- 侧边导航：宽度由全局 .admin-aside 统一提供，此处不写内联宽度 -->
      <el-aside class="admin-aside">
        <el-menu
          :default-active="activeMenu"
          class="admin-menu"
          router
          :unique-opened="true"
        >
          <el-menu-item index="/admin/home">
            <el-icon><House /></el-icon>
            <span>首页</span>
          </el-menu-item>
          <el-menu-item index="/admin/user">
            <el-icon><User /></el-icon>
            <span>用户管理</span>
          </el-menu-item>
          <el-menu-item index="/admin/crop">
            <el-icon><DataAnalysis /></el-icon>
            <span>作物数据管理</span>
          </el-menu-item>
          <el-menu-item index="/admin/post">
            <el-icon><ChatDotRound /></el-icon>
            <span>帖子管理</span>
          </el-menu-item>
          <el-menu-item index="/home" divided>
            <el-icon><Back /></el-icon>
            <span>返回前台</span>
          </el-menu-item>
        </el-menu>
      </el-aside>

      <!-- 内容区域 -->
      <el-main class="admin-main">
        <slot />
      </el-main>
    </el-container>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { House, User, DataAnalysis, ChatDotRound, Back } from '@element-plus/icons-vue';
import { useUserStore } from '../stores/userStore';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const activeMenu = computed(() => route.path);

const handleLogout = () => {
  userStore.logout();
  ElMessage.success('退出登录成功');
  router.push('/admin/login');
};
</script>

<style scoped>
/* 壳层（页头 / 侧栏 / 主区 / 卡片 / 菜单 / 分页）全部走全局 style.css 的管理端基础样式，
   本组件只负责结构与交互，不再本地重复定义 */
</style>
