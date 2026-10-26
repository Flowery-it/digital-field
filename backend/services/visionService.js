/**
 * 拍照识病虫害（多模态 + 知识库保底）
 * ==================================
 *
 * 模型选择（用户明确要求）：**优先 Agents-A1**；不可用/不兼容/不满足时，
 * 降级到同网关的 deepseek-v4-flash-vision（实测 1 秒级，同一 Key）。
 *
 * 分工（与项目「规则引擎是保底层、AI 是增强层」一致）：
 *   - 多模态模型只负责「看」：描述可见症状、从候选集中挑最可能的病虫害；
 *   - **用药建议全部来自 pest_library.json 知识库**（公开资料整理），
 *     模型不自行编造药剂与用量；
 *   - 候选集按用户所选作物过滤，缩小判断范围、降低误判；
 *   - 识别不出时如实说「无法确定」，不硬给结论。
 */

const fs = require('fs');
const path = require('path');
const llmService = require('./llmService');
const aiGen = require('./aiGenerationService');
const { auditNumbers } = require('./numberAudit');

const LIB_PATH = path.join(__dirname, '..', 'seed', 'pest_library.json');
const library = JSON.parse(fs.readFileSync(LIB_PATH, 'utf8'));

const DISCLAIMER = 'AI 拍照识别仅供参考，不能替代专业检疫与农技人员诊断；用药请按标签说明并咨询当地农技指导。';

// 模型链：Agents-A1 优先（用户指定），视觉专用模型兜底
const VISION_MODELS = ['Agents-A1', 'deepseek-v4-flash-vision'];

const MAX_IMAGE_BYTES = 6 * 1024 * 1024; // 6MB，超出拒绝（网关限制 + 流量考虑）

/** 按作物过滤候选病虫害；未指定作物时用全集 */
function candidates(crop) {
  const name = String(crop || '').trim();
  if (!name) return library.pests;
  const hit = library.pests.filter(p => (p.crops || []).some(c => name.includes(c) || c.includes(name)));
  return hit.length ? hit : library.pests;
}

/** 从模型回答中解析出的病虫害名 → 知识库条目（精确/包含匹配） */
function matchLibrary(answer, list) {
  const text = String(answer || '');
  // 优先匹配被明确列为「最可能」的项
  for (const p of list) {
    if (text.includes(p.name)) return p;
  }
  return null;
}

function buildPrompt(list, crop) {
  const lines = list.map((p, i) =>
    `${i + 1}）${p.name}：典型症状「${p.symptoms}」（多发于 ${p.crops.join('、')}）`
  ).join('\n');
  return [
    '你是一名植保视觉判读助手。请仔细观察这张作物照片，按以下格式输出：',
    '第一行：最可能的病虫害名称（只能从下方候选列表中选择一个，若都不像则写「无法确定」）；',
    '第二行：你在照片中看到的可见症状证据（只描述看得见的，不臆测）；',
    '第三行：置信度（高/中/低）。',
    '',
    crop ? `用户说明作物为：${crop}` : '用户未说明作物',
    '候选病虫害列表：',
    lines
  ].join('\n');
}

/** 组装最终建议文本（症状来自模型观察，用药来自知识库） */
function composeText(observed, pest, crop) {
  const parts = [];
  if (pest) {
    parts.push(`识别结果：${pest.name}（${pest.part}部位病害/虫害）。`);
    parts.push(`照片可见症状：${observed}`);
    parts.push(`防治建议：${pest.chemical} ${pest.dose} ${pest.doseUnit}，${pest.action}`);
    parts.push(`发病规律参考：${pest.risk}。`);
  } else {
    parts.push('识别结果：无法从照片中确定病虫害种类。');
    parts.push(`照片可见情况：${observed}`);
    parts.push('建议：换一张更清晰、聚焦病斑部位的照片重试，或到「农事问答」描述症状咨询；必要时请植保人员现场诊断。');
  }
  if (crop) parts.push(`（已按作物「${crop}」缩小判断范围）`);
  parts.push(DISCLAIMER);
  return parts.join('\n');
}

