<template>
  <AuthShell subtitle="农产品价格与气象服务平台 · 管理后台">
    <el-form
      ref="loginFormRef"
      :model="loginForm"
      :rules="loginRules"
      label-width="80px"
      class="auth-form"
    >
      <el-form-item label="用户名" prop="username">
        <el-input v-model="loginForm.username" placeholder="请输入管理员用户名" />
      </el-form-item>
      <el-form-item label="密码" prop="password">
        <el-input
          v-model="loginForm.password"
          type="password"
          placeholder="请输入管理员密码"
          show-password
        />
      </el-form-item>
      <el-form-item>
        <div class="auth-actions">
          <el-button type="primary" class="auth-submit" @click="handleLogin">登录</el-button>
          <el-button class="auth-submit" @click="navigateToUserLogin">用户登录</el-button>
        </div>
      </el-form-item>
    </el-form>
  </AuthShell>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from '../../stores/userStore';
import { ElMessage } from 'element-plus';
import axiosInstance from '../../utils/axios';
import AuthShell from '../../components/AuthShell.vue';

const router = useRouter();
const userStore = useUserStore();
const loginFormRef = ref();

const loginForm = reactive({
  username: '',
  password: ''
});

const loginRules = reactive({
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
});

const handleLogin = async () => {
  if (!loginFormRef.value) return;
  
  try {
    await loginFormRef.value.validate();
    
    // 真实登录：走 /api/auth/login，换取 JWT 后由后端 adminAuth 中间件鉴权
    const res: any = await axiosInstance.post('/auth/login', {
      username: loginForm.username,
      password: loginForm.password
    });
    const { token, user } = res.data;
    // 角色显式落库：admin 用户名为管理员（与后端 adminAuth 口径一致）
    userStore.setUserInfo(user.id, user.username, token, user.username === 'admin' ? 'admin' : 'user');
    ElMessage.success('管理员登录成功');
    router.push('/admin/home');
  } catch {
    // 拦截器已提示错误信息
  }
};

const navigateToUserLogin = () => {
  router.push('/login');
};
</script>

<style scoped>
/* 管理端登录页版式走 AuthShell 与全局 .auth-* 骨架 */
</style>
