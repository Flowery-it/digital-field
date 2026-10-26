const fs = require('fs');
const path = require('path');
const axios = require('axios');

/**
 * 天气服务层
 * 方案 5.3 要求：
 *   1. 服务端缓存 3-6 小时，禁止按用户请求实时透传上游 API
 *   2. 城市编码、上游调用、缓存逻辑收敛到一处，避免多路由各写一份
 */

// 和风天气 API Key：仅从环境变量（backend/.env）读取，严禁硬编码——代码包会公开分发
const QWEATHER_API_KEY = process.env.QWEATHER_API_KEY || '';
const QWEATHER_HOST = process.env.QWEATHER_HOST || 'https://kk4d92hd6y.re.qweatherapi.com';
const CITY_LIST_CSV = path.join(__dirname, '..', '..', 'China-City-List-latest.csv');

// 缓存时长：方案要求 3-6 小时，默认 4 小时，可用环境变量调整
const CACHE_TTL_MS = (parseFloat(process.env.WEATHER_CACHE_TTL_HOURS) || 4) * 60 * 60 * 1000;

// 内存缓存：city -> { data, expiresAt, fetchedAt }
const forecastCache = new Map();

// 城市编码缓存，避免每次请求都重读 3241 行 CSV
let provinceIndex = null;
let nameIndex = null;

/**
 * 解析城市列表 CSV，建立两个索引：
 *   provinceIndex: 省份 -> [{code, name}]
 *   nameIndex: 城市名 -> code（同名城市保留第一个编码）
 * CSV 列: $1 Location_ID, $3 城市名称, $8 一级行政区划, $10 二级行政区划
 * 地级市判定: 二级行政区划 === 城市名 + "市"
 */
function loadCityIndexes() {
  if (provinceIndex && nameIndex) return;

  provinceIndex = {};
  nameIndex = {};
  try {
    // 文件带 BOM，Node 不支持 'utf-8-sig' 编码名，需用 utf8 读取后手动剥离
    const content = fs.readFileSync(CITY_LIST_CSV, 'utf8').replace(/^\uFEFF/, '');
    const lines = content.split(/\r?\n/);

    // 跳过第一行版本声明与第二行表头
    for (let i = 2; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cols = line.split(',');
      if (cols.length < 10) continue;

      const code = cols[0].trim();
      const name = cols[2].trim();
      const adm1 = cols[7].trim();
      const adm2 = cols[9].trim();

      if (!code || !name || !adm1) continue;
      // 只保留地级市，过滤县/区
      if (adm2 !== `${name}市`) continue;

      if (!provinceIndex[adm1]) provinceIndex[adm1] = [];
      provinceIndex[adm1].push({ code, name });
      if (!nameIndex[name]) nameIndex[name] = code;
    }
    console.log(`[weatherService] 城市编码加载完成，共 ${Object.keys(provinceIndex).length} 个省级行政区`);
  } catch (err) {
    console.error('[weatherService] 城市列表解析失败:', err.message);
  }
}

/**
 * 城市名归一化（修复「石家庄市」查不到编码导致首页天气整体不可用）
 *
 * 根因：CSV 里的城市名不带「市」（name=石家庄），而 dim_market.city 等业务表
 * 存的是带后缀的行政名（石家庄市）。两者口径不一致 → 任何按业务表城市名请求
 * 天气的链路都会 404。此处在服务层统一兼容，业务侧无需各自清洗。
 */
function stripAdminSuffix(city) {
  return String(city || '')
    .trim()
    .replace(/(市辖区|地区|自治州|盟)$/u, '')
    .replace(/市$/u, '');
}

function cityCodeOf(city) {
  loadCityIndexes();
  const raw = String(city || '').trim();
  if (!raw) return null;
  if (nameIndex[raw]) return nameIndex[raw];
  // 逐级容错：带「市」后缀 → 全角空格 → 去掉「省」前缀（如「河北省石家庄市」）
  const candidates = [
    stripAdminSuffix(raw),
    raw.replace(/\s+/gu, ''),
    stripAdminSuffix(raw.replace(/\s+/gu, '')),
    stripAdminSuffix(raw.replace(/^.*?(省|自治区)/u, ''))
  ];
  for (const c of candidates) {
    if (c && nameIndex[c]) return nameIndex[c];
  }
  return null;
}

/** 归一化后的城市名（用于回显，避免前端拿到带后缀的原始值） */
function normalizedCityName(city) {
  const code = cityCodeOf(city);
  if (!code) return null;
  const name = Object.keys(nameIndex).find(k => nameIndex[k] === code);
  return name || null;
}

// 城市 -> 所属省份反查（供天气页按 query 城市定位到正确省份）
// 同样走归一化：业务表存「石家庄市」也能反查到「河北省」
function provinceOf(city) {
  loadCityIndexes();
  const normalized = normalizedCityName(city);
  if (!normalized) return null;
  for (const [province, list] of Object.entries(provinceIndex)) {
    if (list.some(c => c.name === normalized)) return province;
  }
  return null;
}

function getCities(province) {
  loadCityIndexes();
  return provinceIndex[province] || [];
}

function getProvinces() {
  loadCityIndexes();
  return Object.keys(provinceIndex);
}

// 原始 daily 数组 -> 统一数值类型（和风天气的数值字段全是字符串）
function normalizeDaily(list) {
  return (list || []).map(d => ({
    fxDate: d.fxDate,
    textDay: d.textDay,
    textNight: d.textNight,
    tempMax: parseInt(d.tempMax, 10),
    tempMin: parseInt(d.tempMin, 10),
    windDirDay: d.windDirDay,
    windScaleDay: d.windScaleDay,
    windDirNight: d.windDirNight,
    windScaleNight: d.windScaleNight,
    precip: parseFloat(d.precip) || 0,
    humidity: parseInt(d.humidity, 10),
    pressure: d.pressure,
    vis: d.vis,
    uvIndex: d.uvIndex,
    sunrise: d.sunrise,
    sunset: d.sunset
  }));
}

