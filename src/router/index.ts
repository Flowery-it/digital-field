import { createRouter, createWebHistory } from 'vue-router';
import LoginView from '../views/LoginView.vue';
import RegisterView from '../views/RegisterView.vue';

// 除登录/注册（首屏直达，保持静态引入）外，其余路由全部懒加载：
// ECharts、Element Plus 表格、管理端等依赖按需分块，首屏 JS 体积大幅下降
const routes = [
  {
    path: '/',
    redirect: '/login'
  },
  {
    path: '/login',
    name: 'login',
    component: LoginView,
    meta: { title: '登录' }
  },
  {
    path: '/register',
    name: 'register',
    component: RegisterView,
    meta: { title: '注册' }
  },
  {
    path: '/home',
    name: 'home',
    component: () => import('../views/HomeView.vue'),
    meta: {
      requiresAuth: true,
      title: '首页'
    }
  },
  {
    // 气象生产：把原先分散的农业气象 / AI 荐种与新增的施肥打药、产量预估收拢为一个模块
    path: '/production',
    redirect: '/production/overview'
  },
  {
    path: '/production',
    name: 'production',
    component: () => import('../views/ProductionView.vue'),
    meta: {
      requiresAuth: true,
      title: '气象生产'
    },
    children: [
      { path: 'overview', name: 'productionOverview', component: () => import('../views/DashboardView.vue') },
      { path: 'weather', name: 'productionWeather', component: () => import('../views/WeatherView.vue') },
      { path: 'recommend', name: 'productionRecommend', component: () => import('../views/SmartRecommendView.vue') },
      { path: 'fertilize', name: 'productionFertilize', component: () => import('../views/FertilizeView.vue') },
      { path: 'yield', name: 'productionYield', component: () => import('../views/YieldView.vue') },
      { path: 'match', name: 'productionMatch', component: () => import('../views/MatchView.vue') }
    ]
  },
  // 旧入口重定向：Vue Router 4 的字符串重定向会**自动保留 query/hash**，
  // 因此 /weather?city=石家庄 会正确落到 /production/weather?city=石家庄
  { path: '/weather', redirect: '/production/weather' },
  { path: '/smart-recommend', redirect: '/production/recommend' },
  {
    path: '/price/:productId',
    name: 'priceDetail',
    component: () => import('../views/PriceDetailView.vue'),
    meta: {
      requiresAuth: true,
      title: '价格详情'
    }
  },
  {
    path: '/market/:marketId',
    name: 'marketDetail',
    component: () => import('../views/MarketDetailView.vue'),
    meta: {
      requiresAuth: true,
      title: '市场详情'
    }
  },
  {
    path: '/forum',
    name: 'forum',
    component: () => import('../views/ForumView.vue'),
    meta: {
      requiresAuth: true,
      title: '农友论坛'
    }
  },
  {
    path: '/my-focus',
    name: 'myFocus',
    component: () => import('../views/MyFocusView.vue'),
    meta: {
      requiresAuth: true,
      title: '我的关注'
    }
  },
  // 管理端路由
  {
    path: '/admin/login',
    name: 'adminLogin',
    component: () => import('../views/admin/AdminLoginView.vue'),
    meta: { title: '管理员登录' }
  },
  {
    path: '/admin/home',
    name: 'adminHome',
    component: () => import('../views/admin/AdminHomeView.vue'),
    meta: {
      requiresAuth: true,
      requiresAdmin: true,
      title: '管理后台'
    }
  },
  {
    path: '/admin/user',
    name: 'userManage',
    component: () => import('../views/admin/UserManageView.vue'),
    meta: {
      requiresAuth: true,
      requiresAdmin: true,
      title: '用户管理'
    }
  },
  {
    path: '/admin/crop',
    name: 'cropManage',
    component: () => import('../views/admin/CropDataManageView.vue'),
    meta: {
      requiresAuth: true,
      requiresAdmin: true,
      title: '作物数据管理'
    }
  },
  {
    path: '/admin/post',
    name: 'postManage',
    component: () => import('../views/admin/PostManageView.vue'),
    meta: {
      requiresAuth: true,
      requiresAdmin: true,
      title: '帖子管理'
    }
  },
  // 404 兜底：输错 URL 时给用户救赎路径，而非空白页
  {
    path: '/:pathMatch(.*)*',
    name: 'notFound',
    component: () => import('../views/NotFoundView.vue'),
    meta: { title: '页面不存在' }
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

// 路由守卫
router.beforeEach((to, _, next) => {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');

  // 已登录用户访问登录页：直接进入对应落地页，避免刷新后重复登录
  if (to.name === 'login' && token) {
    next(role === 'admin' ? { name: 'adminHome' } : { name: 'home' });
    return;
  }

  if (to.matched.some(record => record.meta.requiresAuth)) {
    if (!token) {
      // 携带 redirect：登录后回到用户原本想访问的深链接
      next({ name: 'login', query: { redirect: to.fullPath } });
    } else if (to.matched.some(record => record.meta.requiresAdmin)) {
      // 管理员权限按角色字段判断（不再按用户名推断）
      if (role === 'admin') {
        next();
      } else {
        next({ name: 'home' });
      }
    } else {
      next();
    }
  } else {
    next();
  }
});

// 页面标题：路由 meta.title + 站点名
router.afterEach((to) => {
  const siteName = '数字田野';
  document.title = to.meta.title ? `${to.meta.title} · ${siteName}` : siteName;
});

export default router;
