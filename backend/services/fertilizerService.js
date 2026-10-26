/**
 * AI 精准施肥打药建议（保底层规则 + 大模型表达层）
 * ==============================================
 *
 * 输入：作物 × 生育期 × 区域 × 面积
 * 输出：基准施肥方案 + 气象调整建议 + 病虫害风险预警 + 节本估算
 *
 * 设计纪律（与项目整体一致）：
 *   1. **规则引擎是保底层**：施肥/打药建议全部来自
 *      `seed/fertilizer_standards.json` 的公开资料整理值 + 确定性气象规则，
 *      每条建议都带触发依据，可审计。
 *   2. **诚实标注**：本服务不是当地测土配方检测结果，用量属通用参考值，
 *      界面必须展示"请结合当地农技指导与实际地力"。
 *   3. **大模型只做表达**：把已算好的建议翻译成农户能读懂的话，
 *      数字逐字照抄 + auditNumbers 校验，失败回退确定性文案。
 */

const fs = require('fs');
const path = require('path');
const weatherService = require('./weatherService');
const { matchKeyword } = require('./recommendEngineService');
const llmService = require('./llmService');
const { auditNumbers } = require('./numberAudit');

const STD_PATH = path.join(__dirname, '..', 'seed', 'fertilizer_standards.json');
const std = JSON.parse(fs.readFileSync(STD_PATH, 'utf8'));

const DISCLAIMER = '以上为通用参考用量（公开农业技术资料整理），非当地测土配方检测结果，请结合实际地力与当地农技指导执行。';

function num(v, dft = 0) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : dft;
}

/** 作物名 → 施肥剖面（复用 M1 的 keywordRules 口径，保证两处作物归类一致） */
function profileOf(cropType) {
  const kw = matchKeyword(cropType);
  const profileKey = kw.profile;
  const profile = std.profiles[profileKey] || std.profiles.default;
  return { profileKey, profile, productId: kw.productId };
}

/** 生育期对齐：用户输入优先，其次按当前月份推断常见生育期，最后回退首个阶段 */
function resolveStage(requested, profile) {
  const stages = Object.keys(profile.stages);
  if (requested) {
    if (profile.stages[requested]) return { stage: requested, stages, source: 'user' };
    const hit = stages.find(s => requested.includes(s) || s.includes(requested));
    if (hit) return { stage: hit, stages, source: 'matched' };
  }
  return { stage: stages[0], stages, source: 'default' };
}

/** 气象规则命中判定（返回命中的规则 key 数组） */
function matchWeatherRules(daily) {
  if (!daily || !daily.length) return [];
  const first3 = daily.slice(0, 3);
  const rain3 = first3.reduce((s, d) => s + num(d.precip), 0);
  const rain7 = daily.reduce((s, d) => s + num(d.precip), 0);
  const maxTemp3 = Math.max(...first3.map(d => num(d.tempMax)));
  const maxHum = Math.max(...daily.map(d => num(d.humidity)));
  const maxWind = Math.max(...daily.map(d => {
    const s = String(d.windScaleDay || '0');
    return num(s.split('-').pop());
  }));

  const hit = [];
  if (rain3 > 50) hit.push('heavyRain');
  else if (rain3 > 30) hit.push('rain3d');
  if (rain7 < 5) hit.push('dry7d');
  if (maxTemp3 >= 32) hit.push('heat');
  if (maxHum >= 85) hit.push('humid');
  if (maxWind >= 6) hit.push('strongWind');
  return hit;
}

