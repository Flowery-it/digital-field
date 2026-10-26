# 数字田野 · 农产品价格与气象服务平台

面向种植户与合作社的 **价格 + 气象** 双决策辅助平台。它不做「把数据画成图表」的展示型大屏，而是回答三个具体问题：

1. 我的品种今天什么价、涨跌多少？
2. 我所在区域未来几天天气如何，要不要下地干活？
3. 把两者放在一起，**今天该做什么**？（把天气翻译成「抢晴采收 / 灌深水 / 停止灌溉」这类可执行动作）

前端 Vue 3 + Element Plus + ECharts 6，后端 Express + Sequelize，默认 SQLite 单文件数据库，`node app.js` 即可离线跑通全站。

---

## 一、功能地图

### 主导航（4 项）

| 入口   | 路径            | 覆盖能力                                                       |
| ---- | ------------- | ---------------------------------------------------------- |
| 首页   | `/home`       | 30 品种价格总览（N 涨 M 跌 K 平）、顶部天气条、今日农事提醒条数、品种/市场详情入口            |
| 气象生产 | `/production` | 6 个子标签，覆盖「决策 → 执行」全链路，见下表                                  |
| 我的关注 | `/my-focus`   | 种植区域 / 关注品种 / 参考市场配置，价格看板 + 区域农事提醒预览（按用户名隔离存 localStorage） |
| 农友论坛 | `/forum`      | 5 大板块、搜索、排序、分页；发帖 / 编辑 / 删除按作者权限控制                         |

### 气象生产（`/production` 壳页 6 子标签）

| 分组 | 子标签   | 路由                      | 做什么                                   |
| -- | ----- | ----------------------- | ------------------------------------- |
| 决策 | 生产总览  | `/production/overview`  | 一屏汇总今日价格异动、天气风险、待办农事（读当日快照）           |
| 决策 | 气象与农事 | `/production/weather`   | 316 城 7 日预报 + 34 条规则命中的动作建议 + AI 农事问答 |
| 决策 | 智能荐种  | `/production/recommend` | 四因子动态推荐指数 + 品种级栽培要点 + 地标特产            |
| 执行 | 施肥打药  | `/production/fertilize` | 按生育期给用量区间、病害风险预警、拍照识病                 |
| 执行 | 产量预估  | `/production/yield`     | 量价双预测、收益测算、收益台账记录                     |
| 执行 | 产销对接  | `/production/match`     | 供需意向匹配、AI 报价评估、意向撮合                   |

### 八个 AI 能力模块

| 编号 | 模块   | 主要实现                                    | 无 AI / 失败时  |
| -- | ---- | --------------------------------------- | ----------- |
| M1 | 智能荐种 | 四因子加权指数（气候适配 / 市场行情 / 收益预期 / 风险）        | 纯规则计算，无模型依赖 |
| M2 | 农事管家 | 34 条规则生成每日农事简报，可按品种推送                   | 规则引擎直接产出    |
| M3 | 收益台账 | 投入产出核算 + 年度报告                           | 纯计算         |
| M4 | 施肥打药 | `seed/fertilizer_standards.json` 按生育期给量 | 知识库直接查询     |
| M5 | 产量预估 | 面积 × 单产模型（**规则版，不含 ML**）                | 纯计算         |
| M6 | 生产总览 | 当日快照聚合（`dashboard_snapshot` 表）          | 直接读表        |
| M7 | 拍照识病 | 视觉模型只负责「看图判断病名」                         | 识别失败时引导手动选择 |
| M8 | 产销对接 | 同品种意向匹配 + 大模型报价评估                       | 规则打分排序      |

> M7 的用药剂量**一律取自** `backend/seed/pest_library.json`，模型不生成剂量——避免大模型编造农药用量这类高风险输出。

---

## 二、技术栈

| 层   | 选型                                                                                           | 说明                                       |
| --- | -------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 前端  | Vue 3.5 + TypeScript + Vite(rolldown-vite) + Element Plus + ECharts 6 + Pinia + Vue Router 4 | 源码在 `src/`；除登录/注册外全部路由懒加载                |
| 后端  | Express 4 + Sequelize 6 + JWT + bcrypt                                                       | 源码在 `backend/`，15 个路由模块                  |
| 数据库 | **SQLite**/ MySQL 8                                                                          | `.env` 改 `DB_DIALECT` 一行切换               |
| 气象  | 和风天气 QWeather 7d                                                                             | 服务端缓存 4 小时（可配 3–6 小时），上游异常退回旧缓存并标注 stale |
| 大模型 | 书生·浦语网关 / DeepSeek  / 通义千问 / Ollama / 任意 OpenAI 兼容端点                                         | 全部可选，未配置时问答由本地规则引擎作答                     |

