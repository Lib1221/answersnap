import { t } from '@/ui/i18n';

// The floating "Tailor resume" button on LinkedIn job pages. It lives in a closed shadow root, so
// LinkedIn's styles can't reach it and page scripts can't read it. Built with DOM calls only: no
// HTML strings (hard rule 4).

export type ButtonState = 'idle' | 'busy' | 'done' | 'error';

export interface TailorButton {
  show(on: boolean): void;
  setState(state: ButtonState, message?: string): void;
  destroy(): void;
}

const CSS = `
:host { all: initial; }
.wrap {
  position: fixed;
  left: 20px;
  bottom: 20px;
  z-index: 2147483000;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  font: 600 14px/1.2 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 0 16px 0 12px;
  border: 0;
  border-radius: 999px;
  background: #2447b8;
  color: #fff;
  font: inherit;
  box-shadow: 0 4px 16px rgb(0 0 0 / 0.22);
  cursor: pointer;
  transition: background-color 0.15s ease, transform 0.15s ease;
}
button:hover { background: #1b3793; }
button:active { transform: translateY(1px); }
button:focus-visible { outline: 3px solid #93b4ff; outline-offset: 2px; }
button[aria-busy="true"] { cursor: progress; background: #1b3793; }
svg { width: 18px; height: 18px; flex: none; }
.status {
  max-width: 280px;
  margin: 0;
  padding: 8px 10px;
  border-radius: 10px;
  background: #fff;
  color: #1d1d1f;
  font-weight: 500;
  font-size: 13px;
  line-height: 1.35;
  box-shadow: 0 4px 16px rgb(0 0 0 / 0.18);
}
.status:empty { display: none; }
.status.error { background: #fbe3e6; color: #7a1020; }
@media (prefers-reduced-motion: reduce) { button { transition: none; } }
`;

function icon(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  // A page with a sparkle: a document made for this job.
  for (const d of [
    'M6 3h8l4 4v14H6z',
    'M14 3v4h4',
    'M9 12h6',
    'M9 16h4',
    'M19 11l.7 1.5L21 13l-1.3.5L19 15l-.7-1.5L17 13l1.3-.5z',
  ]) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.8');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.append(path);
  }
  return svg;
}

export function createTailorButton(onClick: () => void): TailorButton {
  const host = document.createElement('answersnap-tailor');
  // Closed, so page scripts can't reach in; open in e2e builds so tests can click it.
  const root = host.attachShadow({ mode: import.meta.env.MODE === 'e2e' ? 'open' : 'closed' });
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(CSS);
    root.adoptedStyleSheets = [sheet];
  } catch {
    const style = document.createElement('style');
    style.textContent = CSS;
    root.append(style);
  }

  const wrap = document.createElement('div');
  wrap.className = 'wrap';
  const status = document.createElement('p');
  status.className = 'status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.testid = 'linkedin-tailor';
  button.title = t(
    'li_tailor_title',
    'AnswerSnap: a resume and cover letter made for this job, from your master resume',
  );
  const label = document.createElement('span');
  label.textContent = t('li_tailor_button', 'Tailor resume');
  button.append(icon(), label);
  button.addEventListener('click', () => {
    if (button.getAttribute('aria-busy') !== 'true') onClick();
  });
  wrap.append(status, button);
  root.append(wrap);

  let clear = 0;
  return {
    // In LinkedIn's page only while shown: when the button is off, nothing of it is there.
    show(on) {
      if (on && !host.isConnected) (document.body ?? document.documentElement).append(host);
      if (!on) {
        host.remove();
        status.textContent = '';
      }
    },
    setState(state, message = '') {
      clearTimeout(clear);
      button.setAttribute('aria-busy', String(state === 'busy'));
      label.textContent =
        state === 'busy'
          ? t('li_tailor_opening', 'Opening…')
          : t('li_tailor_button', 'Tailor resume');
      status.textContent = message;
      status.className = state === 'error' ? 'status error' : 'status';
      if (state === 'done' || state === 'error')
        clear = window.setTimeout(() => (status.textContent = ''), state === 'error' ? 8000 : 4000);
    },
    destroy() {
      clearTimeout(clear);
      host.remove();
    },
  };
}