/**
 * 获取城市 7 日天气预报（带服务端缓存）
 * @returns {Promise<{city, cityCode, updateTime, daily, cached, cacheAgeMinutes}|null>}
 *   cached=true 表示来自缓存；失败返回 null
 */
async function getForecast(city) {
  const code = cityCodeOf(city);
  if (!code) return null;

  // 命中且未过期
  const hit = forecastCache.get(city);
  const now = Date.now();
  if (hit && hit.expiresAt > now) {
    return {
      ...hit.data,
      cached: true,
      cacheAgeMinutes: Math.round((now - hit.fetchedAt) / 60000)
    };
  }

  // 未配置 Key 时直接失败（由路由层给出明确提示），不发起无谓的上游请求
  if (!QWEATHER_API_KEY) {
    console.error('[weatherService] 未配置 QWEATHER_API_KEY（backend/.env），跳过上游请求');
    return null;
  }

  // 未命中：请求上游
  try {
    const resp = await axios.get(`${QWEATHER_HOST}/v7/weather/7d`, {
      params: { key: QWEATHER_API_KEY, location: code },
      timeout: 10000,
      // 禁用 axios 自动读取 HTTP_PROXY/HTTPS_PROXY 环境变量。
      // 环境里若注入了 http 代理，https 请求会被当成明文发往 443，
      // 和风天气会返回 "plain HTTP request was sent to HTTPS port"。
      proxy: false
    });

    if (!resp.data || resp.data.code !== '200') {
      console.error(`[weatherService] 和风天气返回异常: code=${resp.data && resp.data.code}`);
      // 上游异常时退回旧缓存（即便过期也好过直接失败）
      if (hit) {
        return { ...hit.data, cached: true, cacheAgeMinutes: Math.round((now - hit.fetchedAt) / 60000), stale: true };
      }
      return null;
    }

    const data = {
      city,
      cityCode: code,
      updateTime: resp.data.updateTime,
      daily: normalizeDaily(resp.data.daily)
    };
    forecastCache.set(city, { data, expiresAt: now + CACHE_TTL_MS, fetchedAt: now });
    console.log(`[weatherService] ${city} 天气已更新并缓存（TTL ${CACHE_TTL_MS / 3600000} 小时）`);
    return { ...data, cached: false, cacheAgeMinutes: 0 };
  } catch (err) {
    const reason = err.response ? `HTTP ${err.response.status}` : err.code || err.message;
    console.error(`[weatherService] 获取${city}天气失败:`, reason);
    if (hit) {
      return { ...hit.data, cached: true, cacheAgeMinutes: Math.round((now - hit.fetchedAt) / 60000), stale: true };
    }
    return null;
  }
}

// 15 天预报独立缓存（动态品种推荐的气象风险因子用；与 7 天缓存互不干扰）
const forecast15Cache = new Map();

/**
 * 获取城市 15 天天气预报（带独立缓存）
 * 与 getForecast 同模式：未配置 Key / 上游异常时退回顾缓存或返回 null
 * @returns {Promise<{city, cityCode, updateTime, daily, cached, stale?}|null>}
 */
async function getForecast15(city) {
  const code = cityCodeOf(city);
  if (!code) return null;

  const hit = forecast15Cache.get(city);
  const now = Date.now();
  if (hit && hit.expiresAt > now) {
    return { ...hit.data, cached: true, cacheAgeMinutes: Math.round((now - hit.fetchedAt) / 60000) };
  }

  if (!QWEATHER_API_KEY) {
    console.error('[weatherService] 未配置 QWEATHER_API_KEY（backend/.env），跳过 15 天预报上游请求');
    return null;
  }

  try {
    const resp = await axios.get(`${QWEATHER_HOST}/v7/weather/15d`, {
      params: { key: QWEATHER_API_KEY, location: code },
      timeout: 10000,
      proxy: false
    });

    if (!resp.data || resp.data.code !== '200') {
      console.error(`[weatherService] 和风天气 15 天预报返回异常: code=${resp.data && resp.data.code}`);
      if (hit) return { ...hit.data, cached: true, cacheAgeMinutes: Math.round((now - hit.fetchedAt) / 60000), stale: true };
      return null;
    }

    const data = {
      city,
      cityCode: code,
      updateTime: resp.data.updateTime,
      daily: normalizeDaily(resp.data.daily)
    };
    forecast15Cache.set(city, { data, expiresAt: now + CACHE_TTL_MS, fetchedAt: now });
    console.log(`[weatherService] ${city} 15 天预报已更新并缓存`);
    return { ...data, cached: false, cacheAgeMinutes: 0 };
  } catch (err) {
    const reason = err.response ? `HTTP ${err.response.status}` : err.code || err.message;
    console.error(`[weatherService] 获取${city} 15 天预报失败:`, reason);
    if (hit) return { ...hit.data, cached: true, cacheAgeMinutes: Math.round((now - hit.fetchedAt) / 60000), stale: true };
    return null;
  }
}

// 缓存状态（供数据说明页与运维排查）
function getCacheStats() {
  const now = Date.now();
  const entries = [];
  forecastCache.forEach((v, k) => {
    entries.push({
      city: k,
      ageMinutes: Math.round((now - v.fetchedAt) / 60000),
      expired: v.expiresAt <= now
    });
  });
  return { ttlHours: CACHE_TTL_MS / 3600000, size: forecastCache.size, entries };
}

module.exports = { getForecast, getForecast15, getCities, getProvinces, cityCodeOf, provinceOf, normalizedCityName, getCacheStats };
