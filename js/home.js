/* 첫 화면: 학교 이름 · 저장 폴더 · 작업 파일 · 초기화 (왼쪽 위 '고사시간표 시스템'을 누르면 나옴) */
(function () {
  'use strict';
  const S = window.Store, h = U.esc;
  let rerender = () => {};

  const ico = (d, w = 18) => `<svg viewBox="0 0 24 24" width="${w}" height="${w}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const I = {
    school: ico('<path d="M3 10l9-5 9 5-9 5z"/><path d="M7 12v5c3 2 7 2 10 0v-5"/>'),
    folder: ico('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
    file: ico('<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/>'),
    reset: ico('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>'),
    down: ico('<path d="M12 4v11M8 11l4 4 4-4"/><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"/>', 15),
    up: ico('<path d="M12 15V4M8 8l4-4 4 4"/><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"/>', 15),
  };

  /** 학년별 작업 한 줄: 학년 · 파일 · [저장] [초기화] */
  function gradeRow(g) {
    const p = S.projectOfGrade(g);
    const has = !!(p && S.projectHasRows(p.id));
    const file = has ? S.projectFile(p) : '';
    const spN = p ? S.projectSpecialCount(p.id) : 0;
    const indN = g === 3 ? S.industryList().length : 0;
    const tags = [spN ? `별도 ${spN}명` : '', indN ? `위탁 ${indN}명` : ''].filter(Boolean);
    return `<div class="hm-grade g${g} ${has ? '' : 'empty'}">
      <span class="hm-gname"><i></i>${g}학년</span>
      <span class="hm-gfile" title="${h(file)}">${has ? h(file || '작업 있음') : '<span class="muted">비어 있음</span>'}</span>
      ${tags.length ? `<span class="hm-tags">${tags.map((x) => `<em>${h(x)}</em>`).join('')}</span>` : ''}
      <span class="hm-gbtns">
        <button class="btn outline xs" data-act="dl-project" data-id="${p ? h(p.id) : ''}" ${has ? '' : 'disabled'} title="${g}학년 작업 파일(JSON)을 저장 폴더의 ${g}학년 폴더에 저장합니다">${I.down} 저장</button>
        <button class="btn outline xs danger-text" data-act="reset-ask" data-g="${g}" ${p ? '' : 'disabled'} title="${g}학년 작업을 비웁니다 (별도 고사실${g === 3 ? '·위탁' : ''} 학생 유지 여부를 물음)">${I.reset} 초기화</button>
      </span>
    </div>`;
  }

  function render() {
    const dirOk = U.saveDir && U.saveDir.supported;
    const where = U.saveDir ? U.saveDir.where() : '';
    const folder = S.saveFolder();
    const st = U.saveDir.status, ok = st.perm === 'granted';
    const fmt = (t) => new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    const anyData = S.projects().some((p) => S.projectHasRows(p.id));
    const state = !where ? '' : ok
      ? `<span class="hm-st ok"><i></i>자동 저장 중${st.last ? ` · ${fmt(st.last)}` : ''}</span>`
      : `<button class="hm-st warn" data-act="folder-grant" title="이 폴더에 쓰려면 한 번 허용해야 합니다"><i></i>허용하기</button>`;
    return `
    <div class="home">
      <div class="hm-grid">
        <section class="card hm-card">
          <h3>${I.school}<span>기본 설정</span><span class="hm-sub">모든 학년 공통</span></h3>
          <div class="hm-row"><label class="hm-lbl">학교 이름</label><input class="input hm-input" data-change="hm-school" value="${h(S.school())}" placeholder="예) ○○고등학교" maxlength="40" title="모든 학년 출력물 머리에 인쇄됩니다"></div>
          <div class="hm-row"><label class="hm-lbl">폴더 이름</label><input class="input hm-input" data-change="hm-folder" value="${h(folder)}" placeholder="예) 고사시간표 작업파일" maxlength="40" title="저장 위치 안에 이 이름의 폴더를 만듭니다"></div>
          ${dirOk ? `<div class="hm-row top"><label class="hm-lbl">저장 위치</label>
            <span class="hm-where full ${where ? 'on' : ''}">${where ? `${I.folder}<b>${h(where)}</b>` : '<span class="muted">고르지 않음 · 다운로드 폴더에 저장</span>'}</span>
          </div>
          <div class="hm-row hm-row-btns"><span class="hm-lbl"></span>${state}
            <button class="btn outline xs" data-act="hm-pick-dir">${where ? '바꾸기' : '폴더 고르기'}</button>${where ? '<button class="btn ghost xs" data-act="hm-clear-dir" title="다운로드 폴더에 저장하도록 되돌립니다">해제</button>' : ''}
          </div>
          ${where ? `<div class="hm-tree">
            <div class="t1">${I.folder}<b>${h(where)}</b></div>
            ${[1, 2, 3].map((g) => `<div class="t2">${I.folder}<b>${g}학년 자동저장</b><span class="t-last" data-tree-g="${g}"><span class="muted">${g}학년_날짜_시간.json</span></span></div>`).join('')}
          </div>
          <p class="hint hm-path">학년 작업이 바뀔 때마다 그 학년 폴더에 <b>N학년_날짜_시간.json</b>으로 저장합니다. (10분에 한 파일 · 학년마다 최근 100개 유지 · [저장] 버튼 파일은 끝에 '_저장')<br>브라우저 보안상 고른 폴더의 앞쪽 경로(C:\\… 등)는 알 수 없어, 고른 폴더 이름부터 표시합니다.</p>` : '<p class="hint hm-path">폴더를 고르면 그 안에 작업파일 폴더와 1·2·3학년 자동저장 폴더를 만들어 자동으로 저장합니다.</p>'}`
          : '<p class="hint hm-path">이 브라우저는 폴더 지정을 지원하지 않아 다운로드 폴더에 저장됩니다. (크롬·엣지에서 가능)</p>'}
        </section>

        <section class="card hm-card">
          <h3>${I.file}<span>학년별 작업</span><span class="hm-sub">파일 저장 · 초기화</span></h3>
          <div class="hm-grades">${[1, 2, 3].map(gradeRow).join('')}</div>
          <div class="hm-actions">
            <button class="btn outline xs" data-act="dl-all" ${anyData ? '' : 'disabled'}>${I.down} 모든 학년 저장</button>
            <label class="btn outline xs" for="restore-file" title="저장해 둔 작업 파일(JSON)을 지금 학년 작업으로 불러옵니다">${I.up} 작업 파일 열기</label>
            <button class="btn danger xs hm-all-reset" data-act="reset-ask" data-g="all" title="1·2·3학년 작업을 모두 비웁니다 (별도 고사실·위탁 학생 유지 여부를 물음)">전체 초기화</button>
          </div>
        </section>
      </div>
      ${gapCard()}
      ${outCard()}
    </div>`;
  }

  // ---------------------------------------------------------------- 고사장 띄우기 고정 (학년별 그림)
  function gapCard() {
    const rows = [1, 2, 3].map((g) => {
      const fx = S.gapFixed(g); if (!fx) return '';
      const p = S.projectOfGrade(g), rooms = p ? S.projectRooms(p.id) : [];
      const set = new Set(fx);
      const strip = rooms.length
        ? rooms.map((r, k) => `<span class="gs-room ${r.cls ? '' : 'extra'}"><b>${h(r.name)}</b><small>${r.cap || '-'}명</small></span>${k < rooms.length - 1 ? (set.has(r.name) ? '<span class="hm-gapmark" title="띄워진 공간 (복도·계단 등)">⇤ ⇥</span>' : '<span class="hm-joint"></span>') : ''}`).join('')
        : `<span class="muted sm">편성현황을 불러오면 교실 모양이 보입니다 · 띄운 곳: ${h(fx.map((n) => n + ' 뒤').join(', ') || '없음')}</span>`;
      return `<div class="hm-gaprow g${g}"><span class="hm-gname"><i></i>${g}학년</span><div class="gap-strip hm-strip">${strip}</div><button class="btn ghost xs" data-act="hm-gapfix-off" data-g="${g}" title="${g}학년 고정 풀기">고정 풀기</button></div>`;
    }).join('');
    if (!rows) return '';
    return `<section class="card hm-card hm-gapcard"><h3>📌<span>고사장 띄우기 고정</span><span class="hm-sub">초기화하거나 편성현황을 다시 불러와도 이 모양으로 띄웁니다 · 7. 고사장·학생 배치 표 오른쪽 끝에서 바꿈</span></h3>${rows}</section>`;
  }

  // ---------------------------------------------------------------- 출력 설정 (예전 [설정] 창 내용, 모든 학년에 적용)
  const OUT_OPTS = [
    ['secLabel', '분반 이름 표기', '학생 배치·고사실 시간표', [['num', '1반 · 2반'], ['neis', '편성현황 그대로'], ['ganada', '가반 · 나반'], ['abc', 'A반 · B반'], ['none', '표시 안 함']]],
    ['seatOrder', '좌석표 번호 순서', '', [['col', '세로 먼저'], ['row', '가로 먼저']]],
    ['seatList', '좌석표 모양', '', [[true, '좌석 + 명렬'], [false, '좌석만']]],
    ['labelStyle', '봉투 라벨', '', [['big', 'A · 과목 크게'], ['table', 'B · 표']]],
    ['paper', '전체 시간표 용지', '', [['A4', 'A4'], ['B4', 'B4']]],
    ['slipSeat', '학생별 시간표', '', [[true, '좌석번호 표시'], [false, '좌석번호 숨김']]],
    ['slipNoteOn', '하단 유의사항', '학생별 시간표', [[true, '인쇄'], [false, '인쇄 안 함']]],
  ];
  function outCard() {
    const o = S.state.out || {};
    const item = ([k, label, sub, opts]) => `<div class="hm-opt ${k === 'secLabel' ? 'wide' : ''}"><div class="hm-opt-l">${h(label)}${sub ? `<small>${h(sub)}</small>` : ''}</div>
      <div class="hm-seg">${opts.map(([v, l]) => `<button class="${o[k] === v ? 'on' : ''}" data-act="hm-out" data-k="${k}" data-v="${String(v)}">${h(l)}</button>`).join('')}</div></div>`;
    return `<section class="card hm-card hm-out" id="hm-out">
      <h3>${ico('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>')}<span>출력 설정</span><span class="hm-sub">모든 학년에 적용 · 10. 출력물에서 학년마다 따로 바꿀 수도 있음</span></h3>
      <div class="hm-opts">${OUT_OPTS.map(item).join('')}</div>
      <p class="hint hm-path">저장 기록: 사이드바의 <b>저장 기록</b>에서 자동·수동 저장한 시점으로 되돌릴 수 있습니다.</p>
    </section>`;
  }

  /** 학년 폴더의 최근 저장 파일 이름과 개수를 채운다 (폴더를 읽어야 해서 그린 뒤에) */
  let treeSeq = 0;
  async function fillTree() {
    const seq = ++treeSeq;
    if (!U.saveDir.has() || !Views.folder) return;
    for (const g of [1, 2, 3]) {
      const p = S.projectOfGrade(g);
      const names = p ? await U.saveDir.list(Views.folder.autoFolder(p)) : null;
      if (seq !== treeSeq) return;
      const el = document.querySelector(`[data-tree-g="${g}"]`);
      if (!el) continue;
      if (names && names.length) el.innerHTML = `<span class="t-file">${h(names[0])}</span><span class="muted"> 외 ${names.length - 1}개</span>`.replace('<span class="muted"> 외 0개</span>', '');
      else el.innerHTML = '<span class="muted">아직 저장한 파일 없음</span>';
    }
  }

  const home = {
    id: 'home', no: 0, title: '첫 화면',
    status: () => false,
    render() { setTimeout(fillTree, 0); return render(); },
    actions: {
      'hm-out'(el) {
        const k = el.dataset.k, raw = el.dataset.v, v = raw === 'true' ? true : raw === 'false' ? false : raw;
        S.setOutAll(k, v);
        if (Views.folder) Views.folder.saveAll();
        U.toast('모든 학년에 적용했습니다.', 'ok');
      },
      async 'hm-pick-dir'() {
        try {
          await U.saveDir.pick();
          U.saveDir.status.perm = await U.saveDir.permission();
          if (Views.folder) await Views.folder.saveAll();
          rerender();
          U.toast(`저장 폴더를 「${U.saveDir.where()}」로 정했습니다. 학년별 작업이 학년 폴더에 자동 저장됩니다.`, 'ok');
        } catch (e) { if (e && e.name !== 'AbortError') U.alert('폴더를 고르지 못했습니다: ' + (e.message || e)); }
      },
      'hm-gapfix-off'(el) { S.clearGapFix(+el.dataset.g); U.toast(`${el.dataset.g}학년 고사장 띄우기 고정을 풀었습니다.`, 'ok'); },
      async 'hm-clear-dir'() { await U.saveDir.clear(); rerender(); U.toast('이제 다운로드 폴더에 저장합니다.', 'ok'); },
    },
    change: {
      'hm-school'(el) { S.setSchool(el.value); U.toast('학교 이름을 저장하였습니다.', 'ok'); },
      'hm-folder'(el) { S.setSaveFolder(el.value); if (Views.folder) Views.folder.saveAll(); U.toast('폴더 이름을 저장하였습니다.', 'ok'); },
    },
  };
  Views.list.push(home);
  Views.setHomeRerender = (f) => { rerender = f; };
  // 고른 폴더를 불러오면 첫 화면의 저장 위치를 다시 그린다
  if (U.saveDir && U.saveDir.loaded) U.saveDir.loaded.then(() => rerender());
})();
