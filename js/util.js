/* 공통 유틸: 이스케이프, 모달, 토스트, 날짜, 파일 저장 */
(function () {
  'use strict';
  const U = {};

  U.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  U.$ = (sel, el = document) => el.querySelector(sel);
  U.$$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const parseDate = (s) => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  /** 2026-06-25 → 2026. 6. 25.(목) */
  U.fmtDate = (s) => { const d = parseDate(s); return d ? `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.(${WD[d.getDay()]})` : ''; };
  /** 2026-06-25 → 6.25.(목) */
  U.fmtDateShort = (s) => { const d = parseDate(s); return d ? `${d.getMonth() + 1}.${d.getDate()}.(${WD[d.getDay()]})` : ''; };
  U.today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  // ---------------------------------------------------------------- 토스트
  U.toast = (msg, type = 'info') => {
    const root = document.getElementById('toast-root');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3000);
  };

  // ---------------------------------------------------------------- 모달
  /**
   * U.modal({ title, body(html), wide, buttons:[{label, value, cls}], onMount(el, close) }) → Promise(value)
   */
  U.modal = (opt) => new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    const buttons = opt.buttons || [{ label: '확인', value: true, cls: 'primary' }];
    wrap.innerHTML = `
      <div class="modal ${opt.wide ? 'wide' : ''}" role="dialog" aria-modal="true">
        <div class="modal-head"><h3>${U.esc(opt.title || '')}</h3><button class="icon-btn" data-close aria-label="닫기">✕</button></div>
        <div class="modal-body">${opt.body || ''}</div>
        <div class="modal-foot">${buttons.map((b, i) => `<button class="btn ${b.cls || ''}" data-i="${i}">${U.esc(b.label)}</button>`).join('')}</div>
      </div>`;
    const close = (v) => { wrap.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') close(undefined); };
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap || e.target.closest('[data-close]')) return close(undefined);
      const b = e.target.closest('.modal-foot [data-i]');
      if (b) close(buttons[+b.dataset.i].value);
    });
    document.addEventListener('keydown', onKey);
    root.appendChild(wrap);
    if (opt.onMount) opt.onMount(wrap.querySelector('.modal'), close);
    const primary = wrap.querySelector('.modal-foot .primary');
    (primary || wrap.querySelector('.modal-foot button'))?.focus();
  });

  U.confirm = (msg, title = '확인', okLabel = '예') => U.modal({
    title, body: `<p class="pre">${U.esc(msg)}</p>`,
    buttons: [{ label: '아니요', value: false }, { label: okLabel, value: true, cls: 'primary' }],
  }).then((v) => v === true);

  U.alert = (msg, title = '알림') => U.modal({ title, body: `<p class="pre">${U.esc(msg)}</p>` });

  U.alertList = (title, lead, items) => U.modal({
    title,
    body: `<p>${U.esc(lead)}</p><ul class="msg-list">${items.slice(0, 40).map((x) => `<li>${U.esc(x)}</li>`).join('')}${items.length > 40 ? `<li>… 외 ${items.length - 40}건</li>` : ''}</ul>`,
  });

  // ---------------------------------------------------------------- 파일
  U.download = (name, data, type = 'application/json') => {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  U.readFile = (file, as = 'arrayBuffer') => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    if (as === 'text') r.readAsText(file, 'utf-8'); else r.readAsArrayBuffer(file);
  });

  window.U = U;
})();