/**
 * 拍照识别
 * @param {object} opts { imageBase64, mime?, crop?, region? }
 * @returns {Promise<{ok, observation?, pest?, text?, source, model?, attempted?, audit?}>}
 */
async function analyze(opts = {}) {
  const raw = String(opts.imageBase64 || '');
  // 兼容「data:image/...;base64,xxx」与纯 base64
  const m = raw.match(/^data:([^;]+);base64,(.+)$/);
  const mime = opts.mime || (m ? m[1] : 'image/jpeg');
  const b64 = m ? m[2] : raw;
  if (!b64 || b64.length < 64) {
    const err = new Error('图片数据为空或过小，请重新选择照片');
    err.code = 'BAD_IMAGE';
    throw err;
  }
  const bytes = Buffer.from(b64, 'base64').length;
  if (bytes > MAX_IMAGE_BYTES) {
    const err = new Error(`图片过大（${(bytes / 1024 / 1024).toFixed(1)}MB），请压缩到 6MB 以内`);
    err.code = 'IMAGE_TOO_LARGE';
    throw err;
  }

  const crop = String(opts.crop || '').trim();
  const list = candidates(crop);
  const dataUrl = `data:${mime};base64,${b64}`;
  const messages = [{
    role: 'user',
    content: [
      { type: 'text', text: buildPrompt(list, crop) },
      { type: 'image_url', image_url: { url: dataUrl } }
    ]
  }];

  // 依次尝试 Agents-A1 → deepseek-v4-flash-vision（用户指定的优先/降级顺序）
  const attempted = [];
  let lastError = null;
  for (const model of VISION_MODELS) {
    try {
      const result = await llmService.chat(messages, { model, maxTokens: 2000 });
      const pest = matchLibrary(result.text, list);
      const text = composeText(extractObservation(result.text), pest, crop);
      return {
        ok: true,
        observation: extractObservation(result.text),
        pest: pest ? {
          id: pest.id,
          name: pest.name,
          part: pest.part,
          chemical: pest.chemical,
          dose: pest.dose,
          doseUnit: pest.doseUnit,
          action: pest.action,
          risk: pest.risk
        } : null,
        text,
        source: 'llm',
        model,
        attempted,
        audit: auditNumbers(text, [pest ? pest.chemical : '', pest ? `${pest.dose} ${pest.doseUnit}` : ''])
      };
    } catch (err) {
      attempted.push({ model, ok: false, error: err.message });
      lastError = err;
      console.warn(`[vision] 模型 ${model} 调用失败，尝试下一个:`, err.message);
    }
  }
  const err = new Error(`视觉模型均不可用：${lastError ? lastError.message : '未知错误'}`);
  err.code = 'VISION_UNAVAILABLE';
  throw err;
}

/** 从回答中取「可见症状证据」一段（第二行起、置信度行前） */
function extractObservation(answer) {
  const lines = String(answer || '').split('\n').map(s => s.trim()).filter(Boolean);
  if (!lines.length) return '未能从照片中读出明确症状';
  // 去掉首行（结论）与末行（置信度）
  const body = lines.slice(1).filter(l => !/^置信度/.test(l));
  return (body.length ? body.join('；') : lines.join('；')).replace(/^[：:\s]+/, '').slice(0, 300);
}

/** 生成并留存（用户每次拍照都是主动重新生成，覆盖上一次） */
async function refresh(userId, opts) {
  const scopeKey = String(opts.crop || 'default');
  try {
    const data = await analyze(opts);
    await aiGen.save(userId, 'vision', scopeKey, data, 'llm');
    return { found: true, payload: data, generatedAt: new Date() };
  } catch (err) {
    if (err.code === 'BAD_IMAGE' || err.code === 'IMAGE_TOO_LARGE') throw err;
    await aiGen.saveError(userId, 'vision', scopeKey, err.message);
    throw err;
  }
}

module.exports = { analyze, refresh, candidates, DISCLAIMER, VISION_MODELS };
