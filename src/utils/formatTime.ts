/** 全站时间格式化工具（原 ForumView / PostInteraction / FertilizeView 等 6 处各写一份） */

/**
 * 相对时间：<1 小时「刚刚」、<24 小时「N 小时前」、<7 天「N 天前」，更早显示绝对时间
 * 用于论坛帖子、评论等社交内容流
 */
export const formatRelativeTime = (time: any): string => {
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return '—';
  const diff = Date.now() - date.getTime();
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  if (diff < HOUR) return '刚刚';
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} 天前`;
  return date.toLocaleString();
};

/**
 * 绝对时间：本地时区 yyyy/M/d HH:mm:ss，无效值归一为「—」
 * 用于「生成于 …」「已留存 · 生成于 …」等需要精确时刻的场景
 */
export const formatDateTime = (t?: string | null): string => {
  if (!t) return '—';
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('zh-CN', { hour12: false });
};
