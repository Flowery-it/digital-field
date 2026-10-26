<template>
  <AuthShell subtitle="农产品价格与气象服务平台 · 登录">
    <el-form
      ref="loginFormRef"
      :model="loginForm"
      :rules="loginRules"
      label-width="80px"
      class="auth-form"
      @keyup.enter="handleLogin"
    >
      <el-form-item label="用户名" prop="username">
        <el-input v-model="loginForm.username" placeholder="请输入用户名" autocomplete="username" />
      </el-form-item>
      <el-form-item label="密码" prop="password">
        <el-input
          v-model="loginForm.password"
          type="password"
          placeholder="请输入密码"
          show-password
          autocomplete="current-password"
        />
      </el-form-item>
      <el-form-item>
        <div class="auth-actions">
          <el-button type="primary" :loading="pending" class="auth-submit" @click="handleLogin">登录</el-button>
          <el-button class="auth-submit" @click="navigateToRegister">注册</el-button>
        </div>
      </el-form-item>
    </el-form>
    <p class="auth-hint">
      演示账号：<code>admin / admin123</code>（管理端）· <code>demo / demo123</code>（普通用户）
    </p>
  </AuthShell>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useUserStore } from '../stores/userStore';
import { ElMessage } from 'element-plus';
import axiosInstance from '../utils/axios';
import AuthShell from '../components/AuthShell.vue';

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();
const loginFormRef = ref();
const pending = ref(false);

const loginForm = reactive({
  username: '',
  password: ''
});

const loginRules = reactive({
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
});

// 登录后跳转：优先回到被拦截前的深链接；仅信任站内相对路径，防开放重定向
const resolveRedirect = (fallback: string) => {
  const redirect = route.query.redirect as string;
  if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) {
    return redirect;
  }
  return fallback;
};

const handleLogin = async () => {
  if (!loginFormRef.value || pending.value) return;

  try {
    await loginFormRef.value.validate();
  } catch {
    return;
  }

  pending.value = true;
  try {
    // 全量真实登录：管理员与普通用户统一走后端 /auth/login 换取 JWT，按返回 role 分流跳转
    const res: any = await axiosInstance.post('/auth/login', {
      username: loginForm.username,
      password: loginForm.password
    });
    const { token, user } = res.data;
    const role = user.role || 'user';
    userStore.setUserInfo(user.id, user.username, token, role);
    ElMessage.success(role === 'admin' ? '管理员登录成功' : '登录成功');
    router.push(resolveRedirect(role === 'admin' ? '/admin/home' : '/home'));
  } catch {
    // 登录失败：拦截器已提示「用户名或密码错误」
  } finally {
    pending.value = false;
  }
};

const navigateToRegister = () => {
  router.push('/register');
};

// 清理历史版本遗留的假 token（'user-token-' 前缀），避免旧 localStorage 状态导致鉴权异常
onMounted(() => {
  const token = localStorage.getItem('token');
  if (token && token.startsWith('user-token-')) {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    localStorage.removeItem('username');
    localStorage.removeItem('role');
  }
});
</script>

<style scoped>
/* 登录页版式（外壳 / 卡片 / 表单 / 按钮 / 提示）全部走 AuthShell 与全局 .auth-* 骨架 */
</style>
