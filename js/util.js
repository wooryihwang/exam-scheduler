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

  // ---------------------------------------------------------------- 저장 폴더 (작업 파일을 넣을 곳)
  // 크롬·엣지에서는 폴더를 한 번 골라 두면 그 안의 [폴더 이름] 폴더에 작업 파일(JSON)을 바로 저장한다.
  // 고른 폴더(권한 핸들)는 이 컴퓨터의 브라우저 저장소(IndexedDB)에만 기억한다. 지원하지 않으면 다운로드 폴더로 내려받는다.
  const KV_DB = 'exam-web-settings';
  const kv = (mode, fn) => new Promise((ok, fail) => {
    if (!window.indexedDB) return fail(new Error('no indexedDB'));
    const r = indexedDB.open(KV_DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onerror = () => fail(r.error);
    r.onsuccess = () => {
      const tx = r.result.transaction('kv', mode), q = fn(tx.objectStore('kv'));
      tx.oncomplete = () => { r.result.close(); ok(q && q.result); };
      tx.onerror = () => { r.result.close(); fail(tx.error); };
    };
  });
  let saveDir = null;
  const saveDirLoaded = kv('readonly', (s) => s.get('saveDir')).then((x) => { saveDir = x || null; }).catch(() => {});
  const safeFolder = (s) => String(s || '').replace(/[\\/:*?"<>|]/g, '').trim();
  U.saveDir = {
    supported: typeof window.showDirectoryPicker === 'function',
    loaded: saveDirLoaded,
    /** 고른 폴더 이름 ('' = 안 고름) */
    name: () => (saveDir ? saveDir.name : ''),
    /** 저장 폴더를 골라 두었는가 */
    has: () => !!saveDir,
    /** 저장 위치 안내 글자: '문서\고사시간표 작업파일' */
    /** 저장 위치 안내 글자: '문서\\고사시간표 작업파일' (+ '\\1학년') */
    where: (sub2) => {
      if (!saveDir) return '';
      const parts = [saveDir.name, safeFolder(window.Store && Store.saveFolder ? Store.saveFolder() : ''), safeFolder(sub2)].filter(Boolean);
      return parts.join('\\');
    },
    /** 폴더 자동 저장 상태 (main.js 가 채움): perm 'granted'|'prompt'|'denied'|'none', last 마지막 저장 시각 */
    status: { perm: 'none', last: 0 },
    async permission() { await saveDirLoaded; if (!saveDir) return 'none'; try { return await saveDir.queryPermission({ mode: 'readwrite' }); } catch (e) { return 'denied'; } },
    /** 사용자가 누른 순간에만 부를 수 있음 (브라우저 권한 창) */
    async request() { await saveDirLoaded; if (!saveDir) return 'none'; try { return await saveDir.requestPermission({ mode: 'readwrite' }); } catch (e) { return 'denied'; } },
    /** 자동 저장용: 권한이 이미 있을 때만 조용히 쓴다. 성공하면 저장 위치 글자 */
    writeAuto: (name, data, sub2) => writeToSaveDir(name, data instanceof Blob ? data : new Blob([data], { type: 'application/json' }), sub2, false),
    async pick() {
      const hd = await window.showDirectoryPicker({ id: 'exam-save', mode: 'readwrite' });
      saveDir = hd;
      try { await kv('readwrite', (s) => s.put(hd, 'saveDir')); } catch (e) { /* 기억 못 해도 이번 실행에서는 씀 */ }
      return hd.name;
    },
    async clear() { saveDir = null; try { await kv('readwrite', (s) => s.delete('saveDir')); } catch (e) { /* 무시 */ } },
  };
  /** 고른 폴더에 파일을 쓴다. 성공하면 저장 위치 글자, 아니면 '' */
  async function writeToSaveDir(name, blob, sub2, ask = true) {
    await saveDirLoaded;
    if (!saveDir) return '';
    try {
      let perm = await saveDir.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted' && ask) perm = await saveDir.requestPermission({ mode: 'readwrite' });
      U.saveDir.status.perm = perm;
      if (perm !== 'granted') return '';
      let d = saveDir;
      for (const part of [safeFolder(window.Store && Store.saveFolder ? Store.saveFolder() : ''), safeFolder(sub2)]) if (part) d = await d.getDirectoryHandle(part, { create: true });
      const fh = await d.getFileHandle(name, { create: true });
      const w = await fh.createWritable(); await w.write(blob); await w.close();
      U.saveDir.status.last = Date.now();
      return U.saveDir.where(sub2);
    } catch (e) { return ''; }
  }
  /** 작업 파일(JSON) 저장: 저장 폴더를 골라 두었으면 그 폴더에, 아니면 다운로드 폴더로 */
  U.saveWork = async (name, data, sub2) => {
    const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/json' });
    const where = await writeToSaveDir(name, blob, sub2);
    if (where) { U.toast(`저장 폴더(${where})에 저장했습니다: ${name}`, 'ok'); return where; }
    U.download(name, blob);
    return '';
  };

  U.readFile = (file, as = 'arrayBuffer') => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    if (as === 'text') r.readAsText(file, 'utf-8'); else r.readAsArrayBuffer(file);
  });

  window.U = U;
})();
