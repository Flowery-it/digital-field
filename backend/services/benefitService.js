/**
 * AI 助农收益量化（增强层）
 * ==========================
 *
 * 把「AI 值多少钱」变成可追溯的数字：
 *   1. 每个功能模块的采纳动作都可以记一条台账（带依据 basis）；
 *   2. 累计收益 = 明细之和，前端可验算；
 *   3. 年度报告由大模型基于台账数字生成（数字审计防编造），
 *      未接入/失败时回退确定性文本。
 *
 * 口径红线：所有金额都是**估算**（estimate），界面必须标注；
 * 我们不把估算收益包装成已实现的真金白银。
 */

const { fn, col, Op } = require('sequelize');
const { BenefitLedger } = require('../models');
const llmService = require('./llmService');
const { auditNumbers } = require('./numberAudit');

const MODULE_LABELS = {
  recommend: 'AI 品种推荐',
  fertilize: '精准施肥打药',
  forecast: '价格预测',
  match: '产销对接'
};

const MODULES = Object.keys(MODULE_LABELS);
const MAX_BASIS = 200;
const MAX_AMOUNT = 100000000; // 单条上限 1 亿元，防误输入

async function record(userId, { module, item, amountYuan, basis }) {
  if (!MODULES.includes(module)) {
    const err = new Error(`module 必须是 ${MODULES.join(' / ')} 之一`);
    err.code = 'BAD_MODULE';
    throw err;
  }
  const itemStr = String(item || '').trim();
  if (!itemStr || itemStr.length > 64) {
    const err = new Error('条目名称不能为空且不超过 64 字');
    err.code = 'BAD_ITEM';
    throw err;
  }
  const amount = Number(amountYuan);
  if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > MAX_AMOUNT) {
    const err = new Error('金额必须是非零数字且在合理范围内');
    err.code = 'BAD_AMOUNT';
    throw err;
  }
  const basisStr = String(basis || '').trim();
  if (!basisStr) {
    const err = new Error('估算依据不能为空（收益必须可追溯）');
    err.code = 'BAD_BASIS';
    throw err;
  }

  const row = await BenefitLedger.create({
    userId,
    module,
    item: itemStr,
    amountYuan: Number(amount.toFixed(2)),
    basis: basisStr.slice(0, MAX_BASIS)
  });
  return row;
}

/** 汇总：累计 + 分模块 + 最近明细 */
async function summary(userId) {
  const rows = await BenefitLedger.findAll({
    where: { userId },
    order: [['id', 'DESC']]
  });

  const byModule = {};
  rows.forEach(r => {
    const key = r.module;
    if (!byModule[key]) byModule[key] = { module: key, label: MODULE_LABELS[key] || key, amount: 0, count: 0 };
    byModule[key].amount += Number(r.amountYuan);
    byModule[key].count += 1;
  });
  Object.values(byModule).forEach(m => { m.amount = Number(m.amount.toFixed(2)); });

  const total = Number(rows.reduce((s, r) => s + Number(r.amountYuan), 0).toFixed(2));

  return {
    total,
    count: rows.length,
    byModule: Object.values(byModule).sort((a, b) => b.amount - a.amount),
    recent: rows.slice(0, 10).map(r => ({
      id: r.id,
      module: r.module,
      moduleLabel: MODULE_LABELS[r.module] || r.module,
      item: r.item,
      amountYuan: Number(r.amountYuan),
      basis: r.basis,
      createTime: r.createTime
    })),
    estimateNotice: '以上金额为平台按公开口径估算的增收/节本，非实际到账收入。'
  };
}

/** 年度报告：数字全部来自台账，大模型只做文字组织（带数字审计） */
async function annualReport(userId, year) {
  const y = year ? parseInt(year, 10) : new Date().getFullYear();
  if (!Number.isFinite(y) || y < 2000 || y > 2100) {
    const err = new Error('年份不合法');
    err.code = 'BAD_YEAR';
    throw err;
  }

  const rows = await BenefitLedger.findAll({
    where: {
      userId,
      createTime: { [Op.gte]: new Date(`${y}-01-01T00:00:00`), [Op.lt]: new Date(`${y + 1}-01-01T00:00:00`) }
    },
    order: [['id', 'ASC']]
  });

  const byModule = {};
  rows.forEach(r => {
    const key = MODULE_LABELS[r.module] || r.module;
    byModule[key] = (byModule[key] || 0) + Number(r.amountYuan);
  });
  const total = Number(rows.reduce((s, r) => s + Number(r.amountYuan), 0).toFixed(2));

  const facts = [
    `统计年度：${y} 年`,
    `采纳 AI 建议 ${rows.length} 次`,
    ...Object.entries(byModule).map(([k, v]) => `${k}：估算增收/节本 ${Number(v.toFixed(2))} 元`),
    `合计估算增收/节本：${total} 元`
  ];

  const status = llmService.status();
  if (!status.configured) {
    return {
      year: y,
      total,
      count: rows.length,
      byModule,
      report: `${y} 年度 AI 助农报告：${facts.slice(1).join('；')}。（本报告由本地台账数据生成，未调用大模型）`,
      source: 'rule-engine',
      estimateNotice: '以上金额为平台按公开口径估算的增收/节本，非实际到账收入。'
    };
  }

  const SYSTEM_PROMPT = [
    '你是「数字田野」平台的年度经营分析助手，服务对象是种植户与经销商。',
    '根据【台账数据】写一份年度 AI 助农报告，必须遵守：',
    '1）只使用【台账数据】中的数字，禁止编造任何数字；',
    '2）【台账数据】里出现的每个数字必须逐字照抄，禁止换算或四舍五入；',
    '3）结构：全年概览 → 分项明细 → 下一年优化建议（建议不涉及具体数字承诺）；',
    '4）控制在 300 字以内，中文口语化，不要使用 Markdown 标题或列表符号。'
  ].join('\n');

  try {
    const result = await llmService.chat([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `【台账数据】\n${facts.join('\n')}\n\n请生成 ${y} 年度 AI 助农报告。` }
    ]);
    return {
      year: y,
      total,
      count: rows.length,
      byModule,
      report: result.text,
      source: 'llm',
      audit: auditNumbers(result.text, facts),
      estimateNotice: '以上金额为平台按公开口径估算的增收/节本，非实际到账收入。'
    };
  } catch (err) {
    console.warn('[benefit] 大模型年报生成失败，回退台账文本:', err.message);
    return {
      year: y,
      total,
      count: rows.length,
      byModule,
      report: `${y} 年度 AI 助农报告：${facts.slice(1).join('；')}。（大模型暂不可用，本报告由本地台账数据生成）`,
      source: 'rule-engine',
      fallbackReason: `大模型调用失败（${err.message}），已回退本地台账文本`,
      estimateNotice: '以上金额为平台按公开口径估算的增收/节本，非实际到账收入。'
    };
  }
}

module.exports = { record, summary, annualReport, MODULE_LABELS, MODULES };