/** 病虫害风险判定：命中条件 → 高风险；未命中 → 观察 */
function evalPests(profile, daily) {
  if (!daily || !daily.length) return [];
  const maxHum = Math.max(...daily.map(d => num(d.humidity)));
  const rain3 = daily.slice(0, 3).reduce((s, d) => s + num(d.precip), 0);
  const tempMax = Math.max(...daily.map(d => num(d.tempMax)));
  const tempMin = Math.min(...daily.map(d => num(d.tempMin)));

  return (profile.pests || []).map(p => {
    const c = p.condition || {};
    const reasons = [];
    let hit = true;
    if (c.humidityGte !== undefined) {
      if (maxHum >= c.humidityGte) reasons.push(`最高湿度 ${maxHum}%（阈值 ≥${c.humidityGte}%）`);
      else hit = false;
    }
    if (c.tempIn) {
      const [lo, hi] = c.tempIn;
      if (tempMax >= lo && tempMin <= hi) reasons.push(`气温区间 ${tempMin}—${tempMax}℃（适宜 ${lo}—${hi}℃）`);
      else hit = false;
    }
    if (c.precip3dLt !== undefined) {
      if (rain3 < c.precip3dLt) reasons.push(`3 日降水仅 ${rain3.toFixed(1)}mm（＜${c.precip3dLt}mm）`);
      else hit = false;
    }
    return {
      name: p.name,
      trigger: p.trigger,
      hit,
      riskLevel: hit ? '高风险' : '观察',
      triggerDetail: reasons.length ? reasons.join('；') : '未来预报未满足触发条件',
      chemical: p.chemical,
      dose: p.dose,
      doseUnit: p.doseUnit,
      action: p.action
    };
  });
}

/**
 * 对外入口
 * @param {object} opts { cropType, stage?, region, area? }
 */
async function buildAdvice(opts = {}) {
  const cropType = String(opts.cropType || '').trim();
  const region = String(opts.region || '').trim();
  const area = opts.area ? Number(opts.area) : null;

  if (!cropType) {
    const err = new Error('请指定作物');
    err.code = 'BAD_CROP';
    throw err;
  }

  const { profileKey, profile } = profileOf(cropType);
  const { stage, stages, source: stageSource } = resolveStage(opts.stage, profile);
  const stageData = profile.stages[stage];

  const forecast = region ? await weatherService.getForecast15(region) : null;
  const daily = forecast && forecast.daily ? forecast.daily : [];
  const ruleHits = matchWeatherRules(daily);
  const pests = evalPests(profile, daily);

  const adjustments = ruleHits
    .filter(k => (stageData.weatherAdjust || []).includes(k))
    .map(k => ({ rule: k, label: std.weatherAdjustRules[k].label, action: std.weatherAdjustRules[k].action }));

  // 节本估算：命中"减量 10%"类规则时按 10% 计（口径写入 estimateBasis）
  const reduceHit = ruleHits.includes('rain3d') || ruleHits.includes('heavyRain');
  const saveRate = reduceHit ? 10 : 0;

  const bf = stageData.baseFertilizer || { n: 0, p: 0, k: 0, unit: '公斤/亩', material: '暂无数据' };
  const fertilizerTotal = area && area > 0
    ? {
        n: Number((bf.n * area).toFixed(1)),
        p: Number((bf.p * area).toFixed(1)),
        k: Number((bf.k * area).toFixed(1)),
        unit: `公斤（${area} 亩）`
      }
    : null;

  const result = {
    cropType,
    region: region || null,
    weatherAvailable: daily.length > 0,
    weatherNotice: daily.length ? null : '未获取到该区域预报，气象调整与病虫害预警暂不生成（保底建议仍可用）',
    profileLabel: profile.label,
    profileKey,
    stage,
    stageSource,
    stageOptions: stages,
    stageData,
    baseFertilizer: bf,
    fertilizerTotal,
    weatherHits: ruleHits.map(k => ({ key: k, label: std.weatherAdjustRules[k].label })),
    adjustments,
    pests,
    estimate: {
      saveRate,
      basis: reduceHit
        ? `命中强降雨规则，按氮肥减量 10% 估算（基准用量 ${bf.material}）`
        : '未触发减量规则，无节本估算',
      notice: '节本率为按公开口径的估算值，折算金额需结合当地肥料单价'
    },
    aiText: null,
    source: 'rule-engine',
    disclaimer: DISCLAIMER
  };

  // 大模型只做表达层
  const status = llmService.status();
  if (status.configured) {
    try {
      const lines = renderFacts(result);
      const res = await llmService.chat([
        { role: 'system', content: FERT_SYSTEM_PROMPT },
        { role: 'user', content: lines }
      ], { maxTokens: 4000 });
      result.aiText = res.text;
      result.source = 'llm';
      result.audit = auditNumbers(res.text, lines.split('\n'));
    } catch (err) {
      console.warn('[fertilizer] 大模型建议生成失败，回退规则文案:', err.message);
      result.aiText = renderFallbackText(result);
    }
  } else {
    result.aiText = renderFallbackText(result);
  }

  return result;
}

