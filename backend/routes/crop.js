const express = require('express');
const { Op } = require('sequelize');
const CropData = require('../models/CropData');
const { CROP_CATEGORY, GRAIN_CROPS, CASH_CROPS, VEG_CROPS, FRUIT_CROPS, CATEGORY_CROPS } = require('../config/crops');

const router = express.Router();

// 获取作物数据列表
router.get('/list', async (req, res) => {
  try {
    const { cropType, year, region, page = 1, limit = 10 } = req.query;
    
    const where = {};
    if (cropType) where.cropType = cropType;
    if (year) where.year = year;
    if (region) where.region = region;
    
    const offset = (page - 1) * limit;
    
    const { count, rows } = await CropData.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
    res.status(200).json({
      code: 200,
      message: '获取成功',
      data: {
        list: rows,
        total: count,
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取失败', data: null });
  }
});

// 获取作物数据详情
router.get('/detail/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const cropData = await CropData.findByPk(id);
    
    if (!cropData) {
      return res.status(404).json({ code: 404, message: '数据不存在', data: null });
    }
    
    res.status(200).json({ code: 200, message: '获取成功', data: cropData });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取失败', data: null });
  }
});

// 获取作物类型列表（按大类分组，供前端下拉分组展示）
router.get('/types', async (req, res) => {
  try {
    const types = await CropData.findAll({
      attributes: ['cropType'],
      group: ['cropType']
    });

    const grouped = { total: [], grain: [], cash: [], vegetable: [], fruit: [] };
    types.forEach(item => {
      const c = CROP_CATEGORY[item.cropType];
      if (c && grouped[c]) grouped[c].push(item.cropType);
    });

    res.status(200).json({
      code: 200,
      message: '获取成功',
      data: grouped
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取失败', data: null });
  }
});

// 获取地区列表
router.get('/regions', async (req, res) => {
  try {
    const regions = await CropData.findAll({
      attributes: ['region'],
      group: ['region']
    });
    
    res.status(200).json({ 
      code: 200, 
      message: '获取成功', 
      data: regions.map(item => item.region) 
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取失败', data: null });
  }
});

// 获取年份列表
router.get('/years', async (req, res) => {
  try {
    const years = await CropData.findAll({
      attributes: ['year'],
      group: ['year'],
      order: [['year', 'ASC']]
    });
    
    res.status(200).json({ 
      code: 200, 
      message: '获取成功', 
      data: years.map(item => item.year) 
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取失败', data: null });
  }
});

// 获取图表数据（作物产量可视化）
// 支持按地区、作物类型、作物大类筛选；不传地区时按「年份+作物」跨地区汇总，
// 保证「全部地区」视图与单选地区视图口径一致、可对比。
// 大类口径（category）：
//   grain     —— 基本粮食作物品种分量（默认，避免合计与分量同图重复）
//   cash      —— 经济作物（全国总量为公报真实数据，省级为产区带分摊模型）
//   vegetable —— 蔬菜（全国总量为公报真实数据，省级为产区带分摊模型）
//   fruit     —— 水果（含「水果」合计与苹果/柑橘单品，合计为公报真实数据）
//   total     —— 粮食（合计），统计局分省真实数据
// 显式指定 cropType 时优先按单品种过滤。
router.get('/chart', async (req, res) => {
  try {
    const { region, cropType, category } = req.query;

    const where = {};
    if (region) where.region = region;
    if (cropType) {
      where.cropType = cropType;
    } else if (CATEGORY_CROPS[category]) {
      where.cropType = { [Op.in]: CATEGORY_CROPS[category] };
    } else {
      // 默认：基本粮食作物品种分量（剔除「粮食」合计口径）
      where.cropType = { [Op.in]: GRAIN_CROPS };
    }

    const rows = await CropData.findAll({
      where,
      order: [['year', 'ASC'], ['cropType', 'ASC']]
    });

    // 按「年份 + 作物」聚合：产量求和，价格按产量加权平均
    const bucket = {};
    const yearSet = new Set();
    const cropSet = new Set();
    rows.forEach(r => {
      const key = `${r.year}|${r.cropType}`;
      yearSet.add(r.year);
      cropSet.add(r.cropType);
      if (!bucket[key]) bucket[key] = { yieldSum: 0, priceWeighted: 0 };
      bucket[key].yieldSum += Number(r.yield) || 0;
      bucket[key].priceWeighted += (Number(r.yield) || 0) * (Number(r.price) || 0);
    });

    const yieldData = Object.keys(bucket).map(key => {
      const [year, type] = key.split('|');
      const b = bucket[key];
      return {
        year: Number(year),
        cropType: type,
        yield: Math.round(b.yieldSum * 100) / 100,
        price: b.yieldSum > 0 ? Math.round((b.priceWeighted / b.yieldSum) * 100) / 100 : null
      };
    });

    res.status(200).json({
      code: 200,
      message: '获取成功',
      data: {
        years: Array.from(yearSet).sort((a, b) => a - b),
        cropTypes: Array.from(cropSet).sort(),
        yieldData
      }
    });
  } catch (error) {
    console.error('[crop] 获取图表数据失败:', error);
    res.status(500).json({ code: 500, message: '获取失败', data: null });
  }
});

module.exports = router;
