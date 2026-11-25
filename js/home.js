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
          ${dirOk ? `<div class="hm-row"><label class="hm-lbl">저장 위치</label>
            <span class="hm-where ${where ? 'on' : ''}" title="${h(where)}">${where ? `${I.folder}<b>${h(where)}</b>` : '<span class="muted">고르지 않음 · 다운로드 폴더</span>'}</span>${state}
            <button class="btn outline xs" data-act="hm-pick-dir">${where ? '바꾸기' : '폴더 고르기'}</button>${where ? '<button class="btn ghost xs" data-act="hm-clear-dir" title="다운로드 폴더에 저장하도록 되돌립니다">해제</button>' : ''}
          </div>
          <p class="hint hm-path">${where ? `${h(where)}\\<b>1학년</b>\\고사배치_1학년_자동저장.json` : '폴더를 고르면'} — 학년 작업이 바뀔 때마다 학년(1·2·3학년) 폴더에 자동 저장됩니다.</p>`
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
    </div>`;
  }

  const home = {
    id: 'home', no: 0, title: '첫 화면',
    status: () => false,
    render,
    actions: {
      async 'hm-pick-dir'() {
        try {
          await U.saveDir.pick();
          U.saveDir.status.perm = await U.saveDir.permission();
          if (Views.folder) await Views.folder.saveAll();
          rerender();
          U.toast(`저장 폴더를 「${U.saveDir.where()}」로 정했습니다. 학년별 작업이 학년 폴더에 자동 저장됩니다.`, 'ok');
        } catch (e) { if (e && e.name !== 'AbortError') U.alert('폴더를 고르지 못했습니다: ' + (e.message || e)); }
      },
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
