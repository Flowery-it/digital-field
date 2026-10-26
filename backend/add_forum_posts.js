/**
 * 论坛演示帖子扩充脚本（一次性）
 * 用法: node add_forum_posts.js
 * 说明:
 *   1. 修正存量帖子的板块归类（原 6 帖全部落在「综合讨论」，按主题归位）；
 *   2. 新增 12 条演示帖，覆盖 5 个板块，admin 与 testuser01 两个用户错峰发布；
 *   幂等：仅追加不删改存量正文，重复执行会按标题去重。
 */
const sequelize = require('./config/database');
const Post = require('./models/Post');
const User = require('./models/User');

// 存量帖子的板块归位（按标题精确匹配）
const RECATEGORIZE = [
  { title: '小麦越冬管理技术要点', category: '种植技术' },
  { title: '今年玉米价格走势分析', category: '市场行情' },
  { title: '大豆玉米带状复合种植经验分享', category: '种植技术' },
  { title: '高标准农田建设带来的变化', category: '政策资讯' },
  { title: '新疆棉田种植密度讨论', category: '种植技术' },
  { title: '花生黄叶病怎么治', category: '病虫害防治' }
];

// 新增帖子：daysAgo 为距今天数（错峰分布），user 为发布用户名
const NEW_POSTS = [
  {
    title: '水稻机插育秧技术请教',
    category: '种植技术',
    user: 'testuser01',
    daysAgo: 26,
    content: '今年第一次尝试水稻机插，秧盘播种量控制在多少比较合适？\n我按每盘120克播的，出苗后密度有点大。\n另外基质厚度和压实程度对秧苗素质影响大吗？用过侧深施肥的机子感觉怎么样，求指点。'
  },
  {
    title: '大棚番茄整枝打杈心得',
    category: '种植技术',
    user: 'admin',
    daysAgo: 21,
    content: '无限生长型番茄建议采用单干整枝，侧枝长到5厘米左右再抹，伤口小愈合快。\n打杈时间选在晴天上午，阴雨天操作容易感病。\n植株下部老叶及时摘除，改善通风透光，减少灰霉病发生。'
  },
  {
    title: '果树秋季基肥什么时候施最好',
    category: '种植技术',
    user: 'testuser01',
    daysAgo: 9,
    content: '老话说"秋施金，冬施银"，9月下旬到10月上旬地温还高，正适合施基肥。\n以腐熟有机肥为主，配合平衡型复合肥，施肥后及时浇水。\n大家果园都是什么时间施的基肥？效果差别明显吗？'
  },
  {
    title: '小麦条锈病防治用药建议',
    category: '病虫害防治',
    user: 'admin',
    daysAgo: 24,
    content: '条锈病"见点打片，见片打面"，发现病叶要立刻开展大面积预防。\n常用戊唑醇、三唑酮悬浮剂叶面喷雾，注意轮换用药延缓抗性。\n降雨偏多的灌区要重点关注，抓住齐穗期这个关键窗口。'
  },
  {
    title: '稻田二化螟发生期预警',
    category: '病虫害防治',
    user: 'testuser01',
    daysAgo: 14,
    content: '近期测报灯下成虫数量上升，预计一周后进入卵孵高峰期。\n建议搁田降低田间湿度，卵孵高峰后3-5天用药效果最好。\n氯虫苯甲酰胺类药剂持效期长，可以优先考虑。'
  },
  {
    title: '蔬菜蚜虫绿色防治方法',
    category: '病虫害防治',
    user: 'admin',
    daysAgo: 5,
    content: '设施蔬菜可以挂黄板诱杀，每亩20-30张，悬挂高度与植株顶端平齐。\n药剂优先选生物类的苦参碱、印楝素，采收前注意安全间隔期。\n及时清除田间杂草，减少虫源基数。'
  },
  {
    title: '生猪价格三季度走势大家怎么看',
    category: '市场行情',
    user: 'testuser01',
    daysAgo: 19,
    content: '从近几个月数据看，生猪出栏价在成本线附近震荡。\n能繁母猪存栏仍处调整期，四季度腌腊需求或带来阶段性支撑。\n养殖户朋友现在是什么出栏节奏，压栏还是顺势出栏？'
  },
  {
    title: '当地苹果收购价汇总',
    category: '市场行情',
    user: 'admin',
    daysAgo: 11,
    content: '汇总了一下近期主产区富士苹果收购价：\n山东烟台75#以上好货每斤2.8-3.2元，陕西洛川优质果3.5元以上。\n入库果和地面果价差明显，建议根据果面等级分批销售。'
  },
  {
    title: '化肥价格持续上涨对成本的影响',
    category: '市场行情',
    user: 'testuser01',
    daysAgo: 3,
    content: '今年尿素和复合肥到村价同比涨了一成多，一亩地的肥料成本多了几十块。\n建议大家关注淡季储备和集采渠道，合作社统一订购能拿到更低的批发价。\n有条件的地块可以先做土壤检测，精准施肥避免浪费。'
  },
  {
    title: '耕地地力保护补贴申请流程',
    category: '政策资讯',
    user: 'admin',
    daysAgo: 17,
    content: '补贴对象为拥有耕地承包权的种地农民，具体标准由各省确定。\n一般流程：村级登记核实→公示→乡镇审核→上报县级农业农村部门→通过"一卡通"发放。\n注意耕地不能撂荒，地类性质变更的耕地不予发放。'
  },
  {
    title: '农业保险投保理赔经验分享',
    category: '政策资讯',
    user: 'testuser01',
    daysAgo: 7,
    content: '政策性保险保费低保障实在，像小麦完全成本保险能覆盖物化成本和地租。\n出险后要及时报案，保留好受灾现场照片和村委会证明。\n查勘定损阶段配合查勘员指认地块边界，理赔款到账还是挺快的。'
  },
  {
    title: '新农具购买建议：无人机还是拖拉机',
    category: '综合讨论',
    user: 'testuser01',
    daysAgo: 12,
    content: '家里种200亩地，想添台设备，在植保无人机和轮式拖拉机之间犹豫。\n无人机打药效率高效率好，但拖拉机能干多种农活。\n有同样规模的朋友说说你们怎么配的？'
  },
  {
    title: '返乡创业做农产品电商可行吗',
    category: '综合讨论',
    user: 'admin',
    daysAgo: 2,
    content: '最近不少朋友咨询返乡做农产品电商的事，聊几点感受：\n产品标准化是前提，分级分拣打包发货都要有章法；\n先小批量跑通渠道再放量，冷链和售后的账要提前算清楚。\n欢迎有实操经验的网友补充。'
  }
];

