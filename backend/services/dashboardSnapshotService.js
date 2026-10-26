/**
 * 生产总览快照服务（每日一次 + 持久化）
 * ==================================
 *
 * 问题背景：生产总览每次进页面都实时重算，其中 AI 农事总结会调用大模型
 * （实测单次 40 秒以上），导致首屏迟迟不出内容。
 *
 * 解决策略：
 *   1. **每日一次**：快照按 (userId, snapshotDate) 唯一，当天已有快照直接读库；
 *   2. **持久化**：存 dashboard_snapshot 表，服务重启不丢；
 *   3. **不重复实时计算**：生成过程**不调用大模型**——AI 农事总结直接复用
 *      M2 已持久化的农事管家日报（advisory_push），没有日报时留空并提示，
 *      由用户显式点击「生成日报」时才触发（慢操作归慢操作，不拖慢看板）；
 *   4. **手动刷新**：POST /api/dashboard/snapshot/refresh 强制重算并覆盖当日快照；
 *   5. **失败可见**：生成失败落 status=error + errorMessage，前端展示并可重试。
 */

const { DashboardSnapshot, UserCrop, AdvisoryPush, User } = require('../models');
const weatherService = require('./weatherService');
const advisory = require('./agroAdvisoryService');
const benefitService = require('./benefitService');

const DEFAULT_CITY = '石家庄';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/** 汇总区域：取用户在种作物的第一个区域，没有则用默认城市 */
async function resolveRegion(userId) {
  const crop = await UserCrop.findOne({ where: { userId, status: 1 }, order: [['id', 'ASC']] });
  if (crop && crop.region) return { region: crop.region, from: '作物档案' };
  const push = await AdvisoryPush.findOne({ where: { userId }, order: [['id', 'DESC']] });
  if (push && push.content) return { region: DEFAULT_CITY, from: '默认城市' };
  return { region: DEFAULT_CITY, from: '默认城市' };
}

/** 生成聚合数据（全程无大模型调用，预期 < 1 秒） */
async function buildPayload(userId) {
  const { region, from } = await resolveRegion(userId);
  const city = weatherService.normalizedCityName(region) || region;

  const [forecast, crops, benefit, pushes] = await Promise.all([
    weatherService.getForecast(city).catch(() => null),
    UserCrop.findAll({ where: { userId, status: 1 }, order: [['id', 'ASC']] }).catch(() => []),
    benefitService.summary(userId).catch(() => null),
    AdvisoryPush.findAll({
      where: { userId, pushDate: todayStr() },
      order: [['id', 'DESC']],
      limit: 1
    }).catch(() => [])
  ]);

  const daily = forecast && forecast.daily ? forecast.daily : [];
  const today = daily[0] || null;

  let advice = { available: false, count: 0, maxSeverity: 0, items: [], notice: null };
  if (daily.length) {
    const built = await advisory.buildAdvice(city, 3).catch(() => null);
    if (built && built.weatherAvailable) {
      const list = built.advice || [];
      advice = {
        available: true,
        count: list.length,
        maxSeverity: list.reduce((m, a) => Math.max(m, a.severity || 0), 0),
        items: list.slice(0, 5).map(a => ({
          ruleId: a.ruleId,
          productName: a.productName,
          growthStage: a.growthStage,
          riskType: a.riskType,
          riskLabel: a.riskLabel,
          severity: a.severity,
          triggerDetail: a.triggerDetail,
          adviceText: a.adviceText
        })),
        notice: null
      };
    } else {
      advice = { available: false, count: 0, maxSeverity: 0, items: [], notice: (built && built.notice) || '暂无农事风险数据' };
    }
  } else {
    advice = { available: false, count: 0, maxSeverity: 0, items: [], notice: '未获取到该区域预报，农事提醒无法生成' };
  }

  const brief = pushes[0] || null;

  return {
    region: city,
    regionFrom: from,
    weather: {
      available: !!today,
      updateTime: forecast ? forecast.updateTime : null,
      stale: forecast ? !!forecast.stale : false,
      today: today
        ? {
            fxDate: today.fxDate,
            textDay: today.textDay,
            tempMin: today.tempMin,
            tempMax: today.tempMax,
            precip: today.precip,
            humidity: today.humidity,
            windScaleDay: today.windScaleDay
          }
        : null,
      notice: today ? null : '暂未获取到该区域预报'
    },
    advice,
    crops: crops.map(c => ({
      id: c.id,
      cropType: c.cropType,
      region: c.region,
      area: c.area,
      currentStage: c.currentStage,
      createTime: c.createTime
    })),
    benefit: benefit
      ? { total: benefit.total, count: benefit.count, byModule: benefit.byModule, recent: benefit.recent, estimateNotice: benefit.estimateNotice }
      : null,
    brief: brief
      ? { date: brief.pushDate, content: brief.content, source: brief.source, generatedAt: brief.createdAt }
      : null,
    caliber: '天气与农事提醒来自 15 天/7 天预报与规则引擎；收益为平台估算值'
  };
}

