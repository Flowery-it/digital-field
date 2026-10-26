/**
 * AI 生成结果持久化服务（通用）
 * ============================
 *
 * 需求（2026-10-16）：所有 AI 生成的项目在用户首次生成后持久化保留，
 * 切换页面再返回不丢失、不重置，持续显示直到用户主动触发重新生成。
 *
 * 统一语义（各模块路由遵循同一套契约）：
 *   GET  <路由>            → 只读：命中返回 { found:true, payload, generatedAt, source }；
 *                            未命中返回 { found:false }，**不触发生成**（避免每次进页面都调大模型）
 *   POST <路由>/refresh    → 用户主动生成/重新生成：执行生成函数 → 持久化 → 返回 payload
 *
 * 生成函数由各模块注入（闭包内调用自己的引擎 + 大模型），本服务只负责存取。
 */

const { AiGeneration } = require('../models');

/** 读取已留存结果（不生成） */
async function get(userId, module, scopeKey) {
  const row = await AiGeneration.findOne({ where: { userId, module, scopeKey } });
  if (!row || row.status !== 'ok' || !row.payload) return null;
  let payload = null;
  try { payload = JSON.parse(row.payload); } catch { payload = null; }
  if (!payload) return null;
  return { payload, generatedAt: row.generatedAt, source: row.source };
}

/** 写入/覆盖留存结果 */
async function save(userId, module, scopeKey, payload, source = 'llm') {
  const json = JSON.stringify(payload);
  const existing = await AiGeneration.findOne({ where: { userId, module, scopeKey } });
  if (existing) {
    await existing.update({ payload: json, source, status: 'ok', errorMessage: null, generatedAt: new Date() });
  } else {
    await AiGeneration.create({ userId, module, scopeKey, payload: json, source, status: 'ok' });
  }
}

/** 记录失败（保留上一次成功结果不被覆盖，仅当无成功记录时落 error） */
async function saveError(userId, module, scopeKey, message) {
  const existing = await AiGeneration.findOne({ where: { userId, module, scopeKey } });
  if (existing && existing.status === 'ok' && existing.payload) return; // 有成功记录就不动
  if (existing) {
    await existing.update({ status: 'error', errorMessage: String(message).slice(0, 300) });
  } else {
    await AiGeneration.create({ userId, module, scopeKey, status: 'error', errorMessage: String(message).slice(0, 300) });
  }
}

/**
 * 生成并持久化（用户主动触发）
 * @param {Function} generator 异步函数，返回 payload 对象（需含 source 字段或由 source 参数指定）
 * @param {string} source 覆盖 generator 返回的 source
 */
async function refresh(userId, module, scopeKey, generator, source) {
  try {
    const payload = await generator();
    const finalSource = source || (payload && payload.source) || 'llm';
    await save(userId, module, scopeKey, payload, finalSource);
    return { ok: true, payload, source: finalSource, generatedAt: new Date() };
  } catch (err) {
    await saveError(userId, module, scopeKey, err.message);
    return { ok: false, error: String(err.message || err) };
  }
}

module.exports = { get, save, saveError, refresh };
