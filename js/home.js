/* 첫 화면: 학교 이름 · 저장 폴더 · 작업 파일 · 초기화 (왼쪽 위 '고사시간표 시스템'을 누르면 나옴) */
(function () {
  'use strict';
  const S = window.Store, h = U.esc;
  let rerender = () => {};
  const ui = { keep: true };

  const ico = (d, w = 18) => `<svg viewBox="0 0 24 24" width="${w}" height="${w}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const I = {
    school: ico('<path d="M3 10l9-5 9 5-9 5z"/><path d="M7 12v5c3 2 7 2 10 0v-5"/>'),
    folder: ico('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
    file: ico('<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/>'),
    reset: ico('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>'),
    down: ico('<path d="M12 4v11M8 11l4 4 4-4"/><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"/>', 15),
    up: ico('<path d="M12 15V4M8 8l4-4 4 4"/><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"/>', 15),
  };

  /** 학년별 작업 현황 한 줄 */
  function gradeRow(g) {
    const p = S.projectOfGrade(g);
    const has = !!(p && S.projectHasRows(p.id));
    const file = has ? S.projectFile(p) : '';
    const spN = p ? S.projectSpecialCount(p.id) : 0;
    const indN = g === 3 ? S.industryList().length : 0;
    const tags = [spN ? `별도 고사실 ${spN}명` : '', indN ? `위탁학생 ${indN}명` : ''].filter(Boolean);
    return `<div class="hm-grade g${g} ${has ? '' : 'empty'}">
      <span class="hm-gname"><i></i>${g}학년</span>
      <span class="hm-gfile">${has ? h(file || '작업 있음') : '<span class="muted">비어 있음</span>'}${tags.length ? `<span class="hm-tags">${tags.map((x) => `<em>${h(x)}</em>`).join('')}</span>` : ''}</span>
      <span class="hm-gbtns">
        ${has ? `<button class="btn outline xs" data-act="dl-project" data-id="${h(p.id)}" title="${g}학년 작업 파일(JSON)을 저장 폴더에 저장합니다">${I.down} 저장</button>` : ''}
        ${p ? `<button class="btn ghost xs danger-text" data-act="reset-grade" data-id="${h(p.id)}" data-keep="${ui.keep ? 1 : 0}" title="${g}학년 작업만 비웁니다">초기화</button>` : ''}
      </span>
    </div>`;
  }

  function render() {
    const dirOk = U.saveDir && U.saveDir.supported;
    const where = U.saveDir ? U.saveDir.where() : '';
    const folder = S.saveFolder();
    const anyData = S.projects().some((p) => S.projectHasRows(p.id));
    return `
    <div class="home">
      <div class="hm-hero">
        <div class="hm-mark">${ico('<path d="M12 3l2.2 5.2 5.6.5-4.3 3.7 1.3 5.5L12 15l-4.8 2.9 1.3-5.5L4.2 8.7l5.6-.5z"/>', 30)}</div>
        <div class="hm-hero-text">
          <h1>고사시간표 시스템 <span class="ver">ver. 1.2</span></h1>
          <p>처음 한 번 <b>학교 이름</b>과 <b>저장 폴더</b>를 정해 두고, 왼쪽에서 학년을 골라 <b>1. 학생편성현황</b>부터 시작하세요.</p>
        </div>
        <button class="btn primary" data-act="go" data-view="roster">1. 학생편성현황으로 →</button>
      </div>

      <div class="hm-grid">
        <section class="card hm-card">
          <h3>${I.school}<span>학교 이름</span></h3>
          <input class="input hm-input" data-change="hm-school" value="${h(S.school())}" placeholder="예) ○○고등학교" maxlength="40">
          <p class="hint">모든 학년 출력물 머리에 인쇄됩니다. (2. 기초정보에서도 바꿀 수 있습니다)</p>
        </section>

        <section class="card hm-card">
          <h3>${I.folder}<span>저장 폴더</span></h3>
          <div class="hm-dir">
            <label class="hm-lbl">폴더 이름</label>
            <input class="input hm-input" data-change="hm-folder" value="${h(folder)}" placeholder="예) 고사시간표 작업파일" maxlength="40">
          </div>
          ${dirOk ? `<div class="hm-dir">
            <label class="hm-lbl">저장 위치</label>
            <span class="hm-where ${where ? 'on' : ''}">${where ? `${I.folder}<b>${h(where)}</b>` : '<span class="muted">아직 고르지 않음 · 다운로드 폴더에 저장</span>'}</span>
            <button class="btn outline sm" data-act="hm-pick-dir">${where ? '바꾸기' : '폴더 고르기'}</button>
            ${where ? '<button class="btn ghost sm" data-act="hm-clear-dir" title="다운로드 폴더에 저장하도록 되돌립니다">해제</button>' : ''}
          </div>
          <p class="hint">고른 폴더 안에 <b>${h(folder || '(폴더 이름 없음)')}</b> 폴더를 만들어 작업 파일(JSON)을 저장합니다. 수동 저장·작업 파일 다운로드에 모두 쓰입니다.</p>`
          : '<p class="hint">이 브라우저는 폴더 지정을 지원하지 않아 <b>다운로드 폴더</b>에 저장됩니다. (크롬·엣지에서는 폴더를 고를 수 있습니다)</p>'}
        </section>

        <section class="card hm-card wide">
          <h3>${I.file}<span>작업 파일</span><span class="hm-sub">학년별 작업을 파일로 보관하거나 다른 PC로 옮길 때 씁니다</span></h3>
          <div class="hm-grades">${[1, 2, 3].map(gradeRow).join('')}</div>
          <div class="hm-actions">
            <button class="btn outline" data-act="dl-all" ${anyData ? '' : 'disabled'}>${I.down} 모든 학년 작업 파일 저장</button>
            <label class="btn outline" for="restore-file" title="저장해 둔 작업 파일(JSON)을 지금 학년 작업으로 불러옵니다">${I.up} 작업 파일 열기</label>
          </div>
        </section>

        <section class="card hm-card wide hm-reset">
          <h3>${I.reset}<span>초기화</span><span class="hm-sub">새 시험을 시작하거나 처음부터 다시 할 때</span></h3>
          <div class="hm-keep" role="radiogroup">
            <label class="rs-opt keep ${ui.keep ? 'on' : ''}"><input type="radio" name="hm-keep" value="1" data-change="hm-keep" ${ui.keep ? 'checked' : ''}><b>위탁학생·별도 고사실 학생은 그대로 두고 초기화</b><span class="muted sm">편성현황을 다시 불러오면 그대로 표시됩니다</span></label>
            <label class="rs-opt ${ui.keep ? '' : 'on'}"><input type="radio" name="hm-keep" value="0" data-change="hm-keep" ${ui.keep ? '' : 'checked'}><b>모두 초기화</b><span class="muted sm">위탁학생 명단·별도 고사실 지정까지 지웁니다</span></label>
          </div>
          <div class="hm-actions">
            <button class="btn outline danger-text" data-act="reset-grade" data-keep="${ui.keep ? 1 : 0}">${I.reset} 학년별 초기화</button>
            <button class="btn danger" data-act="reset-everything" data-keep="${ui.keep ? 1 : 0}">전체 초기화</button>
          </div>
          <p class="hint">학교 이름·저장 폴더·화면 설정은 초기화해도 남습니다. 초기화 전에 고르는 창에서 <b>파일 저장 후 초기화</b>도 할 수 있습니다.</p>
        </section>
      </div>
    </div>`;
  }

  const home = {
    id: 'home', no: 0, title: '첫 화면',
    status: () => false,
    render,
    actions: {
      async 'hm-pick-dir'() {
        try { const n = await U.saveDir.pick(); rerender(); U.toast(`저장 위치를 「${n}」 폴더로 정했습니다.`, 'ok'); } catch (e) { if (e && e.name !== 'AbortError') U.alert('폴더를 고르지 못했습니다: ' + (e.message || e)); }
      },
      async 'hm-clear-dir'() { await U.saveDir.clear(); rerender(); U.toast('이제 다운로드 폴더에 저장합니다.', 'ok'); },
    },
    change: {
      'hm-school'(el) { S.setSchool(el.value); U.toast('학교 이름을 저장하였습니다.', 'ok'); },
      'hm-folder'(el) { S.setSaveFolder(el.value); U.toast('폴더 이름을 저장하였습니다.', 'ok'); },
      'hm-keep'(el) { ui.keep = el.value === '1'; rerender(); },
    },
  };
  Views.list.push(home);
  Views.setHomeRerender = (f) => { rerender = f; };
  // 고른 폴더를 불러오면 첫 화면의 저장 위치를 다시 그린다
  if (U.saveDir && U.saveDir.loaded) U.saveDir.loaded.then(() => rerender());
})();