const FERT_SYSTEM_PROMPT = [
  '你是「数字田野」平台的农技助手，服务对象是种植户。',
  '根据【建议依据】输出一段田间作业指导，必须遵守：',
  '1）只使用【建议依据】中的数字与用量，禁止编造任何数字或药剂；',
  '2）【建议依据】里出现的每个数字必须逐字照抄，禁止换算或四舍五入；',
  '3）结构：今天该做什么（施肥 + 打药两类动作）→ 风险提示；',
  '4）控制在 250 字以内，中文口语化，不要使用 Markdown 标题或列表符号；',
  '6）结尾必须提醒：用量为通用参考值，请结合当地农技指导。'
].join('\n');

function renderFacts(r) {
  const lines = [];
  lines.push('【建议依据】');
  lines.push(`地点：${r.region || '未指定'}；作物：${r.cropType}（${r.profileLabel}）；生育期：${r.stage}`);
  lines.push(`基准施肥：折纯氮 ${r.baseFertilizer.n}、磷 ${r.baseFertilizer.p}、钾 ${r.baseFertilizer.k} ${r.baseFertilizer.unit}；物料：${r.baseFertilizer.material}`);
  if (r.fertilizerTotal) {
    lines.push(`按 ${r.fertilizerTotal.unit} 折算合计：氮 ${r.fertilizerTotal.n}、磷 ${r.fertilizerTotal.p}、钾 ${r.fertilizerTotal.k}`);
  }
  lines.push(`农事要点：${r.stageData.tasks.join('；')}`);
  if (r.adjustments.length) {
    lines.push('气象调整：');
    r.adjustments.forEach((a, i) => lines.push(`  ${i + 1}）${a.label}：${a.action}`));
  } else if (r.weatherAvailable) {
    lines.push('气象调整：未来预报未触发减量/避害规则，按常规方案执行。');
  } else {
    lines.push('气象调整：暂无该区域预报数据。');
  }
  const risky = r.pests.filter(p => p.hit);
  if (risky.length) {
    lines.push('病虫害预警：');
    risky.forEach((p, i) => lines.push(`  ${i + 1}）${p.name}（${p.riskLevel}，${p.triggerDetail}）：建议 ${p.chemical} ${p.dose} ${p.doseUnit}，${p.action}`));
  } else {
    lines.push('病虫害预警：未来预报未满足病害触发条件，维持常规监测。');
  }
  lines.push('】');
  return lines.join('\n');
}

function renderFallbackText(r) {
  const parts = [];
  parts.push(`${r.cropType}${r.stage}：按基准方案施肥——${r.baseFertilizer.material}（折纯氮磷钾 ${r.baseFertilizer.n}/${r.baseFertilizer.p}/${r.baseFertilizer.k} ${r.baseFertilizer.unit}）。`);
  if (r.adjustments.length) {
    parts.push(`气象调整：${r.adjustments.map(a => a.action).join('；')}`);
  }
  const risky = r.pests.filter(p => p.hit);
  if (risky.length) {
    parts.push(`病虫害预警：${risky.map(p => `${p.name}${p.riskLevel}，建议 ${p.chemical} ${p.dose} ${p.doseUnit}`).join('；')}。`);
  } else {
    parts.push('病虫害：未来预报未满足触发条件，维持常规监测。');
  }
  parts.push(`农事要点：${r.stageData.tasks.join('；')}。`);
  parts.push('（用量为通用参考值，请结合当地农技指导与实际地力）');
  return parts.join('\n');
}

module.exports = { buildAdvice, profileOf, stageOptions: std.stageOptions, DISCLAIMER, STD_PATH };
