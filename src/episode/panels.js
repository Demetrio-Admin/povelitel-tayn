// Accessible DOM panels above the canvas. Long move lists scroll inside the viewport.
import './panels.css';
export function node(tag, text, className) {
  const e = document.createElement(tag); if (text != null) e.textContent = text; if (className) e.className = className; return e;
}
export function button(text, onClick, className = '') {
  const e = node('button', text, className); e.type = 'button'; e.addEventListener('click', onClick); return e;
}
export function panel(title, { onClose } = {}) {
  const root = node('div', null, 'ep-overlay');
  const body = node('section', null, 'ep-panel'); body.setAttribute('role', 'dialog'); body.setAttribute('aria-modal', 'true'); body.setAttribute('aria-label', title);
  const heading = node('header'); heading.append(node('h1', title));
  const close = () => { root.remove(); onClose?.(); };
  if (onClose) heading.append(button('Закрыть', close, 'ep-close'));
  const content = node('div', null, 'ep-content'), footer = node('footer');
  body.append(heading, content, footer); root.append(body); document.getElementById('game').append(root);
  root.addEventListener('keydown', e => {
    if (e.key === 'Escape' && onClose) close();
    if (e.key === 'Tab') {
      const buttons = [...root.querySelectorAll('button:not(:disabled)')];
      if (!buttons.length) return;
      if (e.shiftKey && document.activeElement === buttons[0]) { e.preventDefault(); buttons.at(-1).focus(); }
      else if (!e.shiftKey && document.activeElement === buttons.at(-1)) { e.preventDefault(); buttons[0].focus(); }
    }
  });
  queueMicrotask(() => root.querySelector('button')?.focus());
  return { root, body, content, footer, close };
}
