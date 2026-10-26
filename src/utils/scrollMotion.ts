/**
 * 页面滚动动效（零依赖）
 *
 * 1) 进场：页面级区块进入视口时淡入 + 上移 22px，同批元素按 DOM 顺序错峰 70ms。
 * 2) 视差：桌面端（≥992px）横幅正文随滚动做小幅位移，制造纵深，移动端不做以免抖动。
 *
 * 性能约定
 * - 只写 opacity / transform / translate（合成层属性），不触发重排；
 * - 滚动监听 passive + requestAnimationFrame 合帧，一帧最多读一次 rect；
 * - 元素进场后立即 unobserve，观察器常驻但不累积工作。
 *
 * 降级与可访问性
 * - 未启用 JS / IntersectionObserver 不可用：不加隐藏类，内容原样可见；
 * - 系统「减弱动态效果」：整体不启用，横幅与区块都直接呈现。
 */

const READY = 'reveal-ready';
const PENDING = 'reveal-pending';
const RUNNING = 'is-revealed';
const DONE = 'reveal-done';

/** 只对页面级区块做进场，避免卡片内部的每一行都动起来 */
const BLOCK_SELECTOR = '.page-main .page-container > *';
/** 自带入场动画或需要稳定显隐的元素，跳过 */
const SKIP_SELECTOR = '.page-hero, .prod-nav, .page-shell, .skip-link';

let started = false;
let observer: IntersectionObserver | null = null;
let domObserver: MutationObserver | null = null;
let reduceMotion: MediaQueryList | null = null;
let wideScreen: MediaQueryList | null = null;
let parallaxFrame = 0;
let scanFrame = 0;
let heroBodies: HTMLElement[] = [];
const seen = new WeakSet<Element>();

/** 进场动画结束（或超时兜底）后交还样式，避免 animation-fill 残留影响后续交互 */
function finishReveal(el: HTMLElement): void {
  el.classList.remove(RUNNING);
  el.classList.add(DONE);
}

function reveal(el: HTMLElement): void {
  if (!el.isConnected) return;
  el.classList.remove(PENDING);
  el.classList.add(RUNNING);
  const delay = Number.parseFloat(getComputedStyle(el).getPropertyValue('--reveal-delay')) || 0;
  let settled = false;
  let timer = 0;
  const settle = () => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timer);
    el.removeEventListener('animationend', settle);
    finishReveal(el);
  };
  el.addEventListener('animationend', settle);
  // 动画被禁用（如系统减弱动效中途生效）时 animationend 不触发，用超时兜底
  timer = window.setTimeout(settle, delay + 900);
}

/** 扫描（并接管）当前文档里的页面级区块；路由切换后重复调用即可 */
export function scanRevealTargets(root: ParentNode = document): void {
  if (!started) return;
  heroBodies = Array.from(document.querySelectorAll<HTMLElement>('.page-hero-body'));

  const nodes = Array.from(root.querySelectorAll<HTMLElement>(BLOCK_SELECTOR));
  let index = 0;
  for (const el of nodes) {
    if (seen.has(el) || el.hasAttribute('data-no-reveal') || el.matches(SKIP_SELECTOR)) continue;
    // 隐藏容器（v-show / display:none）内的元素不处理，展示后由下一次扫描接管
    if (!el.offsetParent && el.offsetWidth === 0) continue;
    seen.add(el);
    // 同批错峰：最多 3 档（0/60/120ms），既有节奏又不会让晚到的区块等太久
    el.style.setProperty('--reveal-delay', `${Math.min(index, 2) * 60}ms`);
    index += 1;

    if (!observer) {
      el.classList.add(DONE);
      continue;
    }
    el.classList.add(PENDING);
    observer.observe(el);
  }

  if (wideScreen?.matches) updateParallax();
}

/* ---------------- 新内容接管 ---------------- */

/** 合并同一帧内的多次 DOM 变化；rAF 在绘制前执行，接管时元素尚未上屏，不会闪一下 */
function scheduleScan(): void {
  if (scanFrame) return;
  scanFrame = window.requestAnimationFrame(() => {
    scanFrame = 0;
    scanRevealTargets();
  });
}

function bindDomObserver(): void {
  if (typeof MutationObserver === 'undefined') return;
  domObserver = new MutationObserver((records) => {
    for (const record of records) {
      if (record.addedNodes.length > 0) {
        scheduleScan();
        return;
      }
    }
  });
  domObserver.observe(document.body, { childList: true, subtree: true });
}

/* ---------------- 横幅视差 ---------------- */

function updateParallax(): void {
  parallaxFrame = 0;
  if (!wideScreen?.matches) return;
  const vh = window.innerHeight;
  for (const el of heroBodies) {
    const rect = el.getBoundingClientRect();
    if (rect.bottom < -160 || rect.top > vh + 160) continue;
    // -1（在视口下方）→ 1（已滚出上方），只取 ±30px 的极小位移
    const offset = (vh / 2 - (rect.top + rect.height / 2)) / vh;
    const shift = Math.max(-26, Math.min(26, offset * 30));
    el.style.setProperty('--hero-shift', `${shift.toFixed(1)}px`);
  }
}

function onScroll(): void {
  if (parallaxFrame) return;
  parallaxFrame = window.requestAnimationFrame(updateParallax);
}

function bindParallax(): void {
  const supported = typeof CSS !== 'undefined' && CSS.supports?.('translate', '0 1px');
  if (!supported) return;
  wideScreen = window.matchMedia('(min-width: 992px)');
  const toggle = () => {
    window.removeEventListener('scroll', onScroll, { passive: true } as EventListenerOptions);
    if (wideScreen?.matches) {
      window.addEventListener('scroll', onScroll, { passive: true });
      updateParallax();
    } else {
      for (const el of heroBodies) el.style.removeProperty('--hero-shift');
    }
  };
  wideScreen.addEventListener('change', toggle);
  toggle();
}

/* ---------------- 生命周期 ---------------- */

export function initScrollMotion(): void {
  if (started) return;
  if (typeof window === 'undefined') return;

  reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduceMotion.matches) return; // 尊重系统设置：整页不做滚动动效
  if (typeof IntersectionObserver === 'undefined') return;

  started = true;
  document.documentElement.classList.add(READY);

  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        observer?.unobserve(el);
        reveal(el);
      }
    },
    // 提前 8% 触发，滚动到元素边缘时已开始淡入，不会出现"卡一下才出现"
    { root: null, rootMargin: '0px 0px -8% 0px', threshold: 0.01 }
  );

  bindParallax();
  bindDomObserver();
  scanRevealTargets();
}

export function disposeScrollMotion(): void {
  observer?.disconnect();
  observer = null;
  domObserver?.disconnect();
  domObserver = null;
  window.removeEventListener('scroll', onScroll, { passive: true } as EventListenerOptions);
  if (parallaxFrame) window.cancelAnimationFrame(parallaxFrame);
  if (scanFrame) window.cancelAnimationFrame(scanFrame);
  parallaxFrame = 0;
  scanFrame = 0;
  heroBodies = [];
  started = false;
  document.documentElement.classList.remove(READY);
}