数据模型为**维度表 + 事实表**：`dim_product`(30) / `dim_market`(10) / `dim_agro_rule`(34) + 事实表 `fact_price_daily`(161,840)。另有 `ai_generation` 表做 AI 结果持久化。

---

## 三、快速开始

**前置要求**：Node.js 18+（开发机为 22.22.2）。重训价格模型时才需要 Python 3 + numpy，日常运行不需要。

```bash
# 1) 后端（:3000）
cd backend
cp .env.example .env    # 首次运行；填 QWEATHER_API_KEY 后天气页可用
node app.js

# 2) 前端（:5173，已配置 /api → localhost:3000 代理）
cd ..
npm install             # 首次
npm run dev
```

访问 `http://localhost:5173`。

**演示账号**（`backend/app.js` 在数据库同步时幂等兜底创建，可用 `ADMIN_DEFAULT_PASSWORD` / `DEMO_DEFAULT_PASSWORD` 覆盖）：

| 账号      | 密码         | 用途                         |
| ------- | ---------- | -------------------------- |
| `admin` | `admin123` | 管理端（用户 / 作物数据 / 帖子管理）      |
| `demo`  | `demo123`  | 普通用户（价格 / 气象 / 关注 / 论坛全功能） |

登录走真实 `/api/auth/login` JWT 链路，无 mock 分支。

**生产构建**

```bash
npm run build     # = vue-tsc -b && vite build，产物在 dist/
```

---

## 四、项目结构

```
data_site_builder/
├── src/                          # 前端源码
│   ├── components/               #   PageShell / PageHeader / AppHeader / AuthShell / AdminShell
│   │                             #   CropChart / RegionRecommend / PostInteraction / AiAdvisor / BenefitRecordDialog
│   ├── composables/              #   useCityOptions / useAuthGuard / useAdminGuard
│   │                             #   useChartResize / useChartTheme / useViewportWidth
│   ├── views/                    #   首页 / 登录 / 注册 / 价格详情 / 市场详情 / 气象 / 荐种 / 施肥
│   │                             #   产量 / 产销对接 / 我的关注 / 论坛 / 生产总览 / 404
│   │   └── admin/                #   管理端（首页 / 登录 / 用户 / 作物数据 / 帖子管理）
│   ├── router/ stores/ utils/    #   路由守卫 / Pinia 状态 / axios 封装 / 图表主题 / 滚动动效
│   └── style.css                 #   设计令牌与全局样式（唯一样式来源）
├── backend/                      # 后端源码（Express + Sequelize）
│   ├── routes/                   #   15 个路由模块，见「API 一览」
│   ├── services/                 #   weatherService（上游调用 + 4h 缓存）
│   │                             #   priceForecastService（岭回归纯参数推理）
│   │                             #   agroAdvisoryService（34 条规则引擎）/ llmService（大模型适配 + 降级）
│   ├── config/                   #   数据库配置 / 作物字典 / 农业知识库
│   ├── models/                   #   14 个 Sequelize 模型
│   ├── models_artifacts/         #   price_forecast_model.json（模型参数，随包交付）
│   ├── seed/                     #   pest_library / fertilizer_standards / crop_climate 知识库
│   ├── seed.js seedPrice.js seedMatch.js   # 数据初始化脚本
│   ├── crop_data.db              #   SQLite 演示数据（40M，免跑 seed）
│   └── .env.example              #   环境变量模板（.env 不入库）
├── scripts/
│   ├── train_price_model.py      #   价格预测模型训练（numpy 即可运行）
│   └── weather_exporter.py       #   气象数据导出工具（须从项目根运行）
├── public/images/                #   站点图片
├── China-City-List-latest.csv    #   全国地级市编码表（天气定位用，seed 依赖）
└── vite.config.ts                #   dev server 与 /api 代理
```

---

## 五、关键设计

### 1. AI 双层架构：规则引擎保底，模型增强

- **保底层**：`agroAdvisoryService.js` 的 34 条农事规则（品种 × 生育期窗口 × 耐受阈值 → 动作）。知识驱动、可解释、可审计、零推理成本。
- **增强层**：`llmService.js` 负责自然语言组织，实况上下文（4h 缓存天气 + 规则命中 + 关注品种报价）注入提示词。
- **三级降级**：未配置 Key → 直接用规则引擎；超时 → 回退；上游失败 → 回退。界面**标注回答来源**（规则引擎 / 大模型 + 耗时），不把规则引擎伪装成大模型。

### 2. 价格预测：自训练、可复现、指标不修饰

4 个差异化岭回归成员（全特征 / 动量与均值回归 / 季节项主导 / 全特征+Bootstrap）按校准集标定的权重线性融合（当前四者权重约 0.25 均分），预测目标为 **7 日价格漂移**。

