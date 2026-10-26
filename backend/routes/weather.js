const express = require('express');
const weatherService = require('../services/weatherService');

const router = express.Router();

// GET /api/weather/cities?province=河北省
// 获取地级市列表，默认返回河北省（与站点作物数据的地区范围一致）
router.get('/cities', (req, res) => {
  try {
    const province = req.query.province || '河北省';
    const list = weatherService.getCities(province);

    res.status(200).json({
      code: 200,
      message: '获取成功',
      data: {
        province,
        cities: list,
        provinces: weatherService.getProvinces()
      }
    });
  } catch (error) {
    console.error('[weather] 获取城市列表失败:', error);
    res.status(500).json({ code: 500, message: '获取城市列表失败', data: null });
  }
});

// GET /api/weather/locate?city=郑州
// 城市反查所属省份：供前端在跨页跳转（如市场详情 → 天气页）时定位到正确省份
router.get('/locate', (req, res) => {
  try {
    const city = (req.query.city || '').trim();
    if (!city) {
      return res.status(400).json({ code: 400, message: '城市参数不能为空', data: null });
    }
    const province = weatherService.provinceOf(city);
    if (!province) {
      return res.status(404).json({ code: 404, message: `未找到「${city}」`, data: null });
    }
    res.status(200).json({
      code: 200,
      message: '获取成功',
      data: { city, province, cityCode: weatherService.cityCodeOf(city) }
    });
  } catch (error) {
    console.error('[weather] 城市定位失败:', error);
    res.status(500).json({ code: 500, message: '获取失败', data: null });
  }
});

// GET /api/weather/forecast?city=石家庄
// 获取指定城市 7 日天气预报。
// 方案 5.3：上游调用与缓存收敛在 services/weatherService，
// 本路由不做实时透传，缓存周期 3-6 小时（默认 4 小时）。
router.get('/forecast', async (req, res) => {
  const city = (req.query.city || '').trim();
  if (!city) {
    return res.status(400).json({ code: 400, message: '城市参数不能为空', data: null });
  }

  if (!weatherService.cityCodeOf(city)) {
    return res.status(404).json({ code: 404, message: `未找到「${city}」的城市编码`, data: null });
  }

  try {
    const result = await weatherService.getForecast(city);
    if (!result) {
      // 区分「未配置 Key」与「上游暂不可用」，便于排查与评委现场定位
      const msg = process.env.QWEATHER_API_KEY
        ? '天气服务暂不可用，请稍后重试'
        : '天气服务未配置 API Key（请在 backend/.env 中配置 QWEATHER_API_KEY）';
      return res.status(502).json({ code: 502, message: msg, data: null });
    }

    res.status(200).json({
      code: 200,
      message: '获取成功',
      data: {
        city: result.city,
        cityCode: result.cityCode,
        updateTime: result.updateTime,
        daily: result.daily,
        // 缓存信息：cached=true 表示本次来自服务端缓存；stale=true 表示上游异常时退回的过期缓存
        cached: result.cached,
        cacheAgeMinutes: result.cacheAgeMinutes,
        stale: result.stale || false
      }
    });
  } catch (error) {
    console.error('[weather] 获取天气失败:', error);
    res.status(500).json({ code: 500, message: '获取失败', data: null });
  }
});

module.exports = router;
