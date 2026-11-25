/* 앱 셸: 내비게이션, 이벤트 위임, 끌어놓기, 백업 */
(function () {
  'use strict';
  const S = window.Store, V = window.Views, h = U.esc;
  const views = V.list;
  const viewEl = document.getElementById('view');
  let current = (location.hash || '').slice(1) || 'roster';
  if (!views.find((v) => v.id === current)) current = 'roster';

  const cur = () => views.find((v) => v.id === current);

  const fmtT = (t) => new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  function renderProjects() {
    const list = S.projects();
    const g = S.currentGrade();
    const multi = list.length > 1;
    document.getElementById('projects').innerHTML = `
      <div class="proj-label-row"><span class="proj-label">대상 학년 선택</span><span class="proj-cur">${g ? `${g}학년 작업 중` : '학년을 고르세요'}<button class="proj-add" data-act="proj-new" title="같은 학년의 다른 시험 등 작업 공간을 하나 더 만듭니다">＋</button></span></div>
      <div class="grade-pills" role="group" aria-label="작업 학년">${[1, 2, 3].map((n) => `<button class="gp g${n} ${g === n ? 'on' : ''}" data-act="side-grade" data-g="${n}" title="${n}학년 작업 열기"><i></i>${n}학년</button>`).join('')}</div>
      ${multi ? `<div class="proj-row">
        <select class="proj-select" data-gchange="proj-switch" aria-label="작업 공간">
          ${list.map((p) => `<option value="${h(p.id)}" ${p.current ? 'selected' : ''}>${h(p.name)}</option>`).join('')}
        </select>
        <button class="proj-btn" data-act="proj-rename" title="작업 공간 이름 변경">✎</button>
      </div>` : ''}`;
    const dot = document.getElementById('brand-dot');
    if (dot) dot.className = `brand-dot g${g || 0}`;
  }

  /** 단계 메뉴 아이콘 (선 아이콘, 24×24) */
  const ico = (d) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const NAV_ICONS = {
    roster: ico('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.6c2.3.2 4 1.6 4.5 4"/>'),
    basic: ico('<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
    subjects: ico('<path d="M12 3 3 8l9 5 9-5-9-5z"/><path d="m3 13 9 5 9-5"/>'),
    eval: ico('<rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="m8.5 12 2.5 2.5 4.5-5"/>'),
    stuSubj: ico('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6 1.4 0 2.6.4 3.5 1.1"/><path d="m15 17 2 2 4-4"/>'),
    timetable: ico('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
    placement: ico('<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>'),
    seats: ico('<path d="M6 11V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5"/><rect x="4" y="11" width="16" height="5" rx="1.5"/><path d="M6 16v4M18 16v4"/>'),
    special: ico('<circle cx="10" cy="8" r="3.2"/><path d="M4 19c.6-3 2.8-4.6 6-4.6"/><path d="M17 13v6M14 16h6"/>'),
    outputs: ico('<path d="M7 8V3.5h10V8"/><rect x="3.5" y="8" width="17" height="8" rx="2"/><path d="M7 13.5h10V20H7z"/>'),
  };

  const SEL_BADGE = { special: '선택' };
  function renderNav() {
    renderProjects();
    const steps = views.filter((v) => v.id !== 'outputs' && v.id !== 'home');
    const out = views.find((v) => v.id === 'outputs');
    const tabs = (V.outputsTabs && V.outputsTabs()) || [];
    const curTab = V.outputsTab ? V.outputsTab() : '';
    document.getElementById('nav').innerHTML = '<div class="nav-sec">작성 단계</div>' + steps.map((v) => `
      <button class="nav-item ${v.id === current ? 'on' : ''} ${v.status() ? 'done' : ''}" data-act="go" data-view="${v.id}">
        <span class="nav-ico" aria-hidden="true">${NAV_ICONS[v.id] || ''}</span><span class="nav-label-text">${v.no}. ${h(v.title)}</span>${SEL_BADGE[v.id] ? `<span class="nav-sel" title="해당 학생이 있을 때만 쓰는 단계">${SEL_BADGE[v.id]}</span>` : `<span class="nav-dot" title="${v.status() ? '확정' : '미확정'}"></span>`}
      </button>`).join('') +
      (out ? `<div class="nav-sec reports"><span>인쇄 및 출력물</span><span class="en">REPORTS</span></div><div class="nav-subs">` + tabs.map(([k, l]) => `
      <button class="nav-item sub ${current === 'outputs' && curTab === k ? 'on' : ''} ${out.status() ? 'done' : ''}" data-act="go-out" data-tab="${k}">
        <span class="nav-ico" aria-hidden="true">${NAV_ICONS.outputs}</span><span class="nav-label-text">${h(l)}</span>
      </button>`).join('') + '</div>' : '');
    const g = S.currentGrade();
    const lb = S.lastBackup();
    const atHome = current === 'home';
    document.getElementById('top-seg').innerHTML = atHome ? '' : `<div class="seg-wrap" role="group" aria-label="작업 학년">${[1, 2, 3].map((n) => `<button class="tseg g${n} ${g === n ? 'on' : ''}" data-act="side-grade" data-g="${n}" title="${n}학년 작업 열기"><i></i>${n}학년</button>`).join('')}</div>`;
    const ttl = S.state.rows.length ? S.title() : S.currentProject().name;
    document.getElementById('crumbs').innerHTML = atHome ? '<span class="top-title">첫 화면</span><span class="top-sub">모든 학년 공통 설정</span>' : `<span class="top-title" title="${h(ttl)}">${h(ttl)}</span><button class="btn text xs" data-act="proj-rename" title="이름 바꾸기">✎ 수정</button>`;
    const fs = U.saveDir.status, hasDir = U.saveDir.has();
    const folderChip = !hasDir ? '' : fs.perm === 'granted'
      ? `<button class="sync-chip folder on" data-act="go" data-view="home" data-tip="바뀐 내용을 저장 폴더(${h(U.saveDir.where())})의 학년 폴더에 자동으로 저장합니다."><i></i>폴더 저장 ${fs.last ? fmtT(fs.last) : '켜짐'}</button>`
      : `<button class="sync-chip folder warn" data-act="folder-grant" data-tip="저장 폴더에 쓰려면 한 번 허용해야 합니다. 눌러서 허용하세요."><i></i>폴더 저장 허용 필요</button>`;
    document.getElementById('progress').innerHTML =
      (atHome ? '' : `<button class="btn dark sm" data-act="backup" title="현재 학년 작업 전체를 작업 파일(JSON)로 저장합니다 (저장 폴더를 정했으면 그 학년 폴더에)">💾 작업 파일 다운로드</button>`) + folderChip +
      `<button class="sync-chip ${S.autoSaveOn() && lb ? 'on' : ''}" data-act="snapshot" data-tip="${S.autoSaveOn() ? '바뀐 내용을 2분마다 기록으로 남깁니다. 눌러서 원하는 시점으로 되돌릴 수 있습니다.' : '자동 저장이 꺼져 있습니다. 사이드바 [자동 저장]에서 켤 수 있습니다.'}"><i></i>${!S.autoSaveOn() ? '자동 저장 꺼짐' : lb ? `자동 저장 ${fmtT(lb)}` : '자동 저장 켜짐'}</button>`;
    const ab = document.getElementById('autosave-btn'); if (ab) { ab.classList.toggle('off', !S.autoSaveOn()); ab.title = S.autoSaveOn() ? '자동 저장 켜짐 · 2분마다 기록 (눌러서 끄기·사용량)' : '자동 저장 꺼짐 (눌러서 켜기)'; }
    const si = S.storageInfo(), note = document.querySelector('.side-note');
    if (note) note.innerHTML = si.mode === 'file' ? `자료는 이 컴퓨터의 <b>data 폴더</b>에 파일로 저장됩니다.<br><span class="muted" title="${h(si.dir)}">${h(si.dir)}</span>` : '데이터는 이 브라우저에만 저장되며 서버로 전송되지 않습니다.';
  }

  function render(keepFocus) {
    // 학년별 배경색 (1 노랑, 2 초록, 3 빨강)
    const g = current === 'home' ? 0 : S.currentGrade();
    if (document.body.dataset.grade !== String(g || '')) document.body.dataset.grade = g || '';
    document.body.classList.toggle('at-home', current === 'home');
    if (document.body.dataset.theme !== S.theme()) document.body.dataset.theme = S.theme();
    let focus = null;
    const a = document.activeElement;
    if (keepFocus && a && a.dataset && a.dataset.change) focus = { sel: `[data-change="${a.dataset.change}"]${a.dataset.f ? `[data-f="${a.dataset.f}"]` : ''}`, pos: a.selectionStart };
    const scroll = [...viewEl.querySelectorAll('.table-wrap')].map((el) => [el.scrollTop, el.scrollLeft]);
    viewEl.innerHTML = cur().render();
    [...viewEl.querySelectorAll('.table-wrap')].forEach((el, i) => { if (scroll[i]) [el.scrollTop, el.scrollLeft] = scroll[i]; });
    renderNav();
    // 2: 안내 띠 안의 'N. 단계명' 을 누르면 그 단계로 이동
    viewEl.querySelectorAll('.banner b').forEach((b) => {
      const m = b.textContent.match(/^(\d+)\.\s/); const v = m && views.find((x) => x.no === +m[1]);
      if (v) { b.classList.add('step-link'); b.dataset.act = 'go'; b.dataset.view = v.id; b.title = `${v.title} 단계로 이동`; }
    });
    // 2: 단계를 마쳤으면 아래에 '다음 단계 →'
    const idx = views.findIndex((v) => v.id === current), nx = views[idx + 1];
    if (nx && cur().status() && !viewEl.querySelector('.empty')) viewEl.insertAdjacentHTML('beforeend', `<div class="next-step"><span class="muted">이 단계는 마쳤습니다.</span><button class="btn primary" data-act="go" data-view="${nx.id}">다음 단계: ${nx.no}. ${h(nx.title)} →</button></div>`);
    viewEl.querySelectorAll('input[type="search"][data-filter]').forEach(applyFilter);
    // 고사 시행 시간: 가려진 일차가 있을 때만 스크롤 안내 표시
    const ds = viewEl.querySelector('[data-day-scroll]'), hint = viewEl.querySelector('[data-scroll-hint]');
    if (ds && hint) requestAnimationFrame(() => { hint.hidden = ds.scrollHeight <= ds.clientHeight + 2; });
    if (focus) { const el = viewEl.querySelector(focus.sel); if (el) { el.focus(); try { el.setSelectionRange(focus.pos, focus.pos); } catch (e) { /* number 등 */ } } }
  }
  V.setRerender(render);
  V.setOutputsRerender(render);
  V.setSpecialRerender && V.setSpecialRerender(render);
  V.setHomeRerender && V.setHomeRerender(() => { if (current === 'home') render(); });
  S.subscribe(() => render(true));

  function go(id) {
    current = id; history.replaceState(null, '', '#' + id);
    document.body.classList.remove('nav-open');
    render(); window.scrollTo(0, 0);
  }

  // ---------------------------------------------------------------- 클릭
  const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)}MB` : n >= 1024 ? `${Math.round(n / 1024)}KB` : `${n || 0}B`);
  /** 작업 공간 하나를 작업 파일(JSON)로 내려받는다 */
  function downloadProject(p) {
    const json = S.projectJSON(p.id);
    if (!json) return;
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
    U.saveWork(`${gradeFolder(p)}_${stamp}_저장.json`, json, autoFolder(p));
  }
  /** 저장 시각 글자: 20261125_0905 */
  function stampNow() { const d = new Date(), p2 = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}`; }
  /** 학년 저장 폴더: '1학년 자동저장' */
  function autoFolder(p) { return `${gradeFolder(p)} 자동저장`; }
  /** 저장 폴더 안의 학년 폴더 이름: '1학년' (작업 공간 이름) */
  function gradeFolder(p) { return String((p && p.name) || '작업').replace(/[\\/:*?"<>|]/g, '').trim() || '작업'; }

  // ---------------------------------------------------------------- 저장 폴더 자동 저장
  // 바뀐 학년 작업을 3초 뒤 [저장 폴더]\[폴더 이름]\[N학년]\고사배치_N학년_자동저장.json 에 덮어쓴다.
  // 브라우저는 다시 켤 때마다 폴더 권한을 한 번 물을 수 있어, 그때는 화면을 처음 누르는 순간 허용을 묻는다.
  const folderPending = new Set();
  let folderTimer = 0, folderAsked = false;
  function queueFolderSave(id) {
    if (!U.saveDir.has()) return;
    const pid = id || (S.currentProject() || {}).id;
    if (!pid) return;
    folderPending.add(pid);
    clearTimeout(folderTimer);
    folderTimer = setTimeout(flushFolder, 3000);
  }
  // 자동 저장 파일: [N학년 자동저장]\N학년_날짜_시간.json. 바뀔 때마다 쓰되, 10분 안에는 새 파일을 늘리지 않고
  // 가장 최근 파일을 지금 시각 이름으로 바꿔 쓴다(10분에 하나꼴). 학년마다 자동 저장 파일은 최근 100개만 남긴다.
  const AUTO_GAP = 10 * 60 * 1000, AUTO_KEEP = 100;
  const lastAuto = {};
  async function flushFolder() {
    const ids = [...folderPending]; folderPending.clear();
    let wrote = false;
    for (const id of ids) {
      const p = S.projects().find((x) => x.id === id); if (!p) continue;
      const json = S.projectJSON(id); if (!json) continue;
      const name = `${gradeFolder(p)}_${stampNow()}.json`, prev = lastAuto[id];
      const replace = prev && Date.now() - prev.t < AUTO_GAP ? prev.name : '';
      const w = await U.saveDir.writeAuto(name, json, autoFolder(p), replace);
      if (w) {
        wrote = true;
        lastAuto[id] = { name, t: replace ? prev.t : Date.now() };
        if (!replace) { const g = gradeFolder(p) + '_'; U.saveDir.prune(autoFolder(p), { test: (n) => n.startsWith(g) && /^\d{8}_\d{4}\.json$/.test(n.slice(g.length)) }, AUTO_KEEP); }
      } else folderPending.add(id);
    }
    if (wrote || ids.length) { renderNav(); if (current === 'home' && wrote) render(); }
  }
  /** 모든 학년(자료가 있는 것)을 지금 폴더에 저장 */
  function saveAllToFolder() { S.projects().forEach((p) => { if (S.projectHasRows(p.id)) folderPending.add(p.id); }); clearTimeout(folderTimer); return flushFolder(); }
  async function grantFolder() {
    folderAsked = true;
    const perm = await U.saveDir.request();
    U.saveDir.status.perm = perm;
    if (perm === 'granted') { clearTimeout(folderTimer); await flushFolder(); U.toast(`저장 폴더(${U.saveDir.where()})에 자동 저장합니다.`, 'ok'); }
    render();
    return perm;
  }
  V.folder = { queue: queueFolderSave, saveAll: saveAllToFolder, grant: grantFolder, gradeFolder, autoFolder };
  S.subscribe(() => queueFolderSave());
  U.saveDir.loaded.then(async () => { U.saveDir.status.perm = await U.saveDir.permission(); render(true); });
  // 권한이 아직이면, 저장할 것이 생긴 뒤 화면을 처음 누를 때 한 번 묻는다
  document.addEventListener('pointerdown', () => {
    if (folderAsked || !U.saveDir.has() || U.saveDir.status.perm === 'granted' || !folderPending.size) return;
    grantFolder();
  }, true);
  /** 초기화 방식 고르기: 위탁학생·별도 고사실 학생 남기기 / 모두 */
  const keepOpts = (keep, withIndustry) => `<div class="rs-keep">
      <label class="rs-opt keep"><input type="radio" name="rs-keep" value="1" ${keep ? 'checked' : ''}><b>${withIndustry ? '위탁학생·별도 고사실 학생은 그대로 두고 초기화' : '별도 고사실 학생은 그대로 두고 초기화'}</b><span class="muted sm">편성현황을 다시 불러오면 그대로 표시됩니다</span></label>
      <label class="rs-opt"><input type="radio" name="rs-keep" value="0" ${keep ? '' : 'checked'}><b>모두 초기화</b><span class="muted sm">${withIndustry ? '위탁학생 명단·' : ''}별도 고사실 지정까지 지웁니다</span></label></div>`;
  const globalActions = {
    go(el) { go(el.dataset.view); },
    'toggle-nav'() { document.body.classList.toggle('nav-open'); },
    'go-out'(el) { V.setOutputsTab && V.setOutputsTab(el.dataset.tab); go('outputs'); },
    /** 저장 기록: 자동·수동·단계 기록 목록에서 원하는 시점으로 되돌리기 */
    async snapshot() {
      const [list, use] = await Promise.all([S.backups(), S.historyUsage()]);
      const day = (t) => new Date(t).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
      const time = (t) => new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const KIND = { auto: ['자동', 'k-auto'], manual: ['수동', 'k-manual'], step: ['단계', 'k-step'] };
      let lastDay = '';
      const rows = list.map((b) => {
        const d = day(b.time), head = d !== lastDay ? `<li class="h-day">${h(d)}</li>` : ''; lastDay = d;
        const [kl, kc] = KIND[b.kind] || KIND.step;
        return `${head}<li class="h-row"><span class="h-time">${time(b.time)}</span><span class="h-kind ${kc}">${kl}</span><span class="h-label">${h(b.label === '자동 저장' ? '' : b.label)}</span><span class="h-size muted">${fmtSize(b.size)}</span><button class="btn outline xs" data-restore="${h(b.id)}">이 시점으로 되돌리기</button></li>`;
      }).join('');
      const pct = Math.min(100, Math.round((use.bytes / use.max) * 100));
      const v = await U.modal({
        title: `저장 기록 · ${h(S.currentProject().name)}`, wide: true,
        body: `<p class="hint">자동 저장은 바뀐 내용이 있으면 <b>2분마다</b>, 단계를 확정할 때마다 기록을 남깁니다. 원하는 시점의 <b>이 시점으로 되돌리기</b>를 누르세요. 되돌리기 직전 상태도 기록으로 남아 다시 무를 수 있습니다.</p>
          <div class="h-usage"><div class="bar"><i style="width:${pct}%"></i></div><span>모든 학년 기록 ${use.count}개 · ${fmtSize(use.bytes)} / ${fmtSize(use.max)}</span></div>
          ${list.length ? `<ul class="history-list">${rows}</ul>` : '<p class="muted">아직 기록이 없습니다. 작업을 하면 2분마다 자동으로 남습니다.</p>'}
          <p class="hint">기록이 너무 많아지지 않게 오래된 자동 저장은 솎아 냅니다: 1시간 이내는 모두, 하루 이내는 10분에 하나, 일주일 이내는 1시간에 하나, 그 이전은 하루에 하나. 모든 학년 합계가 100MB를 넘으면 오래된 기록부터 지웁니다. 기록은 이 컴퓨터(브라우저)에만 있으니 오래 보관하거나 다른 PC로 옮길 때는 <b>수동 저장</b>으로 파일을 받아 두세요.</p>`,
        buttons: [{ label: '닫기', value: null }, { label: '지금 수동 저장', value: 'manual', cls: 'primary' }],
        onMount(m, close) {
          m.addEventListener('click', async (e) => {
            const b = e.target.closest('[data-restore]'); if (!b) return;
            close(null);
            if (!(await U.confirm('이 시점으로 되돌릴까요?\n\n지금 상태는 「되돌리기 전 상태」 기록으로 남으니, 필요하면 그 기록으로 다시 되돌릴 수 있습니다.', '저장 기록 되돌리기', '되돌리기'))) return;
            if (await S.restoreBackup(b.dataset.restore)) { go('roster'); U.toast('그 시점으로 되돌렸습니다.', 'ok'); } else U.alert('그 기록을 읽지 못했습니다.');
          });
        },
      });
      if (v === 'manual') globalActions['save-manual']();
    },
    /** 자동 저장: 켜기·끄기와 사용량 */
    async autosave() {
      const use = await S.historyUsage();
      const on = S.autoSaveOn();
      const lb = S.lastBackup();
      const v = await U.modal({
        title: '자동 저장',
        body: `<p>자동 저장이 <b class="${on ? 'ok-text' : 'danger-text'}">${on ? '켜져 있습니다' : '꺼져 있습니다'}</b>.${lb ? ` 마지막 기록: <b>${new Date(lb).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</b>` : ''}</p>
          <ul class="hint-list"><li>작업 내용은 바뀔 때마다 이 컴퓨터에 바로 저장됩니다. (끄더라도 지금 작업은 사라지지 않습니다)</li>
          <li>자동 저장을 켜 두면 그와 별도로 <b>2분마다</b>, 그리고 단계를 확정할 때마다 그 시점의 기록을 남겨 <b>저장 기록</b>에서 되돌릴 수 있습니다.</li>
          <li>기록은 압축해 보관하고, 모든 학년 합계 <b>100MB</b>를 넘지 않게 오래된 것부터 정리합니다. 지금 ${use.count}개 · ${fmtSize(use.bytes)} 사용 중입니다.</li></ul>`,
        buttons: [{ label: '닫기', value: null }, { label: '저장 기록 보기', value: 'list' }, { label: on ? '자동 저장 끄기' : '자동 저장 켜기', value: 'toggle', cls: on ? 'danger-text ghost' : 'primary' }],
      });
      if (v === 'toggle') { S.setAutoSave(!on); U.toast(`자동 저장을 ${on ? '껐습니다' : '켰습니다'}.`, 'ok'); }
      if (v === 'list') globalActions.snapshot();
    },
    /** 수동 저장: 기록으로 남기고 작업 파일도 내려받는다 */
    async 'save-manual'() {
      if (!S.state.rows.length) return U.toast('저장할 데이터가 없습니다.', 'error');
      await S.saveManual();
      globalActions.backup();
      U.toast('수동 저장했습니다. 저장 기록에 남기고 작업 파일도 내려받았습니다.', 'ok');
    },
    async settings() {
      const o = S.state.out;
      let theme = S.theme(), sec = o.secLabel;
      const opt = (name, cur, list) => `<div class="set-opts">${list.map(([k, l, sub]) => `<label class="set-opt ${k === cur ? 'on' : ''}"><input type="radio" name="${name}" value="${k}" ${k === cur ? 'checked' : ''}><b>${h(l)}</b>${sub ? `<small>${h(sub)}</small>` : ''}</label>`).join('')}</div>`;
      const out = { ...o };
      const backups = await S.backups();
      const fmt = (t) => new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const v = await U.modal({
        title: '설정',
        body: `<h4>분반 이름 표기 <span class="muted sm">(학생 배치·고사실 시간표, 현재 학년)</span></h4>${opt('sec', sec, [['num', '1반 · 2반', '분반 순서 번호 (기본)'], ['neis', '편성현황 그대로', '나이스 강의실 이름'], ['ganada', '가반 · 나반', ''], ['abc', 'A반 · B반', ''], ['none', '표시 안 함', '']])}
          <h4>출력물 기본값 <span class="muted sm">(현재 학년 · 10. 출력물에서도 바꿀 수 있음)</span></h4>
          <div class="set-grid">
            <label>좌석표 번호 순서${opt('seatOrder', out.seatOrder, [['col', '세로 먼저', ''], ['row', '가로 먼저', '']])}</label>
            <label>좌석표 모양${opt('seatList', out.seatList ? '1' : '0', [['1', '좌석 + 명렬', ''], ['0', '좌석만', '']])}</label>
            <label>봉투 라벨${opt('labelStyle', out.labelStyle, [['big', '스타일 A · 과목 크게', ''], ['table', '스타일 B · 표', '']])}</label>
            <label>전체 시간표 용지${opt('paper', out.paper, [['A4', 'A4', ''], ['B4', 'B4', '']])}</label>
            <label>학생별 시간표${opt('slipSeat', out.slipSeat ? '1' : '0', [['1', '좌석번호 표시', ''], ['0', '좌석번호 숨김', '']])}</label>
            <label>하단 유의사항${opt('slipNoteOn', out.slipNoteOn ? '1' : '0', [['1', '인쇄', ''], ['0', '인쇄 안 함', '']])}</label>
          </div>
          <h4>저장 기록 <span class="muted sm">(자동·수동 저장, 되돌리기)</span></h4>
          <p class="hint">사이드바의 <b>저장 기록</b>에서 원하는 시점으로 되돌릴 수 있습니다.</p>`,        buttons: [{ label: '닫기', value: null }, { label: '저장', value: 'ok', cls: 'primary' }],
        onMount(m, close) {
          m.addEventListener('change', (e) => {
            const r = e.target; if (!r.name) return;
            if (r.name === 'theme') theme = r.value; else if (r.name === 'sec') sec = r.value;
            else if (r.name === 'seatList' || r.name === 'slipSeat' || r.name === 'slipNoteOn') out[r.name] = r.value === '1'; else out[r.name] = r.value;
            m.querySelectorAll(`input[name="${r.name}"]`).forEach((x) => x.closest('.set-opt').classList.toggle('on', x.checked));
          });
          m.addEventListener('click', async (e) => {
            const b = e.target.closest('[data-restore]'); if (!b) return;
            close(null);
            if (!(await U.confirm('이 시점의 자동 백업으로 되돌릴까요?\n\n※ 지금 상태는 사라집니다. 필요하면 먼저 [백업 저장]을 하세요.', '자동 백업 복구', '복구'))) return;
            if (await S.restoreBackup(b.dataset.restore)) { go('roster'); U.toast('자동 백업에서 복구하였습니다.', 'ok'); } else U.alert('그 백업을 읽지 못했습니다.');
          });
        },
      });
      if (v !== 'ok') return;
      if (theme !== S.theme()) S.setTheme(theme);
      if (sec !== o.secLabel) S.setOut('secLabel', sec);
      for (const k of ['seatOrder', 'seatList', 'labelStyle', 'paper', 'slipSeat', 'slipNoteOn']) if (out[k] !== o[k]) S.setOut(k, out[k]);
      U.toast('설정을 저장하였습니다.', 'ok');
    },
    'folder-grant'() { grantFolder(); },
    /** 설정: 첫 화면 아래쪽 출력 설정으로 */
    'go-settings'() { go('home'); requestAnimationFrame(() => { const el = document.getElementById('hm-out'); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1200); } }); },
    /** 첫 화면: N학년 초기화 / 전체 초기화 → 별도 고사실 학생(3학년·전체는 위탁학생도)을 유지할지 묻고 처리 */
    async 'reset-ask'(el) {
      const g = el.dataset.g, all = g === 'all';
      const p = all ? null : S.projectOfGrade(+g);
      if (!all && !p) return U.toast(`${g}학년 작업 공간이 아직 없습니다.`, 'error');
      const withInd = all || g === '3';
      const targets = all ? S.projects() : [p];
      const withData = targets.filter((x) => S.projectHasRows(x.id));
      const spN = targets.reduce((t, x) => t + S.projectSpecialCount(x.id), 0), indN = withInd ? S.industryList().length : 0;
      const what = withInd ? '별도 고사실 학생과 위탁학생' : '별도 고사실 학생';
      let save = withData.length > 0;
      const v = await U.modal({
        title: all ? '전체 초기화' : `${g}학년 초기화`,
        body: `<p class="rs-q">${what}은 그대로 유지할까요?</p>
          <p class="rs-now">지금 별도 고사실 <b>${spN}명</b>${withInd ? ` · 위탁학생 <b>${indN}명</b>` : ''}</p>
          <ul class="hint-list"><li><b>유지하고 초기화</b>: 학생편성현황·시간표·배치 등은 지우고 ${what}은 남깁니다. 편성현황을 다시 불러오면 그대로 표시됩니다.</li>
          <li><b>모두 초기화</b>: ${what}까지 모두 지웁니다.</li></ul>
          ${withData.length ? '<label class="rs-save"><input type="checkbox" data-save checked> 초기화 전에 작업 파일 저장</label>' : ''}
          <p class="hint danger-hint">※ ${all ? '1·2·3학년 모든 작업' : `${g}학년 작업`}이 지워지며 되돌릴 수 없습니다. 학교 이름·저장 폴더는 남습니다.</p>`,
        buttons: [{ label: '취소', value: null }, { label: '모두 초기화', value: 'all', cls: 'danger-text ghost' }, { label: '유지하고 초기화', value: 'keep', cls: 'primary' }],
        onMount(m) { m.addEventListener('change', (e) => { if (e.target.matches('[data-save]')) save = e.target.checked; }); },
      });
      if (!v) return;
      const keep = v === 'keep';
      if (save) withData.forEach((x) => downloadProject(x));
      if (all) S.resetEverything({ keep }); else S.resetProject(p.id, { keep });
      if (current !== 'home') go('roster'); else render();
      U.toast(`${all ? '모든 학년' : `${g}학년`} 작업을 초기화하였습니다.${keep ? ` (${what}은 유지)` : ''}`, 'ok');
    },
    'side-grade'(el) {
      const g = +el.dataset.g;
      // 첫 화면(모든 학년 공통)에서 학년을 고르면 그 학년 작업의 1단계로
      if (current === 'home') { if (S.currentGrade() !== g) S.openGrade(g); go('roster'); return; }
      if (S.currentGrade() === g) return;
      const existed = !!S.projectOfGrade(g);
      S.openGrade(g); render();
      U.toast(existed ? `${g}학년 작업을 열었습니다.` : `${g}학년 작업 공간을 새로 만들었습니다. 학생편성현황 파일을 불러오세요.`, 'ok');
    },
    backup() {
      if (!S.state.rows.length) return U.toast('저장할 데이터가 없습니다.', 'error');
      const d = new Date();
      const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
      U.saveWork(`${gradeFolder(S.currentProject())}_${stamp}_저장.json`, S.exportJSON(), autoFolder(S.currentProject()));
    },
    /** 첫 화면: 작업 파일 내려받기 (한 학년 / 모든 학년) */
    'dl-project'(el) {
      const p = S.projects().find((x) => x.id === el.dataset.id);
      if (!p || !S.projectHasRows(p.id)) return U.toast('그 학년에는 저장할 자료가 없습니다.', 'error');
      downloadProject(p);
    },
    'dl-all'() {
      const list = S.projects().filter((p) => S.projectHasRows(p.id));
      if (!list.length) return U.toast('저장할 자료가 없습니다.', 'error');
      list.forEach((p) => downloadProject(p));
    },
    /** 학년별 초기화: 고른 학년(작업 공간)만 비운다 */
    async 'reset-grade'(el) {
      const list = S.projects();
      const cur = S.currentProject();
      let pick = (el && el.dataset && el.dataset.id && list.some((p) => p.id === el.dataset.id)) ? el.dataset.id : cur.id;
      let keep = !(el && el.dataset && el.dataset.keep === '0');
      const g3 = S.projectOfGrade(3);
      const row = (p) => {
        const has = S.projectHasRows(p.id), file = S.projectFile(p);
        const spN = S.projectSpecialCount(p.id), indN = g3 && g3.id === p.id ? S.industryList().length : 0;
        const extra = [spN ? `별도 고사실 ${spN}명` : '', indN ? `위탁학생 ${indN}명` : ''].filter(Boolean).join(' · ');
        return `<label class="rs-opt ${has ? '' : 'empty'}"><input type="radio" name="rs-pick" value="${p.id}" ${p.id === pick ? 'checked' : ''}>
          <b>${h(p.name)}</b><span class="muted sm">${has ? (file ? h(file) : '작업 있음') : '비어 있음'}${extra ? ` · ${extra}` : ''}${p.id === cur.id ? ' · 지금 여는 작업' : ''}</span></label>`;
      };
      const v = await U.modal({
        title: '학년별 초기화',
        body: `<p>비울 학년을 고르세요. 그 학년의 학생편성현황·시간표·배치·응시현황·고사실·시간 설정이 모두 지워지고, <b>다른 학년 작업은 그대로</b> 남습니다.</p>
          <div class="rs-list">${list.map(row).join('')}</div>
          <h4 class="rs-h">초기화 방식</h4>${keepOpts(keep, !!g3)}
          <p class="hint">※ 되돌릴 수 없습니다. 필요하면 <b>파일 저장 후 초기화</b>를 누르세요. (자동 저장 기록은 남아 있어 <b>저장 기록</b>에서 되돌릴 수 있습니다)</p>`,
        buttons: [{ label: '취소', value: null }, { label: '파일 저장 후 초기화', value: 'backup' }, { label: '이 학년 초기화', value: 'ok', cls: 'danger-text ghost' }],
        onMount(m) { m.addEventListener('change', (e) => { if (e.target.name === 'rs-pick') pick = e.target.value; if (e.target.name === 'rs-keep') keep = e.target.value === '1'; }); },
      });
      if (!v) return;
      const p = list.find((x) => x.id === pick);
      if (!p) return;
      if (v === 'backup') downloadProject(p);
      S.resetProject(p.id, { keep });
      if (p.id === S.currentProject().id && current !== 'home') go('roster'); else render();
      U.toast(`「${p.name}」 작업을 초기화하였습니다.${keep ? ' (위탁학생·별도 고사실 학생은 남김)' : ''}`, 'ok');
    },
    /** 전체 초기화: 모든 학년 작업을 비운다 (학교 이름 등 설정은 남김) */
    async 'reset-everything'(el) {
      const list = S.projects();
      const withData = list.filter((p) => S.projectHasRows(p.id));
      let keep = !(el && el.dataset && el.dataset.keep === '0');
      const v = await U.modal({
        title: '전체 초기화',
        body: `<p><b>모든 학년</b>의 작업을 한꺼번에 비웁니다.${withData.length ? ` 지금 자료가 있는 작업: <b>${withData.map((p) => h(p.name)).join(', ')}</b>` : ' 지금은 자료가 있는 작업이 없습니다.'}</p>
          <p>학년 이름, 학교 이름, 저장 폴더와 화면 설정은 남습니다.</p>
          <h4 class="rs-h">초기화 방식</h4>${keepOpts(keep, true)}
          <p class="hint danger-hint">※ 되돌릴 수 없습니다. 필요하면 <b>모든 학년 파일 저장 후 초기화</b>를 누르세요. 학년마다 작업 파일이 하나씩 내려받아집니다.</p>`,
        buttons: [{ label: '취소', value: null }, ...(withData.length ? [{ label: '모든 학년 파일 저장 후 초기화', value: 'backup' }] : []), { label: '전체 초기화', value: 'ok', cls: 'danger' }],
        onMount(m) { m.addEventListener('change', (e) => { if (e.target.name === 'rs-keep') keep = e.target.value === '1'; }); },
      });
      if (!v) return;
      if (!(await U.confirm(keep ? '정말 모든 학년 작업을 지울까요?\n(위탁학생·별도 고사실 학생 지정은 남깁니다)' : '정말 모든 학년 작업을 지울까요?\n위탁학생 명단과 별도 고사실 지정까지 모두 지웁니다.', '전체 초기화', '모두 지우기'))) return;
      if (v === 'backup') withData.forEach((p) => downloadProject(p));
      S.resetEverything({ keep }); if (current !== 'home') go('roster'); else render();
      U.toast(`모든 학년 작업을 초기화하였습니다.${keep ? ' (위탁학생·별도 고사실 학생은 남김)' : ''}`, 'ok');
    },
    undo() { doUndo(false); },
    'proj-new'() { S.newProject(); go('roster'); U.toast('새 작업 공간을 만들었습니다. 학생편성현황을 불러오면 학년 이름이 붙습니다.', 'ok'); },
    async 'proj-rename'() {
      const p = S.currentProject();
      const hasRows = S.state.rows.length > 0;
      let name = hasRows ? S.title() : p.name;
      const v = await U.modal({
        title: hasRows ? '시험 이름' : '작업 공간 이름',
        body: `<input class="input" style="width:100%" data-name value="${h(name)}" maxlength="40">${hasRows ? '<p class="hint">출력물 제목에 쓰이는 고사 명칭입니다. (2. 기초정보에서도 바꿀 수 있습니다)</p>' : ''}`,
        buttons: [{ label: '취소', value: null }, { label: '저장', value: 'ok', cls: 'primary' }],
        onMount(m, close) { const i = m.querySelector('[data-name]'); i.focus(); i.select(); i.addEventListener('input', () => { name = i.value; }); i.addEventListener('keydown', (e) => { if (e.key === 'Enter') close('ok'); }); },
      });
      if (v !== 'ok' || !name.trim()) return;
      if (hasRows) S.set('title', name.trim()); else S.renameProject(p.id, name.trim());
    },
  };
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled || (el.matches && el.matches(':disabled'))) return;
    const act = el.dataset.act;
    const f = (cur().actions && cur().actions[act]) || globalActions[act];
    if (f) { e.preventDefault(); f(el, e); }
  });

  // ---------------------------------------------------------------- 입력
  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-gchange="proj-switch"]');
    if (el) { S.switchProject(el.value); go(current); }
  });
  /** 검색어로 표의 줄을 걸러 보여 준다. 줄마다 data-q(검색 대상 글자)를 가진다 */
  function applyFilter(input) {
    const tb = document.getElementById(input.dataset.filter);
    if (!tb) return;
    const q = input.value.trim();
    let n = 0;
    tb.querySelectorAll('tr[data-q]').forEach((tr) => { const show = !q || tr.dataset.q.includes(q); tr.hidden = !show; if (show) n++; });
    const cnt = document.querySelector(`[data-filter-count="${input.dataset.filter}"]`);
    if (cnt) cnt.textContent = cnt.dataset.fmt.replace('{n}', n);
  }
  const onChange = (e) => {
    const el = e.target.closest('[data-change]');
    if (!el) return;
    const isSearch = el.type === 'search';
    if (e.type === 'input' && !isSearch) return;
    if (e.type === 'change' && isSearch) return;
    const f = cur().change && cur().change[el.dataset.change];
    if (f) f(el, e);
    // 검색: 화면을 다시 그리지 않고 표의 줄만 숨긴다 → 입력칸이 그대로라 한글 조합(ㅈ→저→정)이 끊기지 않음
    if (isSearch && el.dataset.filter) applyFilter(el);
  };
  document.addEventListener('input', onChange);
  document.addEventListener('change', onChange);
  document.getElementById('restore-file').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const text = await U.readFile(f, 'text');
      if (S.state.rows.length && !(await U.confirm('현재 데이터를 백업 파일 내용으로 바꿀까요?'))) return;
      S.importJSON(text); U.toast('백업을 불러왔습니다.', 'ok');
    } catch (err) { U.alert('백업 파일을 읽지 못했습니다: ' + err.message); }
    e.target.value = '';
  });

  // ---------------------------------------------------------------- 끌어놓기 (마우스·터치 직접 추적)
  // 브라우저 기본 드래그(HTML5 DnD)는 환경에 따라 동작하지 않아, 포인터 이벤트로 직접 구현한다.
  // [data-drag="subject"] 시간표 과목 칩, [data-drag="cell"] 학생 배치 칸
  let pend = null, drag = null, ghost = null, overEl = null, suppressClick = false;
  const dropOk = (t) => {
    if (!t || !drag) return false;
    const kind = t.dataset.drop;
    if (drag.type === 'subject') return kind === 'tt' || kind === 'tt-remain';
    if (drag.type === 'cell') return kind === 'pl' && t.dataset.k === drag.k && !t.classList.contains('cell-locked');
    return false;
  };
  const targetAt = (x, y) => { const el = document.elementFromPoint(x, y); const t = el && el.closest('[data-drop]'); return { el, t: dropOk(t) ? t : null }; };
  let lockHintAt = 0;
  // ---------------------------------------------------------------- 풍선도움말 (data-tip)
  const tip = document.createElement('div');
  tip.className = 'tip-bubble';
  tip.hidden = true;
  document.body.appendChild(tip);
  let tipEl = null, tipTimer = 0;
  const hideTip = () => { clearTimeout(tipTimer); tipEl = null; tip.hidden = true; };
  const showTip = (el) => {
    tip.textContent = el.dataset.tip;
    tip.hidden = false;
    const r = el.getBoundingClientRect(), w = tip.offsetWidth, hgt = tip.offsetHeight;
    let x = r.left + r.width / 2 - w / 2, y = r.top - hgt - 8, below = false;
    if (y < 4) { y = r.bottom + 8; below = true; }
    x = Math.max(6, Math.min(x, innerWidth - w - 6));
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
    tip.classList.toggle('below', below);
    tip.style.setProperty('--ax', `${Math.max(10, Math.min(w - 10, r.left + r.width / 2 - x))}px`);
  };
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (el === tipEl) return;
    hideTip();
    if (!el || !el.dataset.tip || document.body.classList.contains('dragging')) return;
    tipEl = el;
    tipTimer = setTimeout(() => { if (tipEl === el && el.isConnected) showTip(el); }, 250);
  });
  document.addEventListener('pointerdown', hideTip, true);
  document.addEventListener('scroll', hideTip, true);
  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    // 확정되어 잠긴 시간표의 과목을 끌려고 하면 안내
    if (e.target.closest('[data-locked]') && Date.now() - lockHintAt > 2500) {
      lockHintAt = Date.now();
      U.toast('🔒 시간표가 확정되어 잠겨 있습니다. 위쪽 [✎ 시간표 수정하기]를 누르면 옮길 수 있습니다.', 'error');
    }
    const el = e.target.closest('[data-drag]');
    if (!el || e.target.closest('.chip-x, button, input, select')) return;
    e.preventDefault(); // 글자 선택이 시작되지 않게 (클릭은 그대로 동작)
    const r = el.getBoundingClientRect();
    pend = { el, x: e.clientX, y: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height };
  });
  document.addEventListener('pointermove', (e) => {
    if (!pend) return;
    if (!drag) {
      if (Math.hypot(e.clientX - pend.x, e.clientY - pend.y) < 4) return;
      const el = pend.el;
      drag = el.dataset.drag === 'subject' ? { type: 'subject', subject: el.dataset.subject, src: el } : { type: 'cell', k: el.dataset.k, i: +el.dataset.i, src: el };
      // 잡은 과목을 그대로 복제해 커서에 붙인다 (원래 자리는 빈 자리 표시)
      ghost = el.cloneNode(true);
      ghost.classList.remove('selected', 'dragging');
      ghost.classList.add('drag-ghost');
      ghost.removeAttribute('data-drag'); ghost.removeAttribute('data-act');
      Object.assign(ghost.style, { width: pend.w + 'px', height: pend.h + 'px' });
      document.body.appendChild(ghost);
      el.classList.add('dragging');
      document.body.classList.add('is-dragging');
      const sel = window.getSelection && window.getSelection(); if (sel) sel.removeAllRanges();
    }
    e.preventDefault();
    ghost.style.transform = `translate(${e.clientX - pend.dx}px, ${e.clientY - pend.dy}px) rotate(-2deg) scale(1.06)`;
    const { t } = targetAt(e.clientX, e.clientY);
    if (t !== overEl) { overEl && overEl.classList.remove('drag-over'); overEl = t; t && t.classList.add('drag-over'); }
  }, { passive: false });
  const endDrag = (e, cancel) => {
    const d = drag; pend = null;
    if (!d) return;
    drag = null;
    ghost && ghost.remove(); ghost = null;
    overEl && overEl.classList.remove('drag-over'); overEl = null;
    document.body.classList.remove('is-dragging');
    d.src.classList.remove('dragging');
    suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
    if (cancel) return;
    const saved = drag; drag = d;
    const { el, t } = targetAt(e.clientX, e.clientY);
    drag = saved;
    if (!t) return;
    if (d.type === 'subject') {
      const over = el && el.closest('.chip[data-subject]');
      cur().drop && cur().drop(t, d.subject, over && over.dataset.subject !== d.subject ? over.dataset.subject : null);
    } else cur().dropCell && cur().dropCell(d.k, d.i, t.dataset.k, +t.dataset.i);
  };
  document.addEventListener('pointerup', (e) => endDrag(e, false));
  document.addEventListener('pointercancel', (e) => endDrag(e, true));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drag) endDrag(e, true); });

  // ---------------------------------------------------------------- 실행 취소 Ctrl+Z / 다시 실행 Ctrl+Y (Ctrl+Shift+Z)
  function doUndo(redo) {
    const r = redo ? S.redo() : S.undo();
    if (r.done) U.toast(`${redo ? '다시 실행' : '되돌림'}: ${r.done.label}`, 'ok');
    else if (r.locked) U.toast('확정된 단계라 되돌릴 수 없습니다. 확정 취소 후 다시 시도하세요.', 'error');
    else U.toast(redo ? '다시 실행할 작업이 없습니다.' : '되돌릴 작업이 없습니다.');
  }
  V.undo = doUndo;
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k !== 'z' && k !== 'y') return;
    // 글자 입력 중에는 브라우저 기본 실행 취소를 그대로 사용
    const a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return;
    if (document.querySelector('.modal-wrap')) return;
    e.preventDefault();
    doUndo(k === 'y' || (k === 'z' && e.shiftKey));
  });
  // 끌기 직후의 클릭(칸 편집 창 열림 등)은 무시
  document.addEventListener('click', (e) => { if (suppressClick) { e.stopPropagation(); e.preventDefault(); } }, true);

  // 파일 끌어 놓기 (나이스 파일)
  document.addEventListener('dragover', (e) => {
    const t = e.target.closest('[data-drop="neis"]');
    if (t && e.dataTransfer.types.includes('Files')) { e.preventDefault(); t.classList.add('drag-over'); }
  });
  document.addEventListener('dragleave', (e) => { const t = e.target.closest('[data-drop="neis"]'); if (t && !t.contains(e.relatedTarget)) t.classList.remove('drag-over'); });
  document.addEventListener('drop', (e) => {
    const t = e.target.closest('[data-drop="neis"]');
    if (!t) return;
    e.preventDefault(); t.classList.remove('drag-over');
    const f = e.dataTransfer.files[0]; if (f) V.importFile(f);
  });
  // 파일을 창 밖에 떨어뜨렸을 때 브라우저가 파일을 여는 것을 방지
  window.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
  window.addEventListener('drop', (e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });

  window.addEventListener('hashchange', () => { const id = location.hash.slice(1); if (id !== current && views.find((v) => v.id === id)) go(id); });
  render();
})();
