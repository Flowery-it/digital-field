/**
 * 大模型输出数字一致性校验（可审计性设计）
 * ======================================
 *
 * 与 routes/ai.js 内联版同一套逻辑，抽出来供新增 AI 模块共用
 * （动态推荐理由、农事管家日报、年度收益报告）。
 * ai.js 保持原样不动，避免回归。
 *
 * 思路：把回答里的每个数字与注入给模型的实况上下文逐一比对，
 * 不匹配的数字原样列出来，由前端标注提醒——不把大模型输出当作可信事实，
 * 而是当作「待核对的建议」。这比事后靠人工发现更可控，
 * 也是「AI 辅助决策、人机共审」的具体体现。
 *
 * @param {string} answer 大模型回答文本
 * @param {string[]} sources 注入给模型的实况文本（从中提取允许出现的数字）
 * @returns {{checked:number, unverified:string[], passed:boolean}}
 */
function auditNumbers(answer, sources) {
  const allowed = new Set();
  (sources || []).forEach(s => {
    (String(s).match(/-?\d+(?:\.\d+)?/g) || []).forEach(n => allowed.add(n.replace(/^-/, '')));
  });
  // 允许模型复述常识性数字（如「未来三天」写成 3、节气日期、常见配比）
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 24, 30, 31, 40, 50, 60, 80, 100]
    .forEach(n => allowed.add(String(n)));

  const used = String(answer).match(/-?\d+(?:\.\d+)?/g) || [];
  const unverified = [...new Set(
    used
      .map(n => n.replace(/^-/, ''))
      .filter(n => !allowed.has(n))
  )];

  return {
    checked: used.length,
    unverified,
    passed: unverified.length === 0
  };
}

module.exports = { auditNumbers };