样本做**三段式时间切分**——拟合集 → 校准集选 λ 与融合权重 → 验证集只做报告，避免用验证集调参：

| 指标         | 模型          | 朴素基线   | 结论              |
| ---------- | ----------- | ------ | --------------- |
| 验证集 MAE（%） | **2.5849**  | 2.9869 | 误差下降 **13.46%** |
| 方向准确率      | **66.53%**  | 50%    | 明显优于随机          |
| R²         | 0.169       | —      | 解释力有限，仅作参考区间依据  |
| 滚动起点回测技能分  | **+13.17%** | —      | 换起点后结论一致        |

模型参数在 `backend/models_artifacts/price_forecast_model.json`（2026-10-16 训练，289 条序列），**Python 只用于离线训练，Node 端纯参数推理，运行时零 ML 依赖**。重新训练：

```bash
python scripts/train_price_model.py                 # 训练 + 验证 + 导出（约 1 分钟）
python scripts/train_price_model.py --horizon 14    # 改预测步长
```

脚本会同时打印与朴素基线的对比、每个集成成员的校准误差与融合权重。**若模型不能优于基线，脚本会如实呈现。**

### 3. 口径隔离：禁止跨市场类型混算均价

市场分产地型 / 销地型 / 集散型，均价按类型分组计算；产区销区价差只在两类**都有数据**时给出。宁可显示「数据不足」，也不出示错误的数字。

### 4. 持久化契约：GET 只读，POST `/refresh` 才生成

所有 AI 产出的接口遵守同一约定：

- `GET <路由>` —— **只读**，返回 `{ found: boolean }`，不触发生成、不调大模型；
- `POST <路由>/refresh` —— 生成并落库到 `ai_generation`（键为 `userId + module + scopeKey`，失败不覆盖已有成功结果）。

收益是首屏不再等大模型：打开页面读缓存，主动点击才调用。`/api/dashboard/snapshot` 同理，读当日快照。

### 5. 数字一致性校验

大模型输出里每个数字与注入的实况上下文逐一比对，未匹配项在界面直接标出，请用户以「回答依据」中的数据库数据为准。大模型只生成建议措辞，**所有事实数据（天气 / 规则命中 / 价格）由规则引擎与数据库提供**。

### 6. 鉴权四态

无 token → 401；伪造 token → 401；`admin` → 200；`demo` 访问 `/api/admin/*` → 403。前端路由守卫按 `role` 字段判断（不按用户名推断），未登录深链接会带 `redirect` 回来。

### 7. 气象服务端缓存

同城多用户共享一份缓存，不按用户请求实时透传上游；上游异常时退回旧缓存并标注 stale。缓存时长由 `WEATHER_CACHE_TTL_HOURS` 控制。

---

## 六、API 一览

所有接口前缀 `/api`，除登录/注册外均需 `Authorization: Bearer <token>`。

| 模块             | 主要端点                                                                                                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 认证 `auth`      | `POST /auth/register` · `/login` · `/logout`                                                                                                                            |
| 作物 `crop`      | `GET /crop/list` · `/detail/:id` · `/types` · `/regions` · `/years` · `/chart`                                                                                          |
| 价格 `price`     | `GET /price/products` · `/markets` · `/detail/:productId` · `/summary` · `/forecast`                                                                                    |
| 市场 `market`    | `GET /market/detail/:marketId`                                                                                                                                          |
| 气象 `weather`   | `GET /weather/cities` · `/locate` · `/forecast`                                                                                                                         |
| 农事 `agro`      | `GET /agro/advice` · `/rules` · `/my-crops` · `/daily-brief` · `/push-history`；`POST /agro/my-crops` · `/daily-brief/refresh` · `/push/run`；`DELETE /agro/my-crops/:id` |
| 荐种 `recommend` | `GET /recommend/list` · `/dynamic` · `/detail/:id`；`POST /recommend/dynamic/refresh`                                                                                    |
| 施肥 `fertilize` | `GET /fertilize/advice` · `/options`；`POST /fertilize/advice/refresh`                                                                                                   |
| 产量 `yield`     | `GET /yield/estimate`；`POST /yield/estimate/refresh`                                                                                                                    |
| 收益 `benefit`   | `POST /benefit/record` · `/annual-report`；`GET /benefit/summary` · `/annual-report`                                                                                     |
| 产销 `match`     | `POST /match/intent` · `/negotiate` · `/intent/:id/close`；`GET /match/my` · `/recommend`                                                                                |
| 总览 `dashboard` | `GET /dashboard/snapshot`；`POST /dashboard/snapshot/refresh`                                                                                                            |
| AI `ai`        | `GET /ai/status` · `/models` · `/chat/last` · `/vision/last`；`POST /ai/chat` · `/vision`                                                                                |
| 论坛 `post`      | `GET /post/categories` · `/list` · `/detail/:id`；`POST /post/create`；`PUT /post/update/:id`；`DELETE /post/delete/:id`                                                   |
| 管理 `admin`     | `GET /admin/users` · `/stats`；`PUT /admin/user/status/:id`；`POST /admin/crop/create`；`PUT /admin/crop/update/:id`；`DELETE /admin/crop/delete/:id` · `/post/delete/:id`  |