(async () => {
  try {
    await sequelize.authenticate();
    const admin = await User.findOne({ where: { username: 'admin' } });
    const testUser = await User.findOne({ where: { username: 'testuser01' } });
    if (!admin || !testUser) {
      console.log('未找到 admin 或 testuser01 用户，脚本终止');
      process.exit(1);
    }
    const userIdOf = { admin: admin.id, testuser01: testUser.id };

    // 1. 存量帖子板块归位
    let moved = 0;
    for (const r of RECATEGORIZE) {
      const [n] = await Post.update(
        { category: r.category },
        { where: { title: r.title } }
      );
      if (n > 0) moved += n;
    }
    console.log(`存量帖子板块归位：${moved} 条`);

    // 2. 新增帖子（按标题去重，保证幂等）
    const existingTitles = new Set((await Post.findAll({ attributes: ['title'] })).map(p => p.title));
    const now = Date.now();
    const rows = NEW_POSTS.filter(p => !existingTitles.has(p.title)).map(p => {
      const t = new Date(now - p.daysAgo * 86400000 - Math.floor(Math.random() * 8) * 3600000);
      return {
        title: p.title,
        content: p.content,
        category: p.category,
        userId: userIdOf[p.user],
        createTime: t,
        updateTime: t
      };
    });

    if (rows.length > 0) {
      await Post.bulkCreate(rows);
      console.log(`新增演示帖子：${rows.length} 条`);
    } else {
      console.log('新增演示帖子：0 条（已全部存在，跳过）');
    }

    // 3. 汇总
    const stats = await Post.findAll({
      attributes: [
        'category',
        [sequelize.fn('COUNT', sequelize.col('id')), 'c']
      ],
      group: ['category']
    });
    console.log('各板块帖子数：', stats.map(s => `${s.category}=${s.get('c')}`).join('， '));
    const total = await Post.count();
    console.log(`帖子总数：${total}`);
    process.exit(0);
  } catch (err) {
    console.error('灌帖失败：', err.message);
    process.exit(1);
  }
})();
