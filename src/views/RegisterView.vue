<template>
  <AuthShell subtitle="农产品价格与气象服务平台 · 注册">
    <el-form
      ref="registerFormRef"
      :model="registerForm"
      :rules="registerRules"
      label-width="80px"
      class="auth-form"
      @keyup.enter="handleRegister"
    >
      <el-form-item label="用户名" prop="username">
        <el-input v-model="registerForm.username" placeholder="请输入用户名" autocomplete="username" />
      </el-form-item>
      <el-form-item label="密码" prop="password">
        <el-input
          v-model="registerForm.password"
          type="password"
          placeholder="请输入密码"
          show-password
          autocomplete="new-password"
        />
      </el-form-item>
      <el-form-item label="确认密码" prop="confirmPassword">
        <el-input
          v-model="registerForm.confirmPassword"
          type="password"
          placeholder="请确认密码"
          show-password
          autocomplete="new-password"
        />
      </el-form-item>
      <el-form-item>
        <div class="auth-actions">
          <el-button type="primary" :loading="pending" class="auth-submit" @click="handleRegister">注册</el-button>
          <el-button class="auth-submit" @click="navigateToLogin">登录</el-button>
        </div>
      </el-form-item>
    </el-form>
  </AuthShell>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import AuthShell from '../components/AuthShell.vue';
import { useRouter } from 'vue-router';
import axiosInstance from '../utils/axios';
import { ElMessage } from 'element-plus';

const router = useRouter();
const registerFormRef = ref();
const pending = ref(false);

const registerForm = reactive({
  username: '',
  password: '',
  confirmPassword: ''
});

const registerRules = reactive({
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
  confirmPassword: [
    { required: true, message: '请确认密码', trigger: 'blur' },
    {
      validator: (_: any, value: string, callback: any) => {
        if (value !== registerForm.password) {
          callback(new Error('两次输入的密码不一致'));
        } else {
          callback();
        }
      },
      trigger: 'blur'
    }
  ]
});

const handleRegister = async () => {
  if (!registerFormRef.value || pending.value) return;

  try {
    await registerFormRef.value.validate();
  } catch {
    return;
  }

  pending.value = true;
  try {
    const { confirmPassword, ...formData } = registerForm;
    await axiosInstance.post('/auth/register', formData);
    ElMessage.success('注册成功，请登录');
    router.push('/login');
  } catch (error) {
    console.error('注册失败:', error);
  } finally {
    pending.value = false;
  }
};

const navigateToLogin = () => {
  router.push('/login');
};
</script>

<style scoped>
/* 注册页版式走 AuthShell 与全局 .auth-* 骨架 */
</style>
