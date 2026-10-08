// HTML-окна занимают только видимую часть игрового canvas, включая FIT-поля и клавиатуру.
// Рамка использует тот же painter, что и панели Phaser; содержимое остаётся обычным HTML.
import { paintPanel } from './uiPaint.js';
import { VIEW } from '../config/game.config.js';
import { UI } from '../config/ui.config.js';

export function bindGameOverlay(root, panel, content, { paintPanel: shouldPaint = true } = {}) {
  const canvas = document.querySelector?.('#game canvas');
  const viewport = window.visualViewport;
  let closed = false, frame = null, paintedSize = '';

  function paint() {
    if (!shouldPaint) return;
    const rect = panel.getBoundingClientRect?.();
    if (!rect?.width || !rect?.height) return;
    const width = Math.round(rect.width), height = Math.round(rect.height);
    const logicalWidth = window.__game?.scale?.width || VIEW.width;
    const unit = Math.min(1, (canvas?.getBoundingClientRect().width || root.getBoundingClientRect?.().width || logicalWidth) / logicalWidth);
    const size = `${width}x${height}:${unit}`;
    if (size === paintedSize) return;
    const surface = document.createElement('canvas');
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    surface.width = Math.ceil(width * scale); surface.height = Math.ceil(height * scale);
    const ctx = surface.getContext?.('2d');
    if (!ctx) return;
    ctx.scale(scale * unit, scale * unit);
    paintPanel(ctx, width / unit, height / unit, { variant: root.classList?.contains('acc-auth') ? 'dark' : 'wood', ornaments: true, alpha: 1 });
    panel.style.borderRadius = `${UI.radius * unit}px`;
    panel.style.backgroundImage = `url(${surface.toDataURL()})`;
    paintedSize = size;
  }

  function update() {
    frame = null;
    if (closed) return;
    const visible = {
      left: viewport?.offsetLeft || 0, top: viewport?.offsetTop || 0,
      width: viewport?.width || window.innerWidth,
      height: viewport?.height || window.innerHeight,
    };
    if (!visible.width || !visible.height) return;
    const rect = canvas?.getBoundingClientRect();
    const fit = Math.min(visible.width / VIEW.width, visible.height / VIEW.height);
    const fallback = { width: VIEW.width * fit, height: VIEW.height * fit,
      left: visible.left + (visible.width - VIEW.width * fit) / 2,
      top: visible.top + (visible.height - VIEW.height * fit) / 2 };
    const game = rect?.width && rect?.height ? rect : fallback;
    const left = Math.max(game.left, visible.left), top = Math.max(game.top, visible.top);
    const right = Math.min(game.left + game.width, visible.left + visible.width);
    const bottom = Math.min(game.top + game.height, visible.top + visible.height);
    Object.assign(root.style, {
      left: `${left}px`, top: `${top}px`,
      width: `${Math.max(0, right - left)}px`, height: `${Math.max(0, bottom - top)}px`,
    });
    paint();
    const active = document.activeElement;
    if (content.contains?.(active)) active.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }
  function schedule() {
    if (closed || frame !== null) return;
    if (window.requestAnimationFrame) frame = window.requestAnimationFrame(update);
    else update();
  }

  const observer = window.ResizeObserver ? new window.ResizeObserver(schedule) : null;
  if (canvas) observer?.observe(canvas);
  observer?.observe(panel);
  window.addEventListener('resize', schedule);
  window.addEventListener('scroll', schedule);
  viewport?.addEventListener('resize', schedule);
  viewport?.addEventListener('scroll', schedule);
  root.addEventListener('focusin', schedule);
  update();

  return () => {
    closed = true;
    if (frame !== null) window.cancelAnimationFrame?.(frame);
    observer?.disconnect();
    window.removeEventListener('resize', schedule);
    window.removeEventListener('scroll', schedule);
    viewport?.removeEventListener('resize', schedule);
    viewport?.removeEventListener('scroll', schedule);
    root.removeEventListener?.('focusin', schedule);
  };
}