/** 生成（或覆盖）当日快照 */
async function generate(userId) {
  const startedAt = Date.now();
  const date = todayStr();
  try {
    const payload = await buildPayload(userId);
    const durationMs = Date.now() - startedAt;
    const json = JSON.stringify(payload);
    const existing = await DashboardSnapshot.findOne({ where: { userId, snapshotDate: date } });
    if (existing) {
      await existing.update({ status: 'ok', errorMessage: null, payload: json, durationMs, generatedAt: new Date() });
    } else {
      await DashboardSnapshot.create({ userId, snapshotDate: date, status: 'ok', errorMessage: null, payload: json, durationMs });
    }
    return { status: 'ok', payload, durationMs, date };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const existing = await DashboardSnapshot.findOne({ where: { userId, snapshotDate: date } });
    if (existing) {
      await existing.update({ status: 'error', errorMessage: String(err.message || err).slice(0, 300), durationMs, generatedAt: new Date() });
    } else {
      await DashboardSnapshot.create({ userId, snapshotDate: date, status: 'error', errorMessage: String(err.message || err).slice(0, 300), durationMs });
    }
    console.error('[dashboardSnapshot] 生成失败:', err.message);
    return { status: 'error', error: String(err.message || err), durationMs, date };
  }
}

/**
 * 读取当日快照；不存在时即时生成一次（保证页面永不空白）
 * @param {number} userId
 * @param {boolean} force true = 忽略缓存强制重算（手动刷新）
 */
async function getSnapshot(userId, force = false) {
  const date = todayStr();
  if (!force) {
    const hit = await DashboardSnapshot.findOne({ where: { userId, snapshotDate: date } });
    if (hit) {
      let payload = null;
      if (hit.payload) {
        try { payload = JSON.parse(hit.payload); } catch { payload = null; }
      }
      return {
        status: hit.status,
        errorMessage: hit.errorMessage,
        date: hit.snapshotDate,
        generatedAt: hit.generatedAt,
        durationMs: hit.durationMs,
        cached: true,
        payload
      };
    }
  }
  const r = await generate(userId);
  if (r.status === 'ok') {
    const row = await DashboardSnapshot.findOne({ where: { userId, snapshotDate: date } });
    return {
      status: 'ok',
      errorMessage: null,
      date,
      generatedAt: row ? row.generatedAt : new Date(),
      durationMs: r.durationMs,
      cached: false,
      payload: r.payload
    };
  }
  return {
    status: 'error',
    errorMessage: r.error,
    date,
    generatedAt: new Date(),
    durationMs: r.durationMs,
    cached: false,
    payload: null
  };
}

/** 每日定时：为所有有种作物的用户各生成一次（幂等：当天已有则跳过） */
async function runDailySnapshots() {
  const date = todayStr();
  const cropRows = await UserCrop.findAll({ where: { status: 1 }, attributes: ['userId'], raw: true });
  const userIds = [...new Set(cropRows.map(r => r.userId))];

  let created = 0;
  let skipped = 0;
  for (const userId of userIds) {
    const hit = await DashboardSnapshot.findOne({ where: { userId, snapshotDate: date } });
    if (hit) { skipped++; continue; }
    const r = await generate(userId);
    if (r.status === 'ok') created++;
  }
  return { date, userCount: userIds.length, created, skipped };
}

/** 调度器：每小时检查，06:30 之后且当天尚无快照则生成 */
function initScheduler() {
  const HOUR = 60 * 60 * 1000;
  const tick = async () => {
    try {
      const now = new Date();
      const minutes = now.getHours() * 60 + now.getMinutes();
      if (minutes < 390) return; // 06:30 之前不生成
      const date = todayStr();
      const already = await DashboardSnapshot.count({ where: { snapshotDate: date } });
      if (already > 0) return;
      const r = await runDailySnapshots();
      console.log(`[dashboardSnapshot] ${r.date} 生产总览快照生成完成：新生成 ${r.created}，跳过 ${r.skipped}`);
    } catch (err) {
      console.error('[dashboardSnapshot] 定时生成失败:', err.message);
    }
  };
  setTimeout(tick, 45 * 1000);
  setInterval(tick, HOUR);
  console.log('[dashboardSnapshot] 生产总览快照定时任务已启动（每日 06:30 后，每小时检查一次）');
}

module.exports = { getSnapshot, generate, runDailySnapshots, initScheduler, todayStr };