---

## 七、数据资产与口径声明

| 项目                | 数值               | 性质                                                                                       |
| ----------------- | ---------------- | ---------------------------------------------------------------------------------------- |
| 价格记录              | 161,840 条        | 30 品种 × 10 市场 × 560 天（2025-04-01 → 2026-10-12），**本地合成测试数据，不代表真实行情**                      |
| 作物产量              | 23,275 条         | 全国总量为**国家统计局公开真实数据**（2024 年 70,649.9 万吨，与官方零偏差）；省/市级为**已标注的分摊模型**（IPF 校准 / 产区带分摊 / 省内权重） |
| 地区推荐              | 1,702 条          | 公开产区知识整理，不构成产量与收益承诺                                                                      |
| 农事规则              | 34 条             | 品种 × 生育期 × 阈值，全透明可审计                                                                     |
| 覆盖地市              | 316 个            | 大陆 31 个省级行政区全部地级市                                                                        |
| 论坛 / 关注 / 收益 / 撮合 | 19 / 2 / 2 / 8 条 | **演示数据**，仅用于功能展示                                                                         |

## 八、环境变量

复制 `backend/.env.example` 为 `backend/.env` 后按需填写。

| 变量                                                    | 默认/示例            | 说明                                                             |
| ----------------------------------------------------- | ---------------- | -------------------------------------------------------------- |
| `DB_DIALECT`                                          | `sqlite`         | `sqlite`或 `mysql`                                              |
| `DB_HOST` `DB_PORT` `DB_USER` `DB_PASSWORD` `DB_NAME` | —                | 仅 `mysql` 模式生效                                                 |
| `JWT_SECRET`                                          | 空                | **必须**改为 32 位以上随机串                                             |
| `JWT_EXPIRES_IN`                                      | `2h`             | Token 有效期                                                      |
| `QWEATHER_API_KEY`                                    | 空                | 和风天气 Key；未配置时天气接口不可用，其余模块不受影响                                  |
| `WEATHER_CACHE_TTL_HOURS`                             | `4`              | 服务端缓存小时数                                                       |
| `AI_PROVIDER`                                         | 空                | `intern`  / `deepseek` / `qwen` / `ollama` / `openai`；留空则纯规则引擎 |
| `AI_API_KEY` `AI_MODEL` `AI_BASE_URL`                 | 空                | 模型接入参数（Ollama 无需 Key）                                          |
| `AI_FALLBACK_MODELS`                                  | 空                | 主模型超时/空回复时的自动切换链                                               |
| `AI_ALLOWED_MODELS`                                   | 空                | 页面模型下拉框白名单（默认取 `llmService.js` 内置清单）                           |
| `AI_TIMEOUT_MS` `AI_MAX_TOKENS`                       | `60000` / `2000` | 单次调用预算，切换模型时按内置标定值自动覆盖                                         |
| `ADMIN_DEFAULT_PASSWORD` `DEMO_DEFAULT_PASSWORD`      | 空                | 覆盖默认演示口令                                                       |

**关于模型切换**：页面内下拉框可选 9 个已标定模型（`Atria-Dawn` / `glm-5.3` / `qwen3.8-27b` / `deepseek-v4-flash` / `deepseek-v4-pro` / `minimax-m3` / `kimi-k2.6` / `intern-s2` / `Agents-A1`），每个模型的 `maxTokens` 与 `timeout` 按实测思维链长度单独标定在 `llmService.js` 的 `INTERN_MODELS` 中，切换即生效。后端对 `model` 字段做白名单校验，不在清单内返回 400。推理型模型（`intern-s2`、`kimi`）思维链实测占 1500–3400 tokens。

---

## 九、已知边界


- 天气依赖和风天气 Key 与网络；离线环境下天气页不可用，其余模块正常。
- 价格数据为静态样例，不随真实行情更新；接入真实数据源需重写 `seedPrice.js` 的数据适配层。
- 论坛与撮合数据为演示内容，暂不含真实用户。
- 大模型为可选增强，未配置时全部问答由规则引擎作答，功能不中断但表达更模板化。
