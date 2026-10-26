import { defineStore } from 'pinia';

interface UserState {
  userId: number | null;
  username: string | null;
  token: string | null;
  role: string;
  isLoggedIn: boolean;
}

export const useUserStore = defineStore('user', {
  state: (): UserState => ({
    userId: null,
    username: null,
    token: null,
    role: 'user',
    isLoggedIn: false
  }),
  getters: {
    getUserInfo: (state) => ({
      userId: state.userId,
      username: state.username
    }),
    // 管理员身份按角色字段判断，不再按用户名推断
    isAdmin: (state) => state.role === 'admin'
  },
  actions: {
    setUserInfo(userId: number, username: string, token: string, role: string = 'user') {
      this.userId = userId;
      this.username = username;
      this.token = token;
      this.role = role;
      this.isLoggedIn = true;
      localStorage.setItem('token', token);
      localStorage.setItem('userId', userId.toString());
      localStorage.setItem('username', username);
      localStorage.setItem('role', role);
    },
    logout() {
      this.userId = null;
      this.username = null;
      this.token = null;
      this.role = 'user';
      this.isLoggedIn = false;
      localStorage.removeItem('token');
      localStorage.removeItem('userId');
      localStorage.removeItem('username');
      localStorage.removeItem('role');
    },
    initFromLocalStorage() {
      const token = localStorage.getItem('token');
      const userId = localStorage.getItem('userId');
      const username = localStorage.getItem('username');
      const role = localStorage.getItem('role');
      if (token && userId && username) {
        this.userId = parseInt(userId);
        this.username = username;
        this.token = token;
        this.role = role || 'user';
        this.isLoggedIn = true;
      }
    }
  }
});
