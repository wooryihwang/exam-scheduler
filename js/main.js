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
    const steps = views.filter((v) => v.id !== 'outputs');
    const out = views.find((v) => v.id === 'outputs');
    const tabs = (V.outputsTabs && V.outputsTabs()) || [];
    const curTab = V.outputsTab ? V.outputsTab() : '';
    document.getElementById('nav').innerHTML = '<div class="nav-sec">작성 단계</div>' + steps.map((v) => `
      <button class="nav-item ${v.id === current ? 'on' : ''} ${v.status() ? 'done' : ''}" data-act="go" data-view="${v.id}">
        <span class="nav-ico" aria-hidden="true">${NAV_ICONS[v.id] || ''}</span><span class="nav-label-text">${v.no}. ${h(v.title)}</span>${SEL_BADGE[v.id] ? `<span class="nav-sel" title="해당 학생이 있을 때만 쓰는 단계">${SEL_BADGE[v.id]}</span>` : `<span class="nav-dot" title="${v.status() ? '확정' : '미확정'}"></span>`}
      </button>`).join('') +
      (out ? `<div class="nav-sec reports"><span>인쇄 및 출력물</span><span class="en">REPORTS</span></div>` + tabs.map(([k, l]) => `
      <button class="nav-item sub ${current === 'outputs' && curTab === k ? 'on' : ''} ${out.status() ? 'done' : ''}" data-act="go-out" data-tab="${k}">
        <span class="nav-ico" aria-hidden="true">${NAV_ICONS.outputs}</span><span class="nav-label-text">${h(l)}</span>
      </button>`).join('') : '');
    const g = S.currentGrade();
    const lb = S.lastBackup();
    document.getElementById('top-seg').innerHTML = `<div class="seg-wrap" role="group" aria-label="작업 학년">${[1, 2, 3].map((n) => `<button class="tseg g${n} ${g === n ? 'on' : ''}" data-act="side-grade" data-g="${n}" title="${n}학년 작업 열기"><i></i>${n}학년</button>`).join('')}</div>`;
    const ttl = S.state.rows.length ? S.title() : S.currentProject().name;
    document.getElementById('crumbs').innerHTML = `<span class="top-title" title="${h(ttl)}">${h(ttl)}</span><button class="btn text xs" data-act="proj-rename" title="이름 바꾸기">✎ 수정</button>`;
    document.getElementById('progress').innerHTML =
      `<button class="btn dark sm" data-act="backup" title="현재 학년 작업 전체를 JSON 파일로 내려받습니다 (오프라인 보관·다른 PC로 이동)">💾 작업 파일 다운로드</button>` +
      `<button class="sync-chip ${lb ? 'on' : ''}" data-act="snapshot" data-tip="${lb ? '단계를 확정할 때마다 이 브라우저 안에 스냅샷이 남습니다. 눌러서 복구할 수 있습니다.' : '작업 내용은 이 브라우저에 자동 저장됩니다. 단계를 확정하면 스냅샷이 남습니다.'}"><i></i>${lb ? `자동 저장 ${fmtT(lb)}` : '브라우저 자동 저장'}</button>`;
    const si = S.storageInfo(), note = document.querySelector('.side-note');
    if (note) note.innerHTML = si.mode === 'file' ? `자료는 이 컴퓨터의 <b>data 폴더</b>에 파일로 저장됩니다.<br><span class="muted" title="${h(si.dir)}">${h(si.dir)}</span>` : '데이터는 이 브라우저에만 저장되며 서버로 전송되지 않습니다.';
  }

  function render(keepFocus) {
    // 학년별 배경색 (1 노랑, 2 초록, 3 빨강)
    const g = S.currentGrade();
    if (document.body.dataset.grade !== String(g || '')) document.body.dataset.grade = g || '';
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
  S.subscribe(() => render(true));

  function go(id) {
    current = id; history.replaceState(null, '', '#' + id);
    document.body.classList.remove('nav-open');
    render(); window.scrollTo(0, 0);
  }

  // ---------------------------------------------------------------- 클릭
  const globalActions = {
    go(el) { go(el.dataset.view); },
    'toggle-nav'() { document.body.classList.toggle('nav-open'); },
    'go-out'(el) { V.setOutputsTab && V.setOutputsTab(el.dataset.tab); go('outputs'); },
    async snapshot() {
      const backups = await S.backups();
      const fmt = (t) => new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const v = await U.modal({
        title: '자동 저장 & 스냅샷',
        body: `<p class="hint">작업 내용은 이 브라우저에 즉시 자동 저장됩니다. 단계를 확정할 때마다 스냅샷이 남고(최근 5개), 아래에서 그 시점으로 되돌릴 수 있습니다.</p>
          ${backups.length ? `<ul class="backup-list">${backups.map((b) => `<li><span>${fmt(b.time)}</span> <span class="muted">${h(b.label)}</span> <button class="btn outline xs" data-restore="${h(b.id)}">이 시점으로 복구</button></li>`).join('')}</ul>` : '<p class="muted">아직 스냅샷이 없습니다. 단계를 확정하면 자동으로 남습니다.</p>'}
          <p class="hint">다른 컴퓨터로 옮기거나 오래 보관하려면 <b>파일 저장</b>으로 JSON 작업 파일을 내려받으세요. 브라우저 자료를 지우면 스냅샷도 함께 사라집니다.</p>`,
        buttons: [{ label: '닫기', value: null }, { label: '파일 저장', value: 'file' }, { label: '지금 스냅샷 남기기', value: 'snap', cls: 'primary' }],
        onMount(m, close) {
          m.addEventListener('click', async (e) => {
            const b = e.target.closest('[data-restore]'); if (!b) return;
            close(null);
            if (!(await U.confirm('이 시점의 스냅샷으로 되돌릴까요?\n\n※ 지금 상태는 사라집니다. 필요하면 먼저 [파일 저장]을 하세요.', '스냅샷 복구', '복구'))) return;
            if (await S.restoreBackup(b.dataset.restore)) { go('roster'); U.toast('스냅샷에서 복구하였습니다.', 'ok'); } else U.alert('그 스냅샷을 읽지 못했습니다.');
          });
        },
      });
      if (v === 'file') globalActions.backup();
      if (v === 'snap') {
        if (!S.state.rows.length) return U.toast('저장할 데이터가 없습니다.', 'error');
        await S.autoBackup('수동 스냅샷'); U.toast('스냅샷을 남겼습니다.', 'ok');
      }
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
          <h4>자동 백업 <span class="muted sm">(단계를 확정할 때마다 이 브라우저 안에 보관, 최근 5개)</span></h4>
          ${backups.length ? `<ul class="backup-list">${backups.map((b) => `<li><span>${fmt(b.time)}</span> <span class="muted">${h(b.label)}</span> <button class="btn outline xs" data-restore="${h(b.id)}">이 시점으로 복구</button></li>`).join('')}</ul>` : '<p class="muted">아직 자동 백업이 없습니다.</p>'}
          <p class="hint">브라우저 자료를 지우면 자동 백업도 함께 사라집니다. 파일로 보관하려면 사이드바의 <b>백업 저장</b>을 쓰세요.</p>`,
        buttons: [{ label: '닫기', value: null }, { label: '저장', value: 'ok', cls: 'primary' }],
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
    'side-grade'(el) {
      const g = +el.dataset.g;
      if (S.currentGrade() === g) return;
      const existed = !!S.projectOfGrade(g);
      S.openGrade(g); render();
      U.toast(existed ? `${g}학년 작업을 열었습니다.` : `${g}학년 작업 공간을 새로 만들었습니다. 학생편성현황 파일을 불러오세요.`, 'ok');
    },
    backup() {
      if (!S.state.rows.length) return U.toast('저장할 데이터가 없습니다.', 'error');
      const d = new Date();
      const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
      U.download(`고사배치_${S.currentProject().name}_${stamp}.json`, S.exportJSON());
    },
    async 'reset-all'() {
      const g = S.currentGrade(), name = S.currentProject().name;
      const has = S.state.rows.length > 0;
      const v = await U.modal({
        title: `${g ? g + '학년' : '현재'} 작업 초기화`,
        body: `<p><b>「${h(name)}」</b> 작업만 비웁니다. 학생편성현황·시간표·배치·응시현황·고사실·시간 설정이 모두 지워지고, <b>다른 학년 작업은 그대로</b> 남습니다.</p>
          <p class="hint">※ 되돌릴 수 없습니다. 필요하면 <b>파일 저장 후 초기화</b>를 누르세요. (단계를 확정할 때 남은 스냅샷은 '자동 저장 &amp; 스냅샷'에서 복구할 수 있습니다)</p>`,
        buttons: [{ label: '취소', value: null }, ...(has ? [{ label: '파일 저장 후 초기화', value: 'backup' }] : []), { label: '초기화', value: 'ok', cls: 'danger-text ghost' }],
      });
      if (!v) return;
      if (v === 'backup') globalActions.backup();
      S.resetAll(); go('roster');
      U.toast(`${g ? g + '학년' : '현재'} 작업을 초기화하였습니다.`, 'ok');
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
    if (!el || el.disabled) return;
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
    if (drag.type === 'cell') return kind === 'pl' && t.dataset.k === drag.k;
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
