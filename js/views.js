/* 단계별 화면 (1~7, 9단계). 각 화면은 { render(), actions, change } 를 가진다. */
(function () {
  'use strict';
  const C = window.Core, S = window.Store, h = U.esc;
  const st = () => S.state;

  // ---------------------------------------------------------------- 공통 조각
  /** 단계마다 한 줄 설명 (숫자 타일 말풍선, 처음 사용 안내) */
  const STEP_DESC = {
    1: '나이스 학생편성현황 엑셀을 불러오고, 시험 안 보는 학생을 정리한 뒤 확정합니다.',
    2: '시험 날짜·교시 시간·고사실(교실)과 정원을 정합니다.',
    3: '불러온 자료의 과목과 분반을 확인만 합니다.',
    4: '이번 시험에서 평가할 과목을 체크하고 확정합니다. 동시에 볼 수 있는 과목 조합이 계산됩니다.',
    5: '학생마다 어떤 과목을 보는지 확인만 합니다.',
    6: '일차·교시에 과목을 넣습니다. 자동 편성 후 끌어서 고칠 수 있습니다.',
    7: '교시마다 고사실에 시험 분반과 자습(대기)을 배치합니다. 자동 배치 후 확정합니다.',
    8: '별도 고사실에서 시험 보는 학생과 추가 시간을 지정합니다. (해당 학생이 없으면 건너뜀)',
    9: '고사실별 명단과 좌석번호를 확인하고 확정합니다.',
    10: '시간표·명단·좌석표·라벨을 엑셀·PDF로 저장하거나 인쇄합니다.',
  };
  const stepHead = (no, title, desc, actions = '') => {
    const v = ((window.Views && Views.list) || []).find((x) => x.no === no);
    const on = v ? !!v.status() : false;
    const g = S.currentGrade();
    const plain = String(desc || STEP_DESC[no] || '').replace(/<[^>]+>/g, '');
    return `
    <div class="step-head">
      <div class="step-title"><span class="step-tile">${no}</span>${g ? `<span class="grade-badge g${g}">${g}학년</span>` : ''}<h1>${h(title)}</h1>${plain ? `<span class="step-help" data-tip="${h(plain)}" aria-label="도움말">?</span>` : ''}<span class="status-badge ${on ? 'ok' : ''}">${on ? '✓ 확정' : '⚠ 미확정'}</span></div>
      <div class="step-actions">${actions}</div>
    </div>`;
  };
  const banner = (type, msg) => msg ? `<div class="banner ${type}">${msg}</div>` : '';
  const badge = (on, a = '확정', b = '미확정') => `<span class="badge ${on ? 'ok' : 'muted'}">${on ? a : b}</span>`;
  const needFirst = (msg, view, label) => `
    <div class="empty">
      <div class="empty-icon">🔒</div>
      <p>${h(msg)}</p>
      <button class="btn primary" data-act="go" data-view="${view}">${h(label)}로 이동</button>
    </div>`;
  const CONFIRM_TIPS = {
    'pl-confirm': '배치를 확정하면 고사실별 학생 명단과 좌석이 만들어집니다. 고칠 곳이 있으면 확정되지 않고 빨간 칸으로 알려 줍니다.',
    'pl-unconfirm': '확정을 풀고 배치를 다시 고칩니다. 좌석은 다시 확정할 때 새로 만들어집니다. (별도실 지정은 그대로)',
  };
  const confirmBtn = (on, labelOn, labelOff, act) =>
    `<button class="btn confirm ${on ? 'outline' : 'primary'}" data-act="${act}"${CONFIRM_TIPS[act] ? ` title="${CONFIRM_TIPS[act]}"` : ''}>${h(on ? labelOn : labelOff)}</button>`;
  const stat = (label, value, sub = '') => `<div class="stat"><div class="stat-label">${h(label)}</div><div class="stat-value">${value}</div>${sub ? `<div class="stat-sub">${sub}</div>` : ''}</div>`;
  const searchBox = (id, ph, value = '', filter = '') => `<input class="input search" type="search" data-change="${id}" ${filter ? `data-filter="${filter}"` : ''} placeholder="${h(ph)}" value="${h(value)}">`;

  /** 학년 선택 (학년별 작업 공간 전환) */
  const GRADE_COLOR = { 1: '노랑', 2: '초록', 3: '빨강' };
  const gradePicker = () => {
    const cur = S.currentGrade();
    return `<div class="grade-pick" role="group" aria-label="학년 선택">
      ${[1, 2, 3].map((g) => {
        const p = S.projectOfGrade(g);
        const on = cur === g;
        return `<button class="grade-card g${g} ${on ? 'on' : ''}" data-act="grade-pick" data-g="${g}">
          <span class="gc-dot"></span><span class="gc-name">${g}학년</span>
          <span class="gc-sub">${on ? '작업 중' : p ? '이어서 하기' : '새로 시작'}</span>
          <span class="gc-file" title="${h(S.projectFile(p))}">${S.projectFile(p) ? `📄 ${h(S.projectFile(p))}` : '<span class="gc-none">불러온 자료 없음</span>'}</span></button>`;
      }).join('')}
    </div>`;
  };
  /** 불러온 파일의 학년이 현재 작업 학년과 다르면 그 학년 작업 공간으로 옮길지 묻는다 → 계속 여부 */
  async function routeGrade(fileGrade) {
    const cur = S.currentGrade();
    if (!fileGrade || !cur || fileGrade === cur) { if (!cur && fileGrade && !st().rows.length && S.projectOfGrade(fileGrade)) S.openGrade(fileGrade); return true; }
    const v = await U.modal({
      title: '학년 확인',
      body: `<p>선택한 파일은 <b>${fileGrade}학년</b> 자료인데, 지금은 <b>${cur}학년</b> 작업 중입니다.</p>`,
      buttons: [{ label: '취소', value: null }, { label: `${cur}학년에 그대로`, value: 'stay' }, { label: `${fileGrade}학년으로 가져오기`, value: 'move', cls: 'primary' }],
    });
    if (!v) return false;
    if (v === 'move') S.openGrade(fileGrade);
    return true;
  }

  const ui = { rosterQ: '', stuQ: '', seatFilter: { day: '', period: '', room: '', q: '' }, rosterPage: 0, seatShow: 200 };
  /** 3: 확정 취소 확인 — 무엇이 사라지는지 보여 주고, 백업 파일을 먼저 내려받을 수 있게 한다 */
  async function unconfirmDialog(step, label) {
    const loss = S.unconfirmLoss(step);
    const v = await U.modal({
      title: `${label} 확정 취소`,
      body: `<p>확정을 취소하면 아래 내용이 <b>사라지거나 다시 해야</b> 합니다.</p>
        ${loss.length ? `<ul class="msg-list loss-list">${loss.map((x) => `<li>${h(x)}</li>`).join('')}</ul>` : '<p class="muted">사라지는 작업은 없습니다.</p>'}
        <p class="hint">※ 되돌릴 수 없습니다. 불안하면 <b>백업 저장 후 취소</b>를 누르세요 — 지금 상태가 파일로 내려받아진 뒤 취소됩니다.</p>`,
      buttons: [{ label: '그만두기', value: null }, ...(loss.length ? [{ label: '백업 저장 후 취소', value: 'backup' }] : []), { label: '확정 취소', value: 'ok', cls: 'danger-text ghost' }],
    });
    if (!v) return false;
    if (v === 'backup') {
      const d = new Date(), stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
      U.download(`고사배치_${S.currentProject().name}_${stamp}_취소전.json`, S.exportJSON());
    }
    return true;
  }

  // ================================================================ 1. 학생편성현황
  const roster = {
    id: 'roster', no: 1, title: '학생편성현황',
    status: () => st().confirmed.roster,
    render() {
      const s = st();
      const anyData = s.rows.length > 0 || S.projects().some((p) => p.id !== S.currentProject().id && S.projectHasRows(p.id));
      const newBtn = anyData ? `<button class="btn outline" data-act="new-exam" title="지난 시험 자료를 지우고 다음 고사를 새로 시작합니다. 고사실·시간·과목코드는 남길 수 있습니다.">🆕 새 고사 시작</button>` : '';
      const g = S.currentGrade();
      const head = stepHead(1, '학생편성현황', '나이스에서 내려받은 <b>학생편성현황</b> 엑셀 파일을 불러옵니다. 시험을 보지 않는 학생은 삭제하고, 편의제공 대상 학생은 편의반으로 이동할 수 있습니다.',
        newBtn + (s.rows.length ? confirmBtn(s.confirmed.roster, '학생편성현황 확정 취소', '학생편성현황 확정', s.confirmed.roster ? 'roster-unconfirm' : 'roster-confirm') : ''));
      if (!s.rows.length) {
        return head + `
          <div class="card import-panel" data-drop="neis">
            <div class="imp-row">
              <span class="imp-label">작업 대상:</span><span class="grade-badge g${g}">${g ? g + '학년' : '학년 미정'}</span>
              <label class="btn primary big">⬆ 나이스 엑셀 파일 선택 (1·2·3학년 통합 지원)<input type="file" accept=".xlsx,.xls,.xlsm,.xlsb" data-change="neis-file" hidden></label>
              <button class="btn outline guide-btn" data-act="neis-guide">나이스 다운로드<br>방법 안내</button>
            </div>
            <div class="imp-row">
              <span class="imp-label">예시 샘플:</span>
              ${[1, 2, 3].map((n) => `<button class="btn outline sample g${n}" data-act="load-sample" data-g="${n}" title="${n}학년 가상 체험 데이터 (실제 인물과 무관)"><i></i>${n}학년 샘플</button>`).join('')}
              <span class="imp-hint">파일을 이 상자에 끌어 놓아도 됩니다. 기존 「기말고사 프로그램(.xlsm)」 파일을 놓으면 진행한 작업을 그대로 이어받습니다. 파일은 이 컴퓨터 안에서만 읽습니다.</span>
            </div>
          </div>
          <details class="guide first-guide">
            <summary><b>처음이세요? 3분 안내</b> <span class="muted">— 열 단계를 어떤 순서로 하는지</span></summary>
            <ol class="guide-steps">
              <li><b>1~2단계</b> 나이스 학생편성현황 파일을 넣고, 시험 날짜·교시 시간·고사실을 정합니다.</li>
              <li><b>4단계</b> 평가할 과목을 체크합니다. 3·5단계는 확인용입니다.</li>
              <li><b>6단계</b> <b>⚡ 자동 편성</b>을 누르면 겹치지 않게 시간표가 짜집니다. 끌어서 고친 뒤 확정합니다.</li>
              <li><b>7단계</b> <b>전체 자동 배치</b>를 누르면 교시마다 고사장·대기실이 정해집니다. 빨간 칸만 고치고 확정합니다.</li>
              <li><b>9단계</b> 좌석번호를 확인하고 확정하면 <b>10단계</b>에서 모든 출력물이 나옵니다. 별도 고사실 학생은 8단계에서 지정합니다.</li>
            </ol>
            <p class="hint">각 단계는 <b>확정</b>해야 다음 단계가 열립니다. 되돌리려면 그 단계의 <b>확정 취소</b>를 누르세요. 데이터는 이 컴퓨터의 브라우저에만 저장됩니다 — 단계를 확정할 때마다 스냅샷이 남고, 사이드바의 <b>파일 저장</b>으로 파일로도 보관할 수 있습니다.</p>
          </details>`;
      }
      const list = S.rosterStudents();
      const bans = [...new Set(list.map((x) => x.ban))];
      const q = ui.rosterQ.trim();
      const shown = list; // 검색은 줄 숨김으로 처리 (main.js applyFilter)
      const locked = s.confirmed.roster;
      const conv = list.filter((x) => x.convenience).length;
      return head +
        banner(locked ? 'ok' : 'info', locked ? '학생편성현황을 확정하였습니다. <b>2. 기초정보</b>에서 고사 일자·시간과 고사실을 확인하세요.' : '미확정 상태입니다. 학생 명단을 확인한 뒤 <b>학생편성현황 확정</b>을 누르세요.') +
        `<div class="stats">
          ${stat('파일', `<span class="file-name" title="${h(s.fileName)}">${h(s.fileName || '-')}</span>`)}
          ${stat('학생 수', list.length + '명', `${bans.length}개 반`)}
          ${stat('수강 내역', s.rows.length + '건')}
          ${stat('개설 과목', new Set(s.rows.map((x) => x.과목)).size + '과목')}
          ${stat('편의반', conv + '명')}
        </div>
        <div class="toolbar">
          ${searchBox('roster-q', '반·번호·이름 검색', ui.rosterQ, 'roster-tbody')}
          <span class="spacer"></span>
          ${locked ? '' : `<label class="btn ghost sm">다른 파일 불러오기<input type="file" accept=".xlsx,.xls,.xlsm,.xlsb" data-change="neis-file" hidden></label>`}
        </div>
        <div class="table-wrap tall">
          <table class="tbl">
            <thead><tr><th>반</th><th>번호</th><th>성명</th><th>수강 과목 수</th><th>고사실</th><th class="right" title="편의반 이동 · 학생 삭제 (확정 전에만 가능)">관리</th></tr></thead>
            <tbody id="roster-tbody">${shown.map((x) => `
              <tr data-q="${h(`${x.ban} ${x.num} ${x.name}`)}">
                <td>${h(x.ban)}</td><td>${x.num}</td>
                <td><button class="link" data-act="roster-detail" data-key="${h(x.key)}">${h(x.name)}</button></td>
                <td>${x.count}</td>
                <td>${x.convenience ? '<span class="badge warn">편의반</span>' : '<span class="muted">소속 반</span>'}</td>
                <td class="right">${locked ? '<span class="muted sm">확정됨</span>' : `
                  ${x.convenience ? `<button class="btn ghost xs" data-act="roster-restore" data-key="${h(x.key)}">편의반 해제</button>` : `<button class="btn ghost xs" data-act="roster-conv" data-key="${h(x.key)}">편의반 이동</button>`}
                  <button class="btn ghost xs danger-text" data-act="roster-del" data-key="${h(x.key)}">삭제</button>`}
                </td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <p class="hint">편의반: 편의제공 대상 학생이 별도 고사실에서 응시할 때 사용합니다. 학생 삭제: 시험을 보지 않는 학생을 명단에서 뺍니다.</p>`;
    },
    actions: {
      'load-sample'(el) { const g = +el.dataset.g || 1; importAoa(Sample.sampleAoa(g), `샘플_학생편성현황_${g}학년.xlsx`); },
      'neis-guide'() {
        U.modal({
          title: '나이스 학생편성현황 내려받기',
          body: `<ol class="guide-steps">
              <li>나이스 ▶ <b>교육과정</b> ▶ 편제 및 과목개설관리 ▶ <b>수강생편성</b></li>
              <li>학기·학년을 고르고 <b>[조회]</b> ▶ <b>[학생편성현황]</b></li>
              <li><b>[엑셀출력]</b>으로 내려받은 파일을 그대로 여기에 넣습니다. (머리글: 학년도 · 학기 · 학년 · 편제명 · 개설과목(단위수) · 개설강의실 · 계열/학년/학과 · 반 · 번호 · 성명)</li>
            </ol>
            <p class="hint">여러 학년이 한 파일에 들어 있어도 학년별 작업 공간에 나눠 넣습니다. 편의제공 대상 학생은 불러온 뒤 <b>편의반 이동</b>으로 별도 고사실에 배정할 수 있습니다.</p>`,
        });
      },
      'grade-pick'(el) {
        const g = +el.dataset.g;
        if (S.currentGrade() === g) return;
        const existed = !!S.projectOfGrade(g);
        S.openGrade(g);
        U.toast(existed ? `${g}학년 작업을 열었습니다.` : `${g}학년 작업 공간을 새로 만들었습니다. 학생편성현황 파일을 불러오세요.`, 'ok');
      },
      async 'roster-confirm'() {
        if (!st().rows.length) return U.alert('먼저 나이스 학생편성현황 파일을 선택하십시오.');
        S.confirmRoster();
        U.toast('학생편성현황을 확정하였습니다.', 'ok');
      },
      async 'new-exam'() {
        const cur = S.currentProject().name;
        const others = S.projects().filter((p) => p.id !== S.currentProject().id && S.projectHasRows(p.id)).map((p) => p.name);
        const codes = Object.keys(st().subjectCodes || {}).filter((k) => st().subjectCodes[k]).length;
        let keepCodes = true, allGrades = false, backup = true;
        const v = await U.modal({
          title: '새 고사 시작',
          body: `<p>다음 시험을 위해 <b>지난 시험 자료를 지우고</b> 빈 상태에서 시작합니다.</p>
            <ul class="hint-list">
              <li><b>지워짐</b>: 학생편성현황, 과목·평가과목, 시간표, 학생 배치, 응시현황·좌석, 별도실 학생 지정, 시험 날짜</li>
              <li><b>남음</b>: 고사실(교실·정원), 교시 시간, 시험 일수, 띄워진 공간, 좌석 열 수, 출력 설정, 별도실 이름, 학교 이름</li>
            </ul>
            <h4>과목코드는 그대로 사용할까요?</h4>
            <p class="hint">봉투 라벨에 인쇄하는 과목코드입니다. 중간고사에서 기말고사로 가도 같은 과목은 코드가 같으므로 보통 그대로 둡니다. ${codes ? `(지금 ${codes}개 과목에 코드가 있음)` : '(지금 입력된 코드 없음)'}</p>
            <div class="set-opts"><label class="set-opt on"><input type="radio" name="nx-codes" value="1" checked><b>그대로 사용</b><small>권장</small></label><label class="set-opt"><input type="radio" name="nx-codes" value="0"><b>지우고 새로 입력</b></label></div>
            ${others.length ? `<label class="inline chk"><input type="checkbox" name="nx-all"> 다른 학년 작업(${others.map(h).join(', ')})도 함께 새 고사로</label><br>` : ''}
            <label class="inline chk"><input type="checkbox" name="nx-backup" checked> 지우기 전에 지금 상태를 백업 파일로 내려받기</label>
            <p class="hint">자동 백업도 한 벌 남깁니다(⚙ 설정에서 복구). 되돌릴 수는 없으니 백업 파일은 두는 것이 안전합니다.</p>`,
          buttons: [{ label: '취소', value: null }, { label: `「${cur}」 새 고사 시작`, value: 'ok', cls: 'primary' }],
          onMount(m) {
            m.addEventListener('change', (e) => {
              const r = e.target;
              if (r.name === 'nx-codes') { keepCodes = r.value === '1'; m.querySelectorAll('input[name="nx-codes"]').forEach((x) => x.closest('.set-opt').classList.toggle('on', x.checked)); }
              if (r.name === 'nx-all') allGrades = r.checked;
              if (r.name === 'nx-backup') backup = r.checked;
            });
          },
        });
        if (v !== 'ok') return;
        if (backup) {
          const d = new Date(), stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
          U.download(`고사배치_${cur}_${stamp}_새고사전.json`, S.exportJSON());
        }
        const done = await S.newExam({ keepCodes, allGrades });
        U.toast(`${done.join(', ')} 작업을 새 고사로 비웠습니다. 학생편성현황 파일을 불러오세요.${keepCodes ? ' (과목코드 유지)' : ''}`, 'ok');
      },
      async 'roster-unconfirm'() { if (await unconfirmDialog('roster', '학생편성현황')) S.unconfirmRoster(); },
      async 'roster-del'(el) {
        const x = S.rosterStudents().find((s) => s.key === el.dataset.key);
        if (await U.confirm(`【 ${x.ban} ${x.num}번 ${x.name} 】 학생을 삭제할까요?\n\n※ 되돌릴 수 없습니다. 되돌리려면 파일을 다시 불러와야 합니다.`, '학생 삭제', '삭제')) S.deleteStudent(x.key);
      },
      async 'roster-conv'(el) {
        const x = S.rosterStudents().find((s) => s.key === el.dataset.key);
        if (await U.confirm(`【 ${x.ban} ${x.num}번 ${x.name} 】 학생을 편의반으로 이동할까요?\n\n모든 과목의 강의실이 '편의반'으로 바뀌어 별도 고사실에서 응시합니다.`)) S.moveToConvenience(x.key);
      },
      'roster-restore'(el) { S.restoreRoom(el.dataset.key); },
      'roster-detail'(el) {
        const rows = st().rows.filter((x) => C.studentKey(x.반, x.번호) === el.dataset.key);
        const x = rows[0];
        U.modal({
          title: `${x.반} ${x.번호}번 ${x.성명}`,
          body: `<table class="tbl compact"><thead><tr><th>편제</th><th>과목</th><th>강의실</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${h(r.편제명)}</td><td>${h(r.과목)}</td><td>${h(r.강의실)}${r.강의실 !== r.강의실2 ? ` <span class="muted">(원래 ${h(r.강의실2)})</span>` : ''}</td></tr>`).join('')}</tbody></table>`,
        });
      },
    },
    change: {
      'roster-q'(el) { ui.rosterQ = el.value; },
      async 'neis-file'(el) {
        const f = el.files[0]; if (!f) return;
        await importFile(f);
        el.value = '';
      },
    },
  };

  async function importFile(f) {
    if (!window.XLSX) return U.alert('엑셀 읽기 모듈(SheetJS)을 불러오지 못했습니다. 인터넷 연결을 확인하세요.');
    try {
      const buf = await U.readFile(f);
      const wb = XLSX.read(buf, { type: 'array', cellDates: false });
      if (C.isProgramWorkbook(wb.SheetNames)) return importProgram(wb, f.name);
      // 첫 시트부터 나이스 학생편성현황 양식을 찾는다
      const sheets = wb.SheetNames.map((n) => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }));
      const aoa = sheets.find((a) => !C.parseNeis(a).error) || sheets[0];
      importAoa(aoa, f.name);
    } catch (e) {
      console.error(e);
      U.alert('파일을 읽지 못했습니다: ' + e.message);
    }
  }
  /** 기존 「기말고사 프로그램」 엑셀 파일: 진행한 작업 전체를 이어받거나 편성현황만 가져온다 */
  async function importProgram(wb, name) {
    const get = (sh, a) => { const c = wb.Sheets[sh] && wb.Sheets[sh][a]; return c ? c.v : undefined; };
    const prog = C.readProgram(get);
    if (!prog.rows.length) return U.alert('[1.편성현황] 시트에 학생 데이터가 없습니다.');
    const grade = C.val(prog.rows[0].학년);
    if (!(await routeGrade(grade))) return;
    const stage = ['roster', 'subjects', 'timetable', 'placement', 'seats'].filter((k) => prog.confirmed[k]).length;
    const stageName = ['편성현황 미확정', '학생편성현황 확정', '평가과목 확정', '고사시간표 확정', '학생 배치 확정', '응시현황 확정(완료)'][stage];
    const hasData = st().rows.length > 0;
    const v = await U.modal({
      title: '기존 고사 프로그램 파일',
      body: `<p><b>${h(name)}</b></p>
        <p>${grade}학년 · 학생편성 ${prog.rows.length}건 · 진행 상태: <b>${stageName}</b></p>
        <ul class="hint-list"><li><b>작업 전체 이어받기</b>: 고사실·일자·시간·평가과목·시간표·배치·좌석번호까지 그대로 가져옵니다. 배치 방식은 원본 엑셀과 같게 맞춥니다.</li>
        <li><b>편성현황만</b>: 1단계부터 새로 시작합니다.</li></ul>
        ${hasData ? `<p class="muted">현재 작업 공간(${h(S.currentProject()?.name || '')})에 데이터가 있어 <b>새 작업 공간</b>에 만듭니다.</p>` : ''}`,
      buttons: [{ label: '취소', value: null }, { label: '편성현황만', value: 'rows' }, { label: '작업 전체 이어받기', value: 'all', cls: 'primary' }],
    });
    if (!v) return;
    if (hasData) S.newProject();
    if (v === 'rows') {
      S.importRows(prog.rows, name);
      return U.toast(`${prog.rows.length}건을 불러왔습니다.`, 'ok');
    }
    const report = S.loadProgram(prog, name);
    U.alertList('가져오기 결과', `「${S.currentProject().name}」 작업 공간으로 가져왔습니다.`, report);
  }

  /** 여러 학년이 든 학생편성현황: 학년마다 'N학년' 작업 공간에 넣는다 */
  async function importMultiGrade(byGrade, name, removed) {
    const grades = [...byGrade.keys()].filter(Boolean).sort((a, b) => a - b);
    const state = (g) => { const p = S.projectOfGrade(g); if (!p) return '새 작업 공간'; return S.projectHasRows(p.id) ? (S.projectConfirmedRoster(p.id) ? '자료 있음 · 확정됨' : '자료 있음') : '비어 있음'; };
    const v = await U.modal({
      title: '여러 학년 자료',
      body: `<p><b>${h(name)}</b>에 ${grades.length}개 학년 자료가 함께 있습니다. 학년별 작업 공간에 나눠 넣습니다.</p>
        <table class="tbl compact"><thead><tr><th>학년</th><th>건수</th><th>작업 공간</th></tr></thead><tbody>${grades.map((g) => `<tr><td>${g}학년</td><td>${byGrade.get(g).length}건</td><td>${state(g)}</td></tr>`).join('')}</tbody></table>
        <p class="hint">이미 자료가 있는 학년을 어떻게 할지 고르세요. 확정된 학년은 덮어쓰지 않습니다.</p>`,
      buttons: [{ label: '취소', value: null }, { label: '비어 있는 학년에만', value: 'empty' }, { label: '확정 안 된 학년은 덮어쓰기', value: 'over', cls: 'primary' }],
    });
    if (!v) return;
    const report = [];
    let first = null;
    for (const g of grades) {
      S.openGrade(g);
      if (st().rows.length && (v === 'empty' || st().confirmed.roster)) { report.push(`${g}학년: 건너뜀 (${st().confirmed.roster ? '확정된 작업' : '자료 있음'})`); continue; }
      S.importRows(byGrade.get(g), name);
      report.push(`${g}학년: ${byGrade.get(g).length}건 불러옴`);
      if (first == null) first = g;
    }
    if (first != null) S.openGrade(first);
    U.alertList('학년별로 나눠 넣기', removed ? `미재학 등 ${removed}건은 제외하였습니다.` : '', report);
  }

  async function importAoa(aoa, name) {
    const r = C.parseNeis(aoa);
    if (r.error) return U.alert(r.error);
    if (!r.rows.length) return U.alert('가져올 학생 데이터가 없습니다.');
    // 한 파일에 여러 학년: 학년별 작업 공간에 나눠 넣는다
    const byGrade = new Map();
    for (const x of r.rows) { const g = C.val(x.학년); if (!byGrade.has(g)) byGrade.set(g, []); byGrade.get(g).push(x); }
    if (byGrade.size > 1) return importMultiGrade(byGrade, name, r.removed);
    if (!(await routeGrade(C.val(r.rows[0].학년)))) return;
    if (st().rows.length) {
      const g = C.val(r.rows[0].학년), cur = S.currentProject()?.name || '';
      const locked = st().confirmed.roster;
      const v = await U.modal({
        title: '불러올 위치',
        body: `<p>${g}학년 학생편성현황 ${r.rows.length}건입니다. 현재 작업 공간 「${h(cur)}」에 이미 데이터가 있습니다.</p>${locked ? '<p class="muted">현재 작업은 확정 상태라 덮어쓸 수 없습니다.</p>' : ''}`,
        buttons: [{ label: '취소', value: null }, ...(locked ? [] : [{ label: '현재 작업 덮어쓰기', value: 'over', cls: 'danger-text ghost' }]), { label: '새 작업 공간에', value: 'new', cls: 'primary' }],
      });
      if (!v) return;
      if (v === 'new') S.newProject();
    }
    S.importRows(r.rows, name);
    U.toast(`${r.rows.length}건을 불러왔습니다.` + (r.removed ? ` 미재학 등 ${r.removed}건은 제외하였습니다.` : ''), 'ok');
  }

  // ================================================================ 2. 기초정보
  const basic = {
    id: 'basic', no: 2, title: '기초정보',
    status: () => st().confirmed.roster && st().dates.some(Boolean),
    render() {
      const s = st();
      if (!s.confirmed.roster) return stepHead(2, '기초정보 설정') + needFirst('먼저 학생편성현황을 확정하세요.', 'roster', '1. 학생편성현황');
      const roomLock = s.confirmed.timetable, nameLock = s.confirmed.placement;
      const grade = C.val(s.rows[0]?.학년);
      const dayList = Array.from({ length: s.examDays }, (_, i) => i + 1);
      // 일차별 시간 블록 (1일차가 먼저 보이고 2일차부터는 아래로 스크롤)
      const dayBlocks = dayList.map((d) => {
        const date = s.dates[d - 1];
        const rows = Array.from({ length: s.periods }, (_, i) => i + 1).map((p) => {
          const k = C.slotKey(d, p), v = s.times[k] || '';
          const m = v ? C.minutesOf(v) : '';
          return `<tr><th>${p}교시</th><td><input class="input time ${v && m === 'XX분' ? 'invalid' : ''}" data-change="time" data-k="${k}" value="${h(v)}" placeholder="시작 ~ 종료"></td><td class="mins">${m && m !== 'XX분' ? m : m ? '<span class="bad-text">형식 오류</span>' : ''}</td></tr>`;
        }).join('');
        return `<div class="day-block">
          <div class="day-head"><b>${d}일차</b> <span class="muted">${h(U.fmtDateShort(date))}</span>
            ${d === 1 && s.examDays > 1 ? `<button class="btn outline xs same-btn" data-act="copy-times" title="1일차 시간을 2일차부터 모두 똑같이 적용">똑같이 ▶ 2~${s.examDays}일차</button>` : ''}</div>
          <table class="tbl compact times"><tbody>${rows}</tbody></table>
        </div>`;
      }).join('');
      const schoolBox = `<label class="school-box"><span>학교 이름</span><input class="input" data-change="school" value="${h(S.school())}" placeholder="예) ○○고등학교" maxlength="40"><small>모든 학년 출력물에 인쇄됩니다</small></label>`;
      const others = S.projects().filter((p) => !p.current);
      const copyBtn = others.length ? `<button class="btn outline sm" data-act="copy-basic" title="다른 학년 작업의 시행 일자·교시 시간·추가 휴일과 특별실·학반 기준인원을 이 학년으로 가져옵니다.">⇩ 다른 학년 일정·고사실 가져오기</button>` : '';
      return stepHead(2, '기초정보 설정', '고사 명칭, 시행 일자와 교시별 시간, 고사실(교실) 정보를 입력합니다.', '<button class="btn ghost" data-act="undo" title="되돌리기 (Ctrl+Z)">↶ 되돌리기</button>' + copyBtn + schoolBox) +
        `<div class="basic-grid">
          <div class="card">
            <h3>1. 고사 정보</h3>
            <div class="form-row"><label>학년</label><div class="static">${grade}학년</div></div>
            <div class="form-row"><label>고사 명칭</label><input class="input" data-change="title" value="${h(s.title)}" placeholder="${h(S.defaultTitle())}"></div>
            <p class="hint">출력물 제목: 「${h(S.title())} 시험시간표」</p>
            <div class="card-head mt">
              <h3>2. 고사 시행 일자</h3>
              <div class="seg" role="group" aria-label="시험 기간">
                ${[3, 4, 5].map((n) => `<button class="seg-btn ${s.examDays === n ? 'on' : ''}" data-act="exam-days" data-n="${n}">${n}일간</button>`).join('')}
              </div>
            </div>
            <table class="tbl compact dates"><tbody>${s.dates.slice(0, s.examDays).map((d, i) => {
              const why = d ? C.holidayReason(d, s.extraHolidays) : '';
              return `<tr><th>${i + 1}일차</th>
                <td><input type="date" class="input sm ${why ? 'invalid' : ''}" data-change="date" data-i="${i}" value="${h(d)}"></td>
                <td>${d ? `<span class="${why ? 'bad-text' : 'muted'}">${h(U.fmtDateShort(d))}</span>` : ''}${why ? ` <span class="badge warn">${h(why)}</span>` : ''}${i > 0 && d && !why ? ' <span class="muted sm">자동</span>' : ''}</td></tr>`;
            }).join('')}
            </tbody></table>
            <p class="hint">1일차를 고르면 2일차부터 주말·공휴일을 건너뛰어 자동으로 채워집니다. (직접 수정 가능)
              ${s.dates[0] && !C.hasHolidayTable(Number(s.dates[0].slice(0, 4))) ? '<br><b>※ 이 해의 공휴일 표가 없어 양력 공휴일만 건너뜁니다. 설·추석 등은 아래에 추가하세요.</b>' : ''}</p>
            <div class="holi">
              <span class="muted sm">건너뛸 날 추가(재량휴업일 등)</span>
              <span class="nowrap"><input type="date" class="input sm" data-holi-input> <button class="btn ghost xs" data-act="holi-add">＋ 추가</button></span>
              ${s.extraHolidays.map((x) => `<span class="pill">${h(U.fmtDateShort(x))}<button class="chip-x" data-act="holi-del" data-d="${h(x)}" aria-label="삭제">✕</button></span>`).join('')}
            </div>
          </div>
          <div class="card">
            <div class="card-head">
              <h3>3. 고사 시행 시간</h3>
              <div class="seg" role="group" aria-label="하루 교시 수">
                ${[3, 4, 5].map((n) => `<button class="seg-btn ${s.periods === n ? 'on' : ''}" data-act="periods" data-n="${n}">${n}교시</button>`).join('')}
              </div>
            </div>
            <div class="day-wrap"><div class="day-scroll" data-day-scroll>${dayBlocks}</div></div>
            <p class="scroll-hint" data-scroll-hint hidden>▼ 스크롤하면 나머지 일차 시간이 보입니다.</p>
            <p class="hint">기본값: 1교시 08:50~09:40, 2교시 10:10~11:00, 3교시 11:30~12:20 <button class="link sm" data-act="reset-times">기본값으로</button><br>1일차를 고친 뒤 <b>똑같이 ▶</b>를 누르면 2일차부터 같은 시간이 됩니다.</p>
          </div>
          <div class="card">
            <div class="card-head">
              <h3>4. 고사실 정보</h3>
              ${roomLock ? '' : '<span class="nowrap"><button class="btn ghost xs" data-act="room-resync" title="학생편성현황의 학반으로 다시 만들기 (고친 이름·수용인원은 유지)">⟳ 학반 다시 읽기</button><button class="btn ghost xs" data-act="room-add-class">＋ 학반</button><button class="btn ghost xs" data-act="room-add">＋ 별도실</button></span>'}
            </div>
            ${nameLock ? '' : `<div class="room-tools">
              <label class="inline">교실 기준인원 <input type="number" min="1" max="99" class="input sm num" data-class-cap value="${h(s.classCap || '')}" placeholder="28">명</label>
              <button class="btn outline xs" data-act="class-cap">학반에 모두 적용</button>
            </div>`}
            <table class="tbl compact rooms">
              <thead><tr><th>순서</th><th>반명</th><th title="학생수">인원</th><th>고사실명</th><th title="최대수용인원">수용</th><th>구분</th><th></th></tr></thead>
              <tbody>${s.rooms.map((r, i) => `
                <tr>
                  <td class="nowrap">${i + 1}${roomLock ? '' : `<button class="icon-btn" data-act="room-up" data-i="${i}" title="위로">▲</button><button class="icon-btn" data-act="room-down" data-i="${i}" title="아래로">▼</button>`}</td>
                  <td class="ban" title="${h(r.ban)}">${h(r.ban) || '<span class="muted">-</span>'}</td>
                  <td>${r.stuCount || ''}</td>
                  <td><input class="input sm" data-change="room" data-i="${i}" data-f="name" value="${h(r.name)}" ${nameLock ? 'disabled' : ''}></td>
                  <td><input class="input sm num" type="number" min="0" data-change="room" data-i="${i}" data-f="cap" value="${h(r.cap)}" ${nameLock ? 'disabled' : ''}></td>
                  <td>${C.isExtraRoom(r) ? '<span class="badge info">별도실</span>' : C.isRoomUsable(r) ? '<span class="badge muted">학반</span>' : '<span class="badge warn">미사용</span>'}</td>
                  <td>${roomLock ? '' : `<button class="icon-btn danger-text" data-act="room-del" data-i="${i}" title="삭제">✕</button>`}</td>
                </tr>`).join('')}
                <tr class="sum"><td></td><td>계</td><td>${s.rooms.reduce((t, r) => t + (Number(r.stuCount) || 0), 0)}</td><td colspan="4"></td></tr>
              </tbody>
            </table>
            ${roomLock ? '<p class="hint">고사시간표 확정 후에는 고사실 추가·삭제·순서 변경이 잠깁니다.</p>' : ''}
            <details class="notes"><summary>도움말</summary><ul class="hint-list">
              <li><b>수용</b>(최대수용인원): 고사실·대기실로 쓸 때 배치할 수 있는 최대 인원(책상 수 고려).</li>
              <li><b>별도실</b>: 학반이 아닌 특별실. 응시 학생만 별도실로 이동하고 나머지는 소속 학반에서 자습하는 경우, 필요한 고사실 수만큼 별도실을 두세요. (편의반도 별도실 필요)</li>
              <li>고사실명을 비우면 그 행은 고사실로 사용하지 않습니다.</li>
            </ul></details>
          </div>
        </div>
        ${banner('info', '입력을 마쳤으면 <b>3. 과목 현황</b>을 확인한 뒤 <b>4. 평가과목</b>으로 이동하세요.')}`;
    },
    actions: {
      async 'exam-days'(el) {
        const n = +el.dataset.n;
        const used = S.setExamDays(n);
        if (used.length) U.alert(`${used.join(', ')}일차에 편성된 시험 과목이 있어 ${n}일간으로 줄일 수 없습니다.\n\n[6. 고사시간표 작성]에서 해당 일차 과목을 먼저 옮기세요.`);
        else U.toast(`시험 기간을 ${n}일간으로 정했습니다.`, 'ok');
      },
      'holi-add'(el) {
        const v = el.parentElement.querySelector('[data-holi-input]').value;
        if (!v) return U.toast('날짜를 고르세요.', 'error');
        S.addHoliday(v); U.toast(`${U.fmtDate(v)}을(를) 건너뛰도록 추가하였습니다.`, 'ok');
      },
      'holi-del'(el) { S.removeHoliday(el.dataset.d); },
      periods(el) {
        const n = +el.dataset.n;
        const used = S.setPeriods(n);
        if (used.length) U.alert(`${used.join(', ')}교시에 편성된 시험 과목이 있어 하루 ${n}교시로 줄일 수 없습니다.

[6. 고사시간표 작성]에서 해당 교시 과목을 먼저 옮기세요.`);
        else U.toast(`하루 ${n}교시로 정했습니다.` + (n > 3 ? ` ${n}교시까지 시간을 입력하세요.` : ''), 'ok');
      },
      async 'copy-basic'() {
        const others = S.projects().filter((p) => !p.current);
        const roomLock = st().confirmed.timetable;
        const v = await U.modal({
          title: '다른 학년 일정·고사실 가져오기',
          body: `<p>가져올 학년 작업을 고르세요. 이 학년의 지금 일정·시간 설정을 덮어씁니다. (Ctrl+Z로 되돌릴 수 있음)</p>
            <ul class="hint-list"><li>일정: 시행 일수·일자, 교시 수·시간, 추가 휴일</li>
            <li>고사실: ${roomLock ? '<b>시간표를 확정하여 고사실은 가져오지 않습니다</b>' : '학반 교실 기준인원, 특별실(별도실·세미나실 등), 좌석 열 수'}</li></ul>`,
          buttons: [{ label: '취소', value: null }, ...others.map((p) => ({ label: `${p.name}에서 가져오기`, value: p.id, cls: 'primary' }))],
        });
        if (!v) return;
        const r = S.copyBasicFrom(v, !roomLock);
        if (!r) return U.alert('그 작업을 읽지 못했습니다.');
        U.toast(`${others.find((p) => p.id === v).name}의 일정${roomLock ? '' : `과 고사실(특별실 ${r.added}곳 추가, 학반 기준인원 ${r.capN}곳 적용)`}을 가져왔습니다.`, 'ok');
      },
      'copy-times'() {
        for (let p = 1; p <= st().periods; p++) { const v = st().times[C.slotKey(1, p)] || ''; for (let d = 2; d <= st().examDays; d++) st().times[C.slotKey(d, p)] = v; }
        S.commit(); U.toast(`1일차 시간을 2~${st().examDays}일차에 똑같이 적용하였습니다.`, 'ok');
      },
      async 'reset-times'() {
        if (!(await U.confirm('모든 일차의 고사 시간을 기본값으로 되돌릴까요?\n\n1교시 08:50 ~ 09:40\n2교시 10:10 ~ 11:00\n3교시 11:30 ~ 12:20'))) return;
        S.resetTimes(); U.toast('기본 시간으로 되돌렸습니다.', 'ok');
      },
      'class-cap'(el) {
        const n = Number(el.parentElement.querySelector('[data-class-cap]').value);
        if (!(n > 0)) return U.toast('교실 기준인원을 입력하세요.', 'error');
        const cnt = S.applyClassCap(n);
        const over = st().rooms.filter((r) => C.isClassRoom(r) && r.stuCount > n);
        U.toast(`1반~마지막 학반 ${cnt}개 교실의 최대수용인원을 ${n}명으로 맞췄습니다.`, 'ok');
        if (over.length) U.alert(`학생 수가 기준인원보다 많은 반이 있습니다.\n\n${over.map((r) => `${r.ban} ${r.stuCount}명`).join(', ')}\n\n이 반 교실에서 그 반 전체가 시험을 보면 수용인원 초과 경고가 표시됩니다.`);
      },
      'room-add'() { S.addRoom(); },
      'room-add-class'() { const r = S.addClassRoom(); U.toast(`${r.ban}(고사실 ${r.name}, 수용 ${r.cap}명)을 추가하였습니다. 고사실명·수용인원을 확인하세요.`, 'ok'); },
      'room-resync'() {
        const r = S.resyncRooms();
        const parts = [];
        if (r.added.length) parts.push(`추가: ${r.added.join(', ')}`);
        if (r.removed.length) parts.push(`제외: ${r.removed.join(', ')}`);
        U.toast(parts.length ? `학반을 다시 읽었습니다. (${parts.join(' / ')})` : '학반 목록이 학생편성현황과 같습니다.', 'ok');
      },
      async 'room-del'(el) { const r = st().rooms[+el.dataset.i]; if (await U.confirm(`'${r.name || r.ban}' 행을 삭제할까요?`)) S.removeRoom(+el.dataset.i); },
      'room-up'(el) { S.moveRoom(+el.dataset.i, -1); },
      'room-down'(el) { S.moveRoom(+el.dataset.i, 1); },
    },
    change: {
      title(el) { S.set('title', el.value.trim()); },
      school(el) { S.setSchool(el.value); U.toast('학교 이름을 저장하였습니다.', 'ok'); },
      date(el) { S.setDate(+el.dataset.i, el.value); },
      time(el) { S.setTime(el.dataset.k, el.value.trim()); },
      room(el) {
        const s = st(), i = +el.dataset.i, f = el.dataset.f;
        if (f === 'name' && el.value.trim() && s.rooms.some((r, j) => j !== i && r.name === el.value.trim())) { U.toast('고사실명이 중복됩니다.', 'error'); }
        S.setRoom(i, f, f === 'name' ? el.value.trim() : el.value);
      },
    },
  };

  // ================================================================ 3. 과목
  const subjects = {
    id: 'subjects', no: 3, title: '과목현황',
    status: () => st().confirmed.roster,
    render() {
      const s = st();
      if (!s.confirmed.roster) return stepHead(3, '과목 및 분반 현황 (조회)') + needFirst('먼저 학생편성현황을 확정하세요.', 'roster', '1. 학생편성현황');
      const conv = s.rows.some((x) => /편의/.test(x.강의실));
      return stepHead(3, '과목 및 분반 현황 (조회)', '학생편성현황에서 집계한 과목별·강의실별 학생 수입니다. (조회 전용)') +
        (conv ? banner('warn', '※ 편의반도 반수에 포함됩니다.') : '') +
        `<div class="grid-2 top">
          <div class="card"><h3>과목별 학생수 <span class="muted">(${s.subjects.length}과목, ${s.subjects.reduce((t, x) => t + x.stuCount, 0)}건)</span></h3>
            <table class="tbl compact"><thead><tr><th>과목</th><th>반수</th><th>학생수</th></tr></thead>
            <tbody>${s.subjects.map((x) => `<tr><td>${h(x.name)}</td><td>${x.banCount}</td><td>${x.stuCount}</td></tr>`).join('')}</tbody></table>
          </div>
          <div class="card"><h3>과목별 강의실별 학생수</h3>
            <div class="table-wrap tall"><table class="tbl compact"><thead><tr><th>과목</th><th>분반</th><th>강의실</th><th>학생수</th></tr></thead>
            <tbody>${[...S.sbMap().values()].map((x) => `<tr><td>${h(x.subject)}</td><td>${x.index}반</td><td>${h(x.room)}</td><td>${x.stuCount}</td></tr>`).join('')}</tbody></table></div>
          </div>
        </div>
        ${banner('info', '이상이 없으면 <b>4. 평가과목</b>으로 이동하세요.')}`;
    },
  };

  /** 동시 시험 가능 조합: 과목 수로 거르고 정렬 */
  const comboView = (combos) => {
    const n = ui.comboN || 'all', k = ui.comboSort || 'stu';
    const list = combos.filter((c) => n === 'all' || c.subjects.length === +n);
    const by = { stu: (a, b) => b.stuCount - a.stuCount, ban: (a, b) => b.banCount - a.banCount, wait: (a, b) => a.waitCount - b.waitCount };
    return list.slice().sort((a, b) => by[k](a, b) || b.subjects.length - a.subjects.length);
  };
  // ================================================================ 4. 평가과목
  const evalv = {
    id: 'eval', no: 4, title: '평가과목',
    status: () => st().confirmed.subjects,
    render() {
      const s = st();
      if (!s.confirmed.roster) return stepHead(4, '평가 대상 과목 지정') + needFirst('먼저 학생편성현황을 확정하세요.', 'roster', '1. 학생편성현황');
      const locked = s.confirmed.subjects;
      const n = s.subjects.filter((x) => x.evaluate).length;
      const ev = s.subjects.filter((x) => s.evalSubjects.includes(x.name));
      return stepHead(4, '평가 대상 과목 지정', '이번 고사에서 시험을 보는 과목을 선택합니다. 확정하면 동시에 시험 볼 수 있는 과목 조합을 자동으로 찾습니다.',
        confirmBtn(locked, '평가과목 확정 취소', `평가과목 확정 (${n}과목)`, locked ? 'eval-unconfirm' : 'eval-confirm')) +
        banner(locked ? 'ok' : 'info', locked ? '평가과목을 확정하였습니다. 동시 시험 가능 과목을 확인하고 <b>5. 학생별 평가과목</b> 또는 <b>6. 고사시간표</b>로 이동하세요.' : '평가 대상 과목을 체크한 뒤 확정하세요. <span class="muted">(주의) 모든 반이 응시하는 과목이 하나 이상 포함되어야 합니다. 예) 한국사</span>') +
        `<div class="grid-2 top">
          <div class="card">
            <div class="card-head"><h3>평가 대상 과목 선택 <span class="muted">${n}/${s.subjects.length}</span></h3>
              ${locked ? '' : '<span><button class="btn ghost xs" data-act="eval-all">전체 선택</button><button class="btn ghost xs" data-act="eval-none">전체 해제</button><button class="btn ghost xs" data-act="eval-invert" title="체크한 과목과 안 한 과목을 서로 바꿉니다">반전</button><button class="btn ghost xs" data-act="eval-ban3" title="3개 반 이상 개설된 과목을 모두 체크합니다 (이미 체크한 과목은 그대로)">3반↑ 체크</button></span>'}</div>
            <table class="tbl compact selectable"><thead><tr><th style="width:44px">평가</th><th>과목</th><th>반수</th><th>학생수</th></tr></thead>
            <tbody>${s.subjects.map((x) => `
              <tr class="${x.evaluate ? 'on' : ''}">
                <td><input type="checkbox" data-change="eval" data-name="${h(x.name)}" ${x.evaluate ? 'checked' : ''} ${locked ? 'disabled' : ''}></td>
                <td>${h(x.name)}</td><td>${x.banCount}</td><td>${x.stuCount}</td>
              </tr>`).join('')}</tbody></table>
          </div>
          <div class="card">
            <h3>평가 과목 ${locked ? `<span class="muted">(${ev.length}과목, ${ev.reduce((t, x) => t + x.stuCount, 0)}건)</span>` : ''}</h3>
            ${locked ? `<table class="tbl compact"><thead><tr><th>과목</th><th>반수</th><th>학생수</th></tr></thead><tbody>${ev.map((x) => `<tr><td>${h(x.name)}</td><td>${x.banCount}</td><td>${x.stuCount}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">확정하면 표시됩니다.</p>'}
            <h3 class="mt">동시 시험 가능 과목</h3>
            ${!locked ? '<p class="muted">확정하면 표시됩니다.</p>' : s.combos.length === 0 ? '<p class="muted">동시 시험 가능 과목이 없습니다. (모든 과목을 따로 편성해야 합니다)</p>' : `
              ${s.combosOverflow ? banner('warn', '조합이 너무 많아 1,000개까지만 표시합니다.') : ''}
              <div class="combo-tools">${[['all', `전체 (${s.combos.length})`], ...[4, 3, 2].map((k) => [String(k), `${k}과목 (${s.combos.filter((c) => c.subjects.length === k).length})`])].map(([k, l]) => `<button class="btn xs ${(ui.comboN || 'all') === k ? 'primary' : 'ghost'}" data-act="combo-n" data-n="${k}">${l}</button>`).join('')}
                <span class="spacer"></span><span class="muted sm">정렬</span>${[['stu', '응시 많은 순'], ['ban', '반수 많은 순'], ['wait', '미응시 적은 순']].map(([k, l]) => `<button class="btn xs ${(ui.comboSort || 'stu') === k ? 'primary' : 'ghost'}" data-act="combo-sort" data-k="${k}">${l}</button>`).join('')}</div>
              <div class="table-wrap mid"><table class="tbl compact"><thead><tr><th>과목1</th><th>과목2</th><th>과목3</th><th>과목4</th><th>반수</th><th>인원</th><th>미응시</th></tr></thead>
              <tbody>${comboView(s.combos).map((c) => `<tr>${[0, 1, 2, 3].map((i) => `<td>${h(c.subjects[i] || '')}</td>`).join('')}<td>${c.banCount}</td><td>${c.stuCount}</td><td>${c.waitCount}</td></tr>`).join('')}</tbody></table></div>`}
          </div>
        </div>`;
    },
    actions: {
      'eval-all'() { S.setAllEval(true); },
      'eval-invert'() { S.evalBulk('invert'); },
      'eval-ban3'() { S.evalBulk('ban3'); },
      'combo-n'(el) { ui.comboN = el.dataset.n; rerender(); },
      'combo-sort'(el) { ui.comboSort = el.dataset.k; rerender(); },
      'eval-none'() { S.setAllEval(false); },
      async 'eval-confirm'() {
        const n = st().subjects.filter((x) => x.evaluate).length;
        if (!n) return U.alert("평가 대상 과목을 하나 이상 선택하세요.");
        if (!(await U.confirm(`${n}개 과목을 평가하시겠습니까?`))) return;
        S.confirmSubjects();
        U.toast('평가과목을 확정하고 동시 시험 가능 과목을 찾았습니다.', 'ok');
      },
      async 'eval-unconfirm'() {
        const msg = st().confirmed.timetable ? '고사시간표가 확정된 상태입니다.\n\n평가과목 확정을 취소하면 시간표·배치 확정도 모두 취소됩니다. 계속할까요?' : '평가과목 확정을 취소할까요?';
        if (await unconfirmDialog('subjects', '평가과목')) { S.unconfirmSubjects(); }
      },
    },
    change: { eval(el) { S.toggleEval(el.dataset.name, el.checked); } },
  };

  // ================================================================ 5. 학생별 평가과목
  const stuSubj = {
    id: 'stuSubj', no: 5, title: '학생과목',
    status: () => st().confirmed.subjects,
    render() {
      const s = st();
      if (!s.confirmed.subjects) return stepHead(5, '학생별 평가 과목 현황 (조회)') + needFirst('먼저 평가과목을 확정하세요.', 'eval', '4. 평가과목');
      const list = S.students();
      const max = Math.max(1, ...list.map((x) => x.subjects.length));
      const q = ui.stuQ.trim();
      const shown = list;
      return stepHead(5, '학생별 평가 과목 현황 (조회)', '학생마다 응시하는 평가과목 목록입니다. (조회 전용)') +
        `<div class="toolbar">${searchBox('stu-q', '반·이름·과목 검색', ui.stuQ, 'stu-tbody')}<span class="muted" data-filter-count="stu-tbody" data-fmt="{n}/${list.length}명">${list.length}/${list.length}명</span></div>
        <div class="table-wrap tall"><table class="tbl compact">
          <thead><tr><th>학년</th><th>반</th><th>번호</th><th>성명</th>${Array.from({ length: max }, (_, i) => `<th>과목${i + 1}</th>`).join('')}</tr></thead>
          <tbody id="stu-tbody">${shown.map((x) => `<tr data-q="${h(`${x.ban} ${x.num} ${x.name} ${x.subjects.join(' ')}`)}"><td>${x.grade}</td><td>${h(x.ban)}</td><td>${x.num}</td><td>${h(x.name)}</td>${Array.from({ length: max }, (_, i) => `<td>${h(x.subjects[i] || '')}</td>`).join('')}</tr>`).join('')}</tbody>
        </table></div>`;
    },
    change: { 'stu-q'(el) { ui.stuQ = el.value; } },
  };

  // ================================================================ 6. 고사시간표 작성
  const timetable = {
    id: 'timetable', no: 6, title: '시간표작성',
    status: () => st().confirmed.timetable,
    render() {
      const s = st();
      if (!s.confirmed.subjects) return stepHead(6, '고사시간표 작성') + needFirst('먼저 평가과목을 확정하세요.', 'eval', '4. 평가과목');
      const locked = s.confirmed.timetable;
      const sets = S.sets(), students = S.students();
      const remain = C.remainingSubjects(s.evalSubjects, s.timetable);
      const dup = C.duplicateSubjects(s.timetable);
      const banOf = (name) => s.subjects.find((x) => x.name === name)?.banCount ?? '';
      let msg, type = 'info';
      if (locked) { msg = '🔒 고사시간표가 <b>확정</b>되어 잠겨 있습니다. 과목을 옮기거나 자동 편성하려면 <button class="btn primary xs" data-act="tt-edit">✎ 시간표 수정하기</button> 를 누르세요.'; type = 'ok'; }
      else if (ui.ttSwap) { msg = ui.ttSwapA ? `<b>${h(ui.ttSwapA.replace('_', '일차 '))}교시 선택됨</b> — 맞바꿀 다른 교시 칸을 누르세요. <span class="muted">(Esc 또는 [맞교환 끝]: 그만두기)</span>` : '<b>칸 맞교환</b> — 맞바꿀 두 교시 칸을 차례로 누르세요. 칸 안의 과목이 통째로 서로 바뀝니다.'; type = 'warn'; }
      else if (ui.ttSel) { msg = `<b>「${h(ui.ttSel)}」 선택됨</b> — 옮길 칸을 누르세요. 다른 과목을 누르면 서로 바뀌고, 오른쪽 미편성 칸을 누르면 대기합니다. <span class="muted">(Esc: 선택 취소)</span>`; type = 'warn'; }
      else if (dup.length) { msg = '오류: 중복으로 편성된 과목이 있습니다.'; type = 'error'; }
      else if (!remain.length) { msg = "모두 편성하였습니다. 이상이 없으면 <b>시간표 확정</b>을 누르세요."; type = 'ok'; }
      else msg = `미편성 과목이 ${remain.length}개 있습니다. 각 칸의 <b>＋</b>를 눌러 과목을 넣거나, 오른쪽 목록에서 끌어다 놓으세요. 과목을 다른 과목 위에 놓으면 서로 교환됩니다.`;

      const ttDays = Object.keys(s.timetable).map((k) => Number(k.split('_')[0]));
      const nDays = Math.max(s.examDays, ...ttDays);
      const dayCols = Array.from({ length: nDays }, (_, i) => i + 1).map((d) => {
        const date = s.dates[d - 1];
        const dist = C.dayDistribution(students, s.timetable, d);
        return { d, date, dist };
      });
      let body = '';
      const nPeriods = Math.max(s.periods, ...Object.keys(s.timetable).map((k) => Number(k.split('_')[1])));
      for (let p = 1; p <= nPeriods; p++) {
        body += `<tr><th class="period">${p}교시</th>`;
        for (const { d, date } of dayCols) {
          const k = C.slotKey(d, p);
          const subs = C.ttCell(s.timetable, d, p);
          const time = s.times[k];
          const avail = !!(time && date);
          const stt = C.cellStatus(s.timetable, d, p, sets, s.dates, s.times);
          body += `<td class="tt-cell ${avail ? '' : 'na'} ${stt.ok ? '' : 'bad'} ${(ui.ttSel || ui.ttSwap) && !locked ? 'pickable' : ''} ${ui.ttSwapA === k ? 'swap-a' : ''}" data-drop="tt" ${locked ? '' : 'data-act="tt-cell"'} data-d="${d}" data-p="${p}">
            <div class="tt-time">${h(time || '시간 미입력')}</div>
            <div class="chips">${subs.map((x) => `<span class="chip ${ui.ttSel === x ? 'selected' : ''}" ${locked ? 'data-locked="tt"' : 'data-drag="subject"'} data-subject="${h(x)}">${h(C.onlySubject(x))}<small>${banOf(x)}반</small>${locked ? '' : `<button class="chip-x" data-act="tt-remove" data-d="${d}" data-p="${p}" data-subject="${h(x)}" aria-label="빼기">✕</button>`}</span>`).join('')}
            ${!locked && avail && subs.length < C.SLOTS && remain.length ? `<button class="add-chip" data-act="tt-pick" data-d="${d}" data-p="${p}">＋</button>` : ''}</div>
            ${stt.msg && stt.msg !== '정상' ? `<div class="tt-status">${h(stt.msg)}</div>` : ''}
          </td>`;
        }
        body += '</tr>';
      }
      const distRow = `<tr class="dist"><th>응시<br>과목수</th>${dayCols.map(({ d, dist }) => `<td>${dist.error ? '<span class="bad-text">오류: 하루 5과목 초과</span>' : dist.dist.map((n, i) => (n || i === 0) ? `<button class="dist-btn ${i >= 4 ? 'hot' : ''}" data-act="tt-dist" data-d="${d}" data-n="${i}">${i}과목 <b>${n}</b></button>` : '').join('')}</td>`).join('')}</tr>`;
      return stepHead(6, '고사시간표 작성', '일차·교시별로 시험 과목을 편성합니다. 한 교시에 최대 4과목까지, 서로 수강생이 겹치지 않는 과목만 함께 편성할 수 있습니다.',
(locked ? '' : `<button class="btn ghost" data-act="undo" title="되돌리기 (Ctrl+Z)">↶ 되돌리기</button><button class="btn ghost" data-act="tt-clear">모두 지우기</button><button class="btn ${ui.ttSwap ? 'primary' : 'outline'}" data-act="tt-swap" title="두 교시 칸의 과목을 통째로 맞바꿉니다. 일차 제목 옆 ◀ ▶ 로 일차 전체를 바꿀 수도 있습니다.">${ui.ttSwap ? '✓ 맞교환 끝' : '⇄ 칸 맞교환'}</button>`) + '<button class="btn outline auto-btn" data-act="tt-auto">⚡ 자동 편성</button>' + confirmBtn(locked, '시간표 확정 취소', '시간표 확정', locked ? 'tt-unconfirm' : 'tt-confirm')) +
        banner(type, msg) +
        `<div class="tt-layout">
          <div class="table-wrap">
            <table class="tbl tt">
              <thead><tr><th></th>${dayCols.map(({ d, date }) => `<th>${!locked && d > 1 ? `<button class="day-mv" data-act="tt-day" data-a="${d}" data-b="${d - 1}" title="${d}일차와 ${d - 1}일차 시간표를 통째로 바꿉니다">◀</button>` : ''}${d}일차${!locked && d < nDays ? `<button class="day-mv" data-act="tt-day" data-a="${d}" data-b="${d + 1}" title="${d}일차와 ${d + 1}일차 시간표를 통째로 바꿉니다">▶</button>` : ''}<div class="muted sm">${h(U.fmtDate(date) || '일자 미입력')}</div></th>`).join('')}</tr></thead>
              <tbody>${body}${distRow}</tbody>
            </table>
          </div>
          <aside class="card side ${ui.ttSel && !locked ? 'pickable' : ''}" data-drop="tt-remain" ${locked ? '' : 'data-act="tt-remain-click"'}>
            <h3>미편성 과목 <span class="muted">${remain.length}</span></h3>
            ${locked ? '' : '<p class="drop-hint">시간표의 과목을 여기로 끌어 놓으면 편성이 풀려 대기합니다. 대기 중인 과목은 다시 시간표 칸으로 끌어 놓으세요.</p>'}
            <div class="chips col">${remain.length ? remain.map((x) => `<span class="chip ${locked ? '' : 'grab'} ${ui.ttSel === x ? 'selected' : ''}" ${locked ? 'data-locked="tt"' : 'data-drag="subject"'} data-subject="${h(x)}">${h(x)}<small>${banOf(x)}반</small></span>`).join('') : '<p class="muted">모두 편성하였습니다.</p>'}</div>
            ${s.combos.length ? `<h3 class="mt">동시 시험 가능 조합</h3><div class="combo-list">${s.combos.slice(0, 60).map((c) => `<div class="combo">${c.subjects.map((x) => h(C.onlySubject(x))).join(' + ')} <span class="muted">${c.banCount}반</span></div>`).join('')}${s.combos.length > 60 ? `<div class="muted">… 외 ${s.combos.length - 60}개 (4. 평가과목에서 전체 확인)</div>` : ''}</div>` : ''}
          </aside>
        </div>`;
    },
    actions: {
      'tt-swap'() { ui.ttSwap = !ui.ttSwap; ui.ttSwapA = null; ui.ttSel = null; rerender(); },
      'tt-day'(el) { const a = +el.dataset.a, b = +el.dataset.b; S.ttSwapDays(a, b); U.toast(`${a}일차와 ${b}일차 시간표를 바꿨습니다. (Ctrl+Z 되돌리기)`, 'ok'); },
      'tt-pick'(el) {
        const s = st(), d = +el.dataset.d, p = +el.dataset.p;
        const cand = C.candidateSubjects(s.evalSubjects, s.timetable, d, p, S.sets());
        const remain = C.remainingSubjects(s.evalSubjects, s.timetable);
        const other = remain.filter((x) => !cand.includes(x));
        U.modal({
          title: `${d}일차 ${p}교시 편성 가능 과목`,
          body: `${cand.length ? `<div class="pick-grid">${cand.map((x) => `<button class="pick" data-pick="${h(x)}">${h(x)}</button>`).join('')}</div>` : '<p class="muted">이 교시에 함께 편성할 수 있는 미편성 과목이 없습니다.</p>'}
            ${other.length ? `<p class="hint mt">동시 시험 불가(수강생 겹침): ${other.map(h).join(', ')}</p>` : ''}`,
          buttons: [{ label: '닫기', value: null }],
          onMount(m, close) { m.addEventListener('click', (e) => { const b = e.target.closest('[data-pick]'); if (b) { S.ttAdd(d, p, b.dataset.pick); close(); } }); },
        });
      },
      'tt-remove'(el) { S.ttRemove(+el.dataset.d, +el.dataset.p, el.dataset.subject); },
      async 'tt-edit'() { await unlockTimetable(); },
      /** 클릭으로 옮기기: 과목을 눌러 선택 → 칸(또는 다른 과목)을 눌러 이동/교환 */
      'tt-cell'(el, e) {
        if (ui.ttSwap) {
          const k = C.slotKey(+el.dataset.d, +el.dataset.p);
          if (!ui.ttSwapA) { ui.ttSwapA = k; return rerender(); }
          if (ui.ttSwapA === k) { ui.ttSwapA = null; return rerender(); }
          const [d1, p1] = ui.ttSwapA.split('_').map(Number);
          ui.ttSwapA = null;
          S.ttSwapCells(d1, p1, +el.dataset.d, +el.dataset.p);
          return U.toast(`${d1}일차 ${p1}교시 ↔ ${el.dataset.d}일차 ${el.dataset.p}교시를 맞바꿨습니다. (Ctrl+Z 되돌리기)`, 'ok');
        }
        const chip = e.target.closest('.chip[data-subject]');
        if (chip && (!ui.ttSel || ui.ttSel === chip.dataset.subject)) { ui.ttSel = ui.ttSel ? null : chip.dataset.subject; return rerender(); }
        if (!ui.ttSel) return;
        const subj = ui.ttSel; ui.ttSel = null;
        timetable.drop(el, subj, chip ? chip.dataset.subject : null);
        rerender();
      },
      'tt-remain-click'(el, e) {
        const chip = e.target.closest('.chip[data-subject]');
        if (chip && (!ui.ttSel || ui.ttSel === chip.dataset.subject)) { ui.ttSel = ui.ttSel ? null : chip.dataset.subject; return rerender(); }
        if (!ui.ttSel) return;
        const subj = ui.ttSel; ui.ttSel = null;
        timetable.drop(el, subj, null);
        rerender();
      },
      async 'tt-auto'() {
        if (st().confirmed.timetable && !(await unlockTimetable())) return;
        const s = st();
        const placed = s.evalSubjects.length - C.remainingSubjects(s.evalSubjects, s.timetable).length;
        const v = await U.modal({
          title: '고사시간표 자동 편성',
          body: `<p>시험 일자·시간이 입력된 <b>${s.examDays}일 × ${s.periods}교시</b> 안에 평가과목 ${s.evalSubjects.length}개를 자동으로 편성합니다.</p>
            <ul class="hint-list">
              <li>수강생이 겹치지 않는 과목만 같은 교시에 넣습니다.</li>
              <li>학생 한 명이 하루에 보는 시험 수가 고르게 되도록 나눕니다.</li>
              <li>편성 후에도 과목을 끌어서 옮기거나, 오른쪽 미편성 칸으로 빼 둘 수 있습니다.</li>
            </ul>
            ${placed ? `<p class="muted">이미 편성한 과목: ${placed}개</p>` : ''}`,
          buttons: [{ label: '취소', value: null }, ...(placed ? [{ label: '처음부터 다시 편성', value: 'all' }, { label: '빈 칸만 채우기', value: 'keep', cls: 'primary' }] : [{ label: '자동 편성', value: 'all', cls: 'primary' }])],
        });
        if (!v) return;
        const r = S.ttAuto(v === 'keep');
        if (r.error) return U.alert(r.error);
        const msg = [`하루에 학생 1명이 보는 시험은 최대 ${r.worst}과목입니다.`];
        if (r.over) msg.push(`(하루 ${r.perDay}과목을 넘는 경우 ${r.over}건)`);
        if (r.unplaced.length) U.alertList('일부 과목을 편성하지 못했습니다', `빈 교시가 부족하거나 함께 볼 수 있는 과목이 없습니다. 교시 수·시험 기간을 늘리거나 직접 편성하세요. ${msg.join(' ')}`, r.unplaced);
        else U.toast(`자동 편성을 마쳤습니다. ${msg.join(' ')}`, 'ok');
      },
      async 'tt-clear'() { if (await U.confirm('편성한 시간표를 모두 지울까요?')) S.ttClear(); },
      'tt-dist'(el) {
        const d = +el.dataset.d, n = +el.dataset.n;
        const { byCount } = C.dayDistribution(S.students(), st().timetable, d);
        const list = byCount[n];
        U.modal({
          title: `${d}일차 ${n}과목 응시: ${list.length}명`, wide: true,
          body: `<div class="table-wrap mid"><table class="tbl compact"><thead><tr><th>반</th><th>번호</th><th>성명</th><th>과목</th></tr></thead><tbody>${list.map((x) => `<tr><td>${h(x.student.ban)}</td><td>${x.student.num}</td><td>${h(x.student.name)}</td><td>${x.subjects.map((y) => h(C.onlySubject(y))).join(', ')}</td></tr>`).join('')}</tbody></table></div>`,
        });
      },
      async 'tt-confirm'() {
        const s = st();
        const errs = C.validateTimetable(s.evalSubjects, s.timetable, S.sets(), s.dates, s.times);
        if (errs.length) return U.alertList('시간표를 확정할 수 없습니다', '아래 내용을 확인하세요.', errs);
        S.confirmTimetable();
        U.toast('고사시간표를 확정하였습니다.', 'ok');
      },
      async 'tt-unconfirm'() {
        const msg = st().confirmed.placement ? '학생 배치가 확정된 상태입니다.\n\n학생 배치를 취소하고, 고사시간표도 확정 취소할까요?' : '고사시간표 확정을 취소할까요?';
        if (await unconfirmDialog('timetable', '고사시간표')) S.unconfirmTimetable();
      },
    },
    drop(target, subject, overSubject) {
      if (st().confirmed.timetable) return;
      if (target.dataset.drop === 'tt-remain') {
        const k = Object.keys(st().timetable).find((k) => st().timetable[k].includes(subject));
        if (k) { const [d, p] = C.parseSlotKey(k); S.ttRemove(d, p, subject); }
        return;
      }
      const d = +target.dataset.d, p = +target.dataset.p;
      if (!(st().times[C.slotKey(d, p)] && st().dates[d - 1])) return U.toast('고사 일자·시간이 입력되지 않은 교시입니다.', 'error');
      S.ttMove(subject, d, p, overSubject);
      const here = C.ttCell(st().timetable, d, p);
      if (!C.canSameTime(here, S.sets())) U.toast(`${d}일차 ${p}교시: 수강생이 겹치는 과목이 함께 있습니다. (동시 시험 불가)`, 'error');
    },
  };

  // ================================================================ 7. 학생 배치
  const placement = {
    id: 'placement', no: 7, title: '고사장·학생 배치',
    status: () => st().confirmed.placement,
    render() {
      const s = st();
      if (!s.confirmed.timetable) return stepHead(7, '고사장·학생 배치') + needFirst('먼저 고사시간표를 확정하세요.', 'timetable', '6. 고사시간표 작성');
      const locked = s.confirmed.placement;
      const slots = S.slots(), sb = S.sbMap();
      const rooms = s.rooms;
      const usable = rooms.map((r, i) => (C.isRoomUsable(r) ? i : -1)).filter((i) => i >= 0);
      // 띄워진 공간: 이 고사실과 다음(사용하는) 고사실 사이
      const gapAfter = (i) => { const k = usable.indexOf(i); return k >= 0 && k < usable.length - 1 && C.roomsApart(s.roomGaps, i, usable[k + 1]); };
      let firstErr = '';
      const warns = [];
      const issues = !locked && ui.plCheck ? S.placementIssues() : [];
      const issueAt = (k, i) => issues.filter((x) => x.slot === k && x.i === i);
      const rowsHtml = slots.map((slot) => {
        const info = S.slotInfo(slot), cells = S.cells(slot.key);
        // 실제 인원(학생 이동 반영)으로 수용인원 검사
        const ros = locked ? null : S.roster(slot);
        const counts = locked
          ? cells.map((v, i) => (v && v !== C.VOID_CELL ? s.seating.filter((x) => x.slot === slot.key && x.roomIndex === i).length : null))
          : cells.map((_, i) => (ros.rooms.get(i) ? ros.rooms.get(i).list.length : null));
        const slotIssues = issues.filter((x) => x.slot === slot.key);
        const stt = C.slotPlacementStatus(slot, cells, info, sb, rooms, counts);
        stt.warnings.forEach((x) => warns.push(`${slot.title} ${x}`));
        const nMoved = Object.keys((s.moves || {})[slot.key] || {}).length;
        if (!firstErr && (stt.status !== 'OK' || stt.problems.length)) firstErr = `【${slot.title}】 ${stt.problems[0] || C.STATUS_TEXT[stt.status]}`;
        const ok = stt.status === 'OK' && !stt.problems.length;
        return `<tr>
          <th class="pl-head">
            <div class="pl-title">${locked ? '' : `<button class="lock-btn ${S.isLocked(slot.key) ? 'on' : ''}" data-act="pl-lock" data-k="${slot.key}" title="${S.isLocked(slot.key) ? '잠금 풀기: 다시 고치거나 자동 배치할 수 있습니다' : '이 교시 잠그기: 자동 배치·편집으로 바뀌지 않게 보호합니다'}">${S.isLocked(slot.key) ? '🔒' : '🔓'}</button>`}${h(slot.title)} ${slotIssues.length ? `<span class="badge bad" data-act="pl-issue-go" data-k="${slot.key}" title="누르면 문제가 있는 칸으로 이동합니다.">문제 ${slotIssues.length}건</span>` : ''}${ok ? '<span class="badge ok">완료</span>' : `<span class="badge warn">${h(stt.status === 'OK' ? '확인' : stt.status)}</span>`}</div>
            <div class="pl-subj" ${slot.study ? '' : `title="${h(slot.subjects.map(C.onlySubject).join(', '))}"`}>${slot.study ? '<span class="badge info" title="시험이 없는 교시입니다. 학생들은 각자 자기 반 교실에서 자습합니다.">자습 교시 (시험 없음)</span>' : slot.subjects.map((x) => h(C.onlySubject(x))).join(', ')}${nMoved ? ` <span class="badge info">학생 이동 ${nMoved}명</span>` : ''}</div>
            <table class="mini"><tr><td></td><td>반수</td><td>응시</td><td>미응시</td></tr>
              <tr><td>계</td><td>${info.banTotal}</td><td>${info.exam}</td><td>${info.wait}</td></tr>
              <tr><td>미배치</td><td class="${stt.remainBans ? 'warn-text' : ''}">${stt.remainBans}</td><td class="${stt.remainExam ? 'warn-text' : ''}">${stt.remainExam}</td><td class="${stt.remainWait ? 'warn-text' : ''}">${stt.remainWait}</td></tr></table>
            ${ownRate(slot, ros, locked) }
            ${locked ? '' : `<div class="pl-btns"><button class="btn primary xs" data-act="pl-auto" data-k="${slot.key}" title="이 교시만 자동 배치합니다. 이미 채운 칸은 그대로 두고 빈 칸과 모자란 자습 인원을 채웁니다.">자동 배치</button><button class="btn ghost xs" data-act="pl-balance" data-k="${slot.key}" title="자습 인원이 모자라면 대기실 빈자리를 고르게 채우고, 정원을 넘는 학생은 같은 과목 고사실의 빈자리로 옮깁니다.">인원 맞추기</button><button class="btn ghost xs" data-act="pl-clear" data-k="${slot.key}" title="이 교시의 배치를 모두 지웁니다. (Ctrl+Z로 되돌리기)">비우기</button></div>`}
          </th>
          ${usable.map((i) => {
            const v = cells[i], c = C.parseCell(v), r = rooms[i];
            let inner = '', cls = '';
            const capN = Number(r.cap) || 0;
            // 인원: 누르면 학생 명단·이동 창 (학생 이동이 있으면 바뀐 인원 표시)
            const cnt = (base) => {
              const real = counts && counts[i] != null ? counts[i] : base;
              return `<button class="c-cnt link-cnt" data-act="pl-roster" data-k="${slot.key}" data-i="${i}" title="학생 명단 보기·이동">${real !== base ? `<s>${base}</s>→` : ''}${real}명 ▸</button>`;
            };
            const realOf = (base) => (counts && counts[i] != null ? counts[i] : base);
            if (c.type === 'exam') {
              const x = sb.get(c.key);
              const over = x && capN > 0 && realOf(x.stuCount) > capN;
              cls = `exam ${over ? 'over' : ''} ${x && slot.subjects.includes(x.subject) ? '' : 'bad'}`;
              inner = x ? `<div class="c-subj">${h(C.onlySubject(x.subject))}</div><div class="c-ban">${S.secName(x) && st().out.secLabel !== 'neis' ? `${h(S.secName(x))} · ` : ''}${h(C.roomLabel(x.room))}</div>${cnt(x.stuCount)}` : `<div class="c-subj">${h(v)}</div><div class="c-ban">오류</div>`;
            } else if (c.type === 'more') {
              cls = `exam more ${capN > 0 && realOf(0) > capN ? 'over' : ''}`;
              inner = `<div class="c-subj">${h(C.onlySubject(c.subject))}</div><div class="c-ban">추가 고사장</div>${cnt(0)}`;
            } else if (c.type === 'home') {
              const base = C.homeSize(info, c.subject, c.ban);
              cls = `exam home ${capN > 0 && realOf(base) > capN ? 'over' : ''}`;
              inner = `<div class="c-subj">${h(C.onlySubject(c.subject))}</div><div class="c-ban">${h(c.ban)} 학급 전체</div>${cnt(base)}`;
            } else if (c.type === 'wait') {
              const over = capN > 0 && realOf(c.count) > capN;
              cls = `wait ${over ? 'over' : ''}`;
              inner = `<div class="c-subj">대기(자습)</div><div class="c-ban">미응시</div>${cnt(c.count)}`;
            } else if (c.type === 'void') {
              cls = 'void';
              inner = '<div class="c-subj">빈 교실</div><div class="c-ban">시험 완충</div>';
            } else inner = locked ? '' : '<div class="c-empty" title="누르면 이 교실에 넣을 분반·자습을 고릅니다. 다른 칸을 끌어다 놓아도 됩니다.">＋</div>';
            const q = (kind, label, tip) => `<button class="q-btn q-${kind} ${c.type === kind ? 'on' : ''}" data-act="pl-quick" data-q="${kind}" data-k="${slot.key}" data-i="${i}" title="${tip}">${label}</button>`;
            const quick = locked ? '' : `<div class="c-quick">${q('exam', '고사장', '고사장 지정: 남은 시험 분반을 이 교실에 배치')}${q('wait', '자습실', '자습실 지정: 남은 미응시 학생을 수용인원까지 배치')}${q('void', '빈 교실', '빈 교실 지정: 이 교시에는 비워 둠')}</div>`;
            const iss = issueAt(slot.key, i);
            if (iss.length) cls += ' issue';
            if (gapAfter(i)) cls += ' gap-after';
            return `<td class="pl-cell ${cls}" ${iss.length ? `title="${h(iss.map((x) => x.msg).join(' / '))}" data-issue="1"` : ''} data-act="pl-cell" data-k="${slot.key}" data-i="${i}" ${!locked && v && v !== C.VOID_CELL ? 'data-drag="cell"' : ''} data-drop="pl" ><div class="c-body">${inner}</div>${quick}</td>`;
          }).join('')}
        </tr>`;
      }).join('');
      let msg, type = 'info';
      if (locked) { msg = '학생 배치를 확정하였습니다. <b>9. 응시현황</b>으로 이동하세요.' + (s.notices.length ? `<details class="notes"><summary>다른 반 대기실로 배정된 경우 ${s.notices.length}건 보기</summary><ul class="msg-list">${s.notices.map((x) => `<li>${h(x)}</li>`).join('')}</ul></details>` : ''); type = 'ok'; }
      else if (issues.length) {
        msg = `<b>배치 확정 전에 고칠 곳이 ${issues.length}건 있습니다.</b> 빨간 칸과 교시의 '문제' 표시를 확인하세요. 고치면 표시가 바로 사라집니다.
          <ul class="msg-list">${issues.slice(0, 6).map((x) => `<li><a href="#" data-act="pl-issue-go" data-k="${x.slot || ''}" data-i="${x.i ?? ''}">${h(x.title)}</a> ${h(x.msg)}</li>`).join('')}${issues.length > 6 ? `<li>… 외 ${issues.length - 6}건</li>` : ''}</ul>`;
        type = 'error';
      }
      else if (!firstErr) { msg = '모두 배치하였습니다. <b>배치 확정</b>을 누르면 고사실별 학생 명단이 만들어집니다.'; type = 'ok'; }
      else msg = firstErr + ' — 빈 칸을 눌러 배치하거나 <b>자동 배치</b>를 사용하세요. 칸을 끌어서 다른 고사실과 바꿀 수 있습니다.';
      return tipify(stepHead(7, '고사장·학생 배치', '시험 회차(일차·교시)마다 각 고사실에 <b>과목-분반</b> 또는 <b>대기(미응시 학생 자습)</b>를 배치합니다.',
        locked ? confirmBtn(true, '배치 확정 취소', '', 'pl-unconfirm') :
          `<button class="btn ghost" data-act="undo" title="되돌리기 (Ctrl+Z)">↶ 되돌리기</button><button class="btn ghost" data-act="pl-clear-all" title="모든 교시의 배치를 지웁니다.">전체 삭제</button><button class="btn outline" data-act="pl-auto-all" title="모든 교시를 자동 배치 방식에 따라 한꺼번에 배치합니다. 잠긴 교시는 그대로 둡니다.">전체 자동 배치</button>${confirmBtn(false, '', '배치 확정', 'pl-confirm')}`) +
        banner(type, msg) +
        `<div class="toolbar options">
          <label class="inline">자동 배치 방식
            <select class="input sm" data-change="pl-opt" data-f="autoMode" ${locked ? 'disabled' : ''} title="[자동 배치]·[전체 자동 배치]를 누를 때 시험실을 정하는 방법입니다.">
              <option value="rule" ${s.options.autoMode === 'rule' ? 'selected' : ''}>학교 규칙 – 분반 수에 따라 앞·뒤 교실 + 빈 교실 (권장)</option>
              <option value="class" ${s.options.autoMode === 'class' ? 'selected' : ''}>학반 교실 우선</option>
              <option value="original" ${s.options.autoMode === 'original' ? 'selected' : ''}>원본 엑셀과 동일 (순서대로 채우기)</option>
            </select></label>
          <label class="inline">대기 학생 배정
            <select class="input sm" data-change="pl-opt" data-f="waitMode" ${locked ? 'disabled' : ''} title="자습(미응시) 학생을 어느 대기실에 넣을지 정하는 방법입니다.">
              <option value="class" ${s.options.waitMode === 'class' ? 'selected' : ''}>반별 우선 – 자기 반 대기실 먼저 (권장)</option>
              <option value="original" ${s.options.waitMode === 'original' ? 'selected' : ''}>원본 엑셀과 동일 – 고사실 순서대로</option>
            </select></label>
          <button class="icon-btn" data-act="pl-opt-help" title="설명">ⓘ 차이</button>
          <span class="spacer"></span>
          ${locked ? '' : `<button class="btn ghost sm" data-act="pl-lock-all" data-on="1" title="모든 교시를 잠가 자동 배치·편집으로 바뀌지 않게 합니다">🔒 전체 잠금</button><button class="btn ghost sm" data-act="pl-lock-all" data-on="0" title="모든 교시 잠금을 풉니다">🔓 전체 해제</button>`}
          <button class="btn ghost sm" data-act="pl-check-sec" title="교시마다 시험 분반이 어느 고사실에 몇 명 배치되었는지 확인합니다">🔍 분반 점검</button>
          <button class="btn ghost sm" data-act="pl-check-room" title="고사실마다 시험·자습·빈 교실로 쓰인 횟수와 최대 인원을 확인합니다">🪑 고사실 점검</button>
          <button class="btn ${ui.plCompact ? 'primary' : 'ghost'} sm" data-act="pl-compact" title="칸을 작게 줄여 모든 교시·고사실을 한 화면에 봅니다">${ui.plCompact ? '✓ 한눈에 보기' : '🔍 한눈에 보기'}</button>
          <span class="muted sm" data-tip="자습(미응시) 학생 가운데 자기 반 교실에서 자습하는 학생의 비율 (모든 교시)">${allOwnRate(locked)}</span>
        </div>` +
        (warns.length && !locked ? banner('warn', `⚠ ${warns.map(h).join('<br>⚠ ')}<br><span class="muted">배치 확정 전에 고쳐야 합니다 — 인원 ▸ 를 눌러 학생을 옮기거나, [인원 맞추기]·[고사장]으로 추가 고사장을 지정하세요. (수용인원은 [2. 기초정보]에서 바꿀 수 있습니다)</span>`) : '') +
        `<div class="table-wrap pl-wrap">
          <table class="tbl pl ${ui.plCompact ? 'compact-view' : ''}">
            <thead><tr><th class="pl-head">구분${locked ? '' : `<button class="btn ${ui.gapEdit ? 'primary' : 'outline'} xs gap-btn" data-act="pl-gap-edit" title="교실 사이에 복도·계단처럼 떨어진 곳이 있으면 표시합니다. 표시한 곳은 화면에서 살짝 띄워지고, 자동 배치 때 시험실과 자습실이 그곳을 사이에 두고 떨어지면 빈 교실(완충)을 두지 않습니다.">${ui.gapEdit ? '✓ 띄워진 공간 넣기 끝' : '띄워진 공간 넣기'}</button>`}</th>${usable.map((i, k) => {
              const gap = gapAfter(i);
              const tgl = ui.gapEdit && !locked && k < usable.length - 1 ? `<button class="gap-tgl ${gap ? 'on' : ''}" data-act="pl-gap" data-i="${i}" title="${h(rooms[i].name)}와(과) ${h(rooms[usable[k + 1]].name)} 사이를 ${gap ? '붙이기' : '띄우기 (복도·계단 등으로 떨어져 있음)'}">${gap ? '⇤⇥' : '⇹'}</button>` : '';
              return `<th class="pl-room ${gap ? 'gap-after' : ''}"><div class="r-name">${h(rooms[i].name)}</div><div class="muted sm">${h(rooms[i].ban || (C.isExtraRoom(rooms[i]) ? '별도실' : ''))} · 최대 ${rooms[i].cap || '-'}명</div>${tgl}</th>`;
            }).join('')}</tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>`);
    },
    actions: {
      async 'pl-auto'(el) {
        const slot = S.slots().find((x) => x.key === el.dataset.k);
        await autoPlaceOne(slot);
      },
      async 'pl-auto-all'() {
        const rule = st().options.autoMode === 'rule';
        const any = S.slots().some((sl) => S.cells(sl.key).some(Boolean));
        const v = await U.modal({
          title: '전체 자동 배치',
          body: rule ? `<p>모든 교시를 <b>학교 규칙</b>으로 배치합니다.</p><ul class="hint-list">
              <li>전체 학생이 보는 과목: 각 반 <b>자기 교실</b>에서 시험</li>
              <li>1개 반만 보는 과목: 인원에 맞는 <b>특별실</b>에서 시험, 나머지는 각자 교실에서 자습</li>
              <li>2~3개 반: <b>앞 교실</b>(1반 쪽)부터 시험실, 바로 다음 교실은 <b>빈 교실</b>, 그 뒤부터 자습실</li>
              <li>4개 반 이상: <b>뒤 교실</b>(마지막 반 쪽)부터 시험실, 그 앞 교실은 <b>빈 교실</b>, 앞 교실부터 자습실</li>
              <li>자습 인원이 넘치면 특별실을 쓰고, 그래도 모자랄 때만 빈 교실을 자습실로 씁니다.</li></ul>`
            : '<p>모든 교시(고사실)에 학생들을 자동 배치합니다.</p>',
          buttons: [{ label: '취소', value: null }, ...(any ? [{ label: '빈 칸만 채우기', value: 'keep' }] : []), { label: any ? '처음부터 다시 배치' : '자동 배치', value: 'fresh', cls: 'primary' }],
        });
        if (!v) return;
        if (rule) S.autoPlaceAll(v === 'fresh');
        else { if (v === 'fresh') S.clearAllPlacement(); for (const slot of S.slots()) await autoPlaceOne(slot, true); }
        U.toast('자동 배치를 마쳤습니다. 잘못된 칸은 끌어서 바꾸거나 칸 아래 버튼으로 고치세요. (Ctrl+Z 되돌리기)', 'ok');
      },
      'pl-gap-edit'() { ui.gapEdit = !ui.gapEdit; if (ui.gapEdit) U.toast('교실 이름 오른쪽의 ⇹ 를 누르면 그 사이가 띄워집니다. 다시 누르면 붙습니다.', 'ok'); rerender(); },
      'pl-gap'(el) { S.toggleRoomGap(+el.dataset.i); },
      'pl-lock'(el) { const k = el.dataset.k; S.toggleLock(k); U.toast(`${S.slots().find((x) => x.key === k).title}: ${S.isLocked(k) ? '잠갔습니다. 자동 배치·편집으로 바뀌지 않습니다.' : '잠금을 풀었습니다.'}`, 'ok'); },
      'pl-lock-all'(el) { const on = el.dataset.on === '1'; S.setAllLocks(on); U.toast(on ? '모든 교시를 잠갔습니다.' : '모든 교시 잠금을 풀었습니다.', 'ok'); },
      'pl-compact'() { ui.plCompact = !ui.plCompact; rerender(); },
      'pl-check-sec'() { checkSections(); },
      'pl-check-room'() { checkRooms(); },
      'pl-balance'(el) {
        const r = S.rebalance(el.dataset.k);
        if (r.waitAdded) U.toast(`자습 학생 ${r.waitAdded}명을 대기실 빈자리에 고르게 배치하였습니다.`, 'ok');
        if (r.waitRemoved) U.toast(`대기실 인원을 실제 자습 인원에 맞게 ${r.waitRemoved}명 줄였습니다.`, 'ok');
        if (r.waitShort) U.toast(`대기실 자리가 ${r.waitShort}명 부족합니다. 특별실이나 빈 교실을 [자습실]로 지정하세요.`, 'error');
        if (!r.moved && !r.unresolved.length && !r.waitAdded && !r.waitRemoved && !r.waitShort) U.toast('맞출 인원이 없습니다. (정원 초과·미배치 없음)', 'ok'); else balanceToast(r);
      },
      'pl-issue-go'(el) { goIssue({ slot: el.dataset.k, i: el.dataset.i === '' || el.dataset.i == null ? null : +el.dataset.i }); },
      'pl-roster'(el) { rosterWindow(S.slots().find((x) => x.key === el.dataset.k), +el.dataset.i); },
      /** 칸마다 고사장 / 자습실 / 빈 교실 지정 */
      'pl-quick'(el) {
        const slot = S.slots().find((x) => x.key === el.dataset.k), i = +el.dataset.i, kind = el.dataset.q;
        const s = st(), room = s.rooms[i], sbm = S.sbMap(), info = S.slotInfo(slot);
        const cells = S.cells(slot.key); const cur = C.parseCell(cells[i]);
        const rest = cells.slice(); rest[i] = '';
        if (kind === 'void') return S.setCell(slot.key, i, cur.type === 'void' ? '' : C.VOID_CELL);
        if (kind === 'exam') {
          const homes = C.unplacedHomes(slot, rest, info);
          if (homes.length) {
            const hp = homes.find((x) => x.ban === room.ban) || homes[0];
            S.setCell(slot.key, i, C.homeCell(hp.subject, hp.ban));
            return U.toast(`${room.name} → ${C.onlySubject(hp.subject)} ${hp.ban} 학급 (${hp.count}명)`, 'ok');
          }
          const pend = C.unplacedBans(slot, rest, sbm);
          if (!pend.length) {
            // 남은 분반이 없으면 '추가 고사장'으로: 정원을 넘는 같은 과목 학생을 이 교실로 옮긴다
            const ros = S.rosterBase(slot);
            const over = {};
            for (const [j, r] of ros.rooms) if (j !== i && r.kind === 'exam') { const cp = Number(s.rooms[j].cap) || Infinity; if (r.list.length > cp) over[r.subject] = (over[r.subject] || 0) + r.list.length - cp; }
            const subj = Object.keys(over).sort((a, b) => over[b] - over[a])[0];
            if (!subj) return U.toast('이 교시에는 남은 시험 분반도, 정원을 넘는 시험실도 없습니다.', 'error');
            const b = S.setCell(slot.key, i, C.moreCell(subj));
            return U.toast(`${room.name}을(를) ${C.onlySubject(subj)} 추가 고사장으로 정하고 정원 초과 ${b.moved}명을 옮겼습니다.${b.unresolved.length ? ' (아직 초과 남음)' : ''}`, b.unresolved.length ? 'error' : 'ok');
          }
          const no = C.val(room.ban), capN = Number(room.cap) || Infinity;
          const pick = pend.find((x) => no && C.classNoOfRoom(x.room) === no) || pend.filter((x) => x.stuCount <= capN).sort((a, b) => b.stuCount - a.stuCount)[0] || pend[0];
          balanceToast(S.setCell(slot.key, i, pick.key));
          return U.toast(`${room.name} → ${C.onlySubject(pick.subject)} ${pick.index}반 (${pick.stuCount}명)`, 'ok');
        }
        // 자습실: 이 교실을 자습실로 정하고, 이 교시의 자습(미응시) 학생을 모든 자습실에 수용인원 안에서 고르게 나눔
        if (!info.wait) return U.toast('이 교시에는 자습(미응시) 학생이 없습니다.', 'error');
        const next = rest.slice();
        const waitIdx = next.map((v, j) => (C.parseCell(v).type === 'wait' ? j : -1)).filter((j) => j >= 0).concat(i).sort((a, b) => a - b);
        const capOf = (j) => Number(s.rooms[j].cap) || info.wait;
        const totalCap = waitIdx.reduce((t, j) => t + capOf(j), 0);
        // 균등 분배: 작은 교실부터 정원을 넘지 않게, 남는 인원은 다음 교실로
        let left = info.wait, rooms = waitIdx.slice().sort((a, b) => capOf(a) - capOf(b));
        const give = {};
        rooms.forEach((j, k) => { const share = Math.ceil(left / (rooms.length - k)); give[j] = Math.min(capOf(j), share); left -= give[j]; });
        waitIdx.forEach((j) => { next[j] = give[j] > 0 ? C.waitCell(give[j]) : ''; });
        const bb = S.setCells(slot.key, next, `${room.name} 자습실 지정`);
        if (bb.unresolved.length) balanceToast({ moved: 0, unresolved: bb.unresolved });
        U.toast(`${room.name}을(를) 자습실로 정하고 자습 학생 ${info.wait}명을 자습실 ${waitIdx.length}곳에 나눴습니다. (${waitIdx.map((j) => `${s.rooms[j].name} ${give[j]}`).join(' · ')})${totalCap < info.wait ? ` — 수용인원이 ${info.wait - totalCap}명 부족합니다.` : ''}`, totalCap < info.wait ? 'error' : 'ok');
      },
      async 'pl-clear'(el) { if (await U.confirm('이 교시의 배치를 초기화할까요?')) S.clearSlot(el.dataset.k); },
      async 'pl-clear-all'() { if (await U.confirm('모든 교시의 배치를 초기화할까요?')) S.clearAllPlacement(); },
      'pl-cell'(el) {
        const slot = S.slots().find((x) => x.key === el.dataset.k);
        const i = +el.dataset.i;
        if (st().confirmed.placement) return showRoomInfo(slot, i);
        cellEditor(slot, i);
      },
      async 'pl-confirm'() {
        const res = S.confirmPlacement();
        if (res.errors.length) {
          ui.plCheck = true; rerender();
          await U.alertList('배치를 확정할 수 없습니다', `고칠 곳이 ${res.errors.length}건 있습니다. 확인을 누르면 첫 번째 문제 칸으로 이동합니다. (화면에 빨간 칸으로 표시됩니다)`, res.errors);
          return goIssue(res.issues && res.issues[0]);
        }
        ui.plCheck = false;
        U.toast(`배치를 확정하였습니다. (${res.seating.length}건)${res.notices.length ? ` 다른 반 대기실 배정 ${res.notices.length}건은 위쪽 안내에서 볼 수 있습니다.` : ''}`, 'ok');
      },
      'pl-opt-help'() {
        U.modal({
          title: '배치 방식의 차이', wide: true,
          body: `<h4>자동 배치</h4><ul class="hint-list">
            <li><b>학교 규칙</b>(권장): 전체 응시 과목은 자기 교실, 1개 반은 특별실, 2~3개 반은 앞 교실부터, 4개 반 이상은 뒤 교실부터 시험실로 쓰고 시험실 옆 교실 하나를 <b>빈 교실</b>로 비워 자습 소음을 막습니다.</li>
            <li><b>학반 교실 우선</b>: 과목-분반을 강의실 번호와 같은 반 교실(예: <code>4(2학년 4반)</code> → 4반 교실)에 넣고, 그 반 미응시 학생이 그 교실에서 대기하도록 배치합니다. 학생 이동이 가장 적습니다.</li>
            <li><b>원본 엑셀과 동일</b>: 고사실 순서대로 과목-분반을 먼저 채우고, 남은 고사실을 최대 수용인원까지 대기실로 채웁니다.</li></ul>
            <h4 class="mt">대기 학생 배정 (배치 확정 시)</h4><ul class="hint-list">
            <li><b>반별 우선</b>: 모든 대기실에 각자 반 학생을 먼저 넣은 뒤, 남는 학생만 빈자리에 보냅니다.</li>
            <li><b>원본 엑셀과 동일</b>: 고사실 순서대로 같은 반 학생을 넣고 남는 자리는 명단 앞쪽(1반부터) 학생으로 채웁니다. 기존 엑셀과 똑같은 명단이 필요할 때 선택하세요.</li></ul>
            <p class="hint">기존 엑셀 파일을 이어받으면 두 항목 모두 '원본 엑셀과 동일'로 설정됩니다.</p>`,
        });
      },
      async 'pl-unconfirm'() {
        const msg = st().confirmed.seats ? '응시현황이 확정 상태입니다.\n응시현황 확정을 취소하고, 배치를 확정 취소할까요?' : '배치 확정을 취소할까요?\n\n좌석번호 지정 내역도 삭제됩니다.';
        if (await U.confirm(msg)) S.unconfirmPlacement();
      },
    },
    change: { 'pl-opt'(el) { S.setOption(el.dataset.f, el.value); } },
    dropCell(fromK, fromI, toK, toI) {
      if (st().confirmed.placement || fromK !== toK || fromI === toI) return;
      balanceToast(S.swapCells(fromK, fromI, toI));
    },
  };

  /** 확정된 시간표를 수정할 수 있게 확정을 푼다 → 풀었으면 true */
  async function unlockTimetable() {
    const c = st().confirmed;
    const later = [c.placement && '학생 배치 확정', c.seats && '응시현황(좌석번호) 확정'].filter(Boolean);
    const ok = await U.confirm(`고사시간표 확정을 취소하고 수정할까요?${later.length ? `

함께 취소되는 단계: ${later.join(', ')}
- 고사실 배치 내용은 남지만, 시간표를 바꾼 교시는 다시 배치해야 합니다.
- 좌석번호는 배치 확정 후 다시 지정해야 합니다.` : ''}`, '시간표 수정', '수정하기');
    if (!ok) return false;
    S.unconfirmTimetable();
    U.toast('시간표 확정을 취소하였습니다. 과목을 끌어 옮기거나 자동 편성할 수 있습니다.', 'ok');
    return true;
  }

  async function autoPlaceOne(slot, bulk) {
    const info = S.slotInfo(slot);
    let useExtra = false;
    if (st().options.autoMode !== 'rule' && C.canUseExtra(info, st().rooms) && info.wait > 0) {
      const extra = st().rooms.filter(C.isExtraRoom).length;
      useExtra = await U.confirm(`♥ ${slot.title} 수험생을 별도 고사실에 배치할까요?\n\n시험 과목: ${slot.subjects.join(', ')}\n필요 고사실 수: ${info.banTotal}\n별도 고사실 수: ${extra}\n\n'예'를 누르면 응시 학생은 별도실로 이동하고, 나머지 학생은 소속 학반에서 자습합니다.`, '별도실 배치');
    }
    S.autoPlace(slot, useExtra);
    if (!bulk) U.toast(`${slot.title} 자동 배치를 마쳤습니다.`, 'ok');
  }

  /** 자습 학생 가운데 자기 반 교실에서 자습하는 비율 */
  function ownWait(slot, ros, locked) {
    const rooms = st().rooms;
    let own = 0, all = 0;
    if (locked) {
      for (const r of st().seating) if (r.slot === slot.key && r.subject === '미응시') { all++; if (rooms[r.roomIndex] && rooms[r.roomIndex].ban === r.ban) own++; }
    } else if (ros) {
      for (const [i, r] of ros.rooms) if (r.kind === 'wait') for (const x of r.list) { all++; if (rooms[i].ban === x.ban) own++; }
    }
    return { own, all };
  }
  const ownRate = (slot, ros, locked) => { const w = ownWait(slot, ros, locked); return w.all ? `<div class="own-rate ${w.own === w.all ? 'full' : ''}" title="자습 ${w.all}명 중 ${w.own}명이 자기 반 교실에서 자습">자기 반 자습 ${Math.round((w.own / w.all) * 100)}%</div>` : ''; };
  const allOwnRate = (locked) => {
    let own = 0, all = 0;
    for (const sl of S.slots()) { const w = ownWait(sl, locked ? null : S.roster(sl), locked); own += w.own; all += w.all; }
    return all ? `자기 반 자습 비율 ${Math.round((own / all) * 1000) / 10}% (${own}/${all}명)` : '';
  };
  /** 분반 점검: 교시마다 시험 분반 → 고사실·인원 */
  function checkSections() {
    const s = st(), sbm = S.sbMap();
    const rows = [];
    for (const sl of S.slots()) {
      if (sl.study) continue;
      const cells = S.cells(sl.key), ros = S.roster(sl);
      for (const subj of sl.subjects) {
        const secs = [...sbm.values()].filter((x) => x.subject === subj);
        const homes = cells.map((v, i) => [C.parseCell(v), i]).filter(([c]) => c.type === 'home' && c.subject === subj);
        if (homes.length) homes.forEach(([c, i]) => rows.push({ sl, subj, sec: `${c.ban} 학급`, room: s.rooms[i].name, n: ros.rooms.get(i) ? ros.rooms.get(i).list.length : 0, cap: s.rooms[i].cap }));
        else secs.forEach((x) => { const i = cells.findIndex((v) => v === x.key); rows.push({ sl, subj, sec: `${S.secName(x) || x.index + '반'} (${C.roomLabel(x.room)})`, room: i >= 0 ? s.rooms[i].name : '', n: i >= 0 && ros.rooms.get(i) ? ros.rooms.get(i).list.length : x.stuCount, cap: i >= 0 ? s.rooms[i].cap : 0 }); });
      }
    }
    const bad = rows.filter((r) => !r.room || (Number(r.cap) > 0 && r.n > Number(r.cap))).length;
    U.modal({
      title: `분반 점검 — ${rows.length}개 분반${bad ? `, 확인 필요 ${bad}개` : ', 모두 정상'}`,
      body: `<div class="table-wrap mid"><table class="tbl compact"><thead><tr><th>교시</th><th>과목</th><th>분반</th><th>고사실</th><th class="right">인원 / 정원</th></tr></thead><tbody>${rows.map((r) => `<tr class="${!r.room || (Number(r.cap) > 0 && r.n > Number(r.cap)) ? 'warn-row' : ''}"><td>${h(r.sl.title)}</td><td>${h(C.onlySubject(r.subj))}</td><td>${h(r.sec)}</td><td>${r.room ? h(r.room) : '<span class="bad-text">미배치</span>'}</td><td class="right">${r.n} / ${r.cap || '-'}</td></tr>`).join('')}</tbody></table></div>`,
      buttons: [{ label: '닫기', value: null }],
    });
  }
  /** 고사실 점검: 고사실마다 시험·자습·빈 교실 횟수, 최대 인원 */
  function checkRooms() {
    const s = st();
    const rows = s.rooms.map((r, i) => ({ r, i, exam: 0, wait: 0, empty: 0, max: 0, over: 0 })).filter((x) => C.isRoomUsable(x.r));
    for (const sl of S.slots()) {
      const cells = S.cells(sl.key), ros = S.roster(sl);
      for (const x of rows) {
        const c = C.parseCell(cells[x.i]), n = ros.rooms.get(x.i) ? ros.rooms.get(x.i).list.length : 0;
        if (c.type === 'wait') x.wait++; else if (c.type === 'exam' || c.type === 'home' || c.type === 'more') x.exam++; else x.empty++;
        x.max = Math.max(x.max, n); if (Number(x.r.cap) > 0 && n > Number(x.r.cap)) x.over++;
      }
    }
    U.modal({
      title: `고사실 점검 — ${rows.length}실 · ${S.slots().length}개 교시`,
      body: `<div class="table-wrap mid"><table class="tbl compact"><thead><tr><th>고사실</th><th>구분</th><th class="right">시험</th><th class="right">자습</th><th class="right">빈 교실·미사용</th><th class="right">최대 인원 / 정원</th><th class="right">정원 초과</th></tr></thead><tbody>${rows.map((x) => `<tr class="${x.over ? 'warn-row' : ''}"><td><b>${h(x.r.name)}</b></td><td>${h(x.r.ban || '특별실')}</td><td class="right">${x.exam}</td><td class="right">${x.wait}</td><td class="right">${x.empty}</td><td class="right">${x.max} / ${x.r.cap || '-'}</td><td class="right">${x.over ? `<span class="bad-text">${x.over}회</span>` : '-'}</td></tr>`).join('')}</tbody></table></div>`,
      buttons: [{ label: '닫기', value: null }],
    });
  }

  /** 문제 칸(또는 교시)으로 스크롤하고 깜빡여 표시 */
  function goIssue(x) {
    if (!x) return;
    const el = x.i != null && x.slot ? document.querySelector(`td.pl-cell[data-k="${x.slot}"][data-i="${x.i}"]`)
      : x.slot ? document.querySelector(`[data-act="pl-auto"][data-k="${x.slot}"]`)?.closest('tr') : null;
    if (!el) return;
    // 표 자체 스크롤 영역 안에서 가운데로 (scrollIntoView 는 겹친 스크롤 영역에서 잘 동작하지 않음)
    const wrap = el.closest('.table-wrap');
    if (wrap) {
      const wr = wrap.getBoundingClientRect(), r = el.getBoundingClientRect();
      wrap.scrollTop += r.top - wr.top - (wrap.clientHeight - r.height) / 2;
      wrap.scrollLeft += r.left - wr.left - (wrap.clientWidth - r.width) / 2;
      const top = wrap.getBoundingClientRect().top;
      if (top < 0 || top > innerHeight * 0.5) window.scrollBy(0, top - 80);
    } else el.scrollIntoView({ block: 'center' });
    el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600);
  }

  /** 정원 맞추기 결과 알림 */
  function balanceToast(r) {
    if (!r) return;
    const rooms = st().rooms;
    if (r.moved) U.toast(`정원을 넘는 ${r.moved}명을 같은 과목 고사실의 빈자리로 옮겼습니다. (인원 ▸ 를 누르면 명단 확인·조정)`, 'ok');
    if (r.unresolved.length) U.toast(`${r.unresolved.map((x) => `${rooms[x.i].name} ${x.over}명`).join(', ')} 초과 — 같은 과목 고사실에 빈자리가 없습니다. 특별실을 고사장으로 더 지정하세요.`, 'error');
  }

  /** 고사실 학생 명단 창: 학생마다 다른 고사실로 강제 이동 (같은 과목 시험실끼리, 자습실끼리) */
  function rosterWindow(slot, i) {
    const s = st(), rooms = s.rooms, locked = s.confirmed.placement;
    const key = (x) => C.studentKey(x.ban, x.num);
    const body = () => {
      let list, kind, subject;
      if (locked) {
        list = s.seating.filter((r) => r.slot === slot.key && r.roomIndex === i).sort((a, b) => a.order - b.order);
        kind = list[0] && list[0].subject === '미응시' ? 'wait' : 'exam'; subject = list[0] && list[0].subject;
      } else {
        const r = S.roster(slot).rooms.get(i);
        if (!r) return { html: '<p class="muted">이 고사실에는 배치된 학생이 없습니다.</p>', n: 0 };
        list = r.list; kind = r.kind; subject = r.subject;
      }
      const ros = locked ? null : S.roster(slot), base = locked ? null : S.rosterBase(slot);
      const originOf = (k) => { if (!base) return i; for (const [j, r] of base.rooms) if (r.list.some((x) => key(x) === k)) return j; return i; };
      // 옮길 수 있는 고사실: 같은 종류(시험실/자습실)이고 시험실이면 같은 과목
      const targets = (stu) => {
        if (!ros) return [];
        return [...ros.rooms.entries()].filter(([, r]) => r.kind === kind && (kind === 'wait' || r.subject === stu.subject)).map(([j, r]) => ({ j, n: r.list.length, cap: Number(rooms[j].cap) || 0 }));
      };
      const cap = Number(rooms[i].cap) || 0;
      const rowsHtml = list.map((x, n) => {
        const k = key(x), origin = originOf(k);
        const opts = targets(x);
        const sel = locked || opts.length < 2 ? `<span class="muted">${h(rooms[i].name)}</span>` :
          `<select class="input sm" data-mv="${h(k)}" data-origin="${origin}">${opts.map((o) => `<option value="${o.j}" ${o.j === i ? 'selected' : ''}>${h(rooms[o.j].name)} (${o.n}${o.cap ? '/' + o.cap : ''}명)${o.j === origin ? ' · 원래' : ''}</option>`).join('')}</select>`;
        return `<tr class="${x.moved ? 'on' : ''}"><td>${n + 1}</td><td>${C.studentNo(x.grade, x.ban, x.num)}</td><td>${h(x.name)}</td><td>${h(x.ban)}</td>${kind === 'exam' ? `<td class="muted sm">${h(C.roomLabel(x.room || x.classRoom || ''))}</td>` : ''}<td>${sel}${x.moved ? ' <span class="badge info">이동</span>' : ''}</td></tr>`;
      }).join('');
      const over = cap && list.length > cap;
      return {
        n: list.length,
        html: `<p>${kind === 'wait' ? '대기(자습)' : h(C.onlySubject(subject))} · <b>${list.length}명</b>${cap ? ` / 최대 ${cap}명` : ''} ${over ? `<span class="badge warn">${list.length - cap}명 초과</span>` : ''}</p>
          ${locked ? '<p class="hint">배치가 확정되어 보기만 할 수 있습니다. 옮기려면 [배치 확정 취소]를 누르세요.</p>' : '<p class="hint">이동할 고사실을 고르면 바로 옮겨집니다. 같은 과목 시험실끼리, 자습실끼리만 옮길 수 있습니다. (Ctrl+Z 되돌리기)</p>'}
          <div class="table-wrap mid"><table class="tbl compact"><thead><tr><th>연번</th><th>학번</th><th>성명</th><th>반</th>${kind === 'exam' ? '<th>수강 분반</th>' : ''}<th>고사실</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>`,
      };
    };
    U.modal({
      title: `${slot.title} · ${rooms[i].name} 학생 명단`, wide: true, body: body().html,
      buttons: [{ label: '닫기', value: null, cls: 'primary' }],
      onMount(m) {
        m.addEventListener('change', (e) => {
          const sel = e.target.closest('[data-mv]');
          if (!sel) return;
          const to = +sel.value, origin = +sel.dataset.origin;
          S.moveStudent(slot.key, sel.dataset.mv, to === origin ? null : to);
          U.toast(`${rooms[to].name}(으)로 옮겼습니다.`, 'ok');
          m.querySelector('.modal-body').innerHTML = body().html;
        });
      },
    });
  }

  function cellEditor(slot, i) {
    const s = st(), room = s.rooms[i], sb = S.sbMap();
    const info = S.slotInfo(slot), cells = S.cells(slot.key);
    const cur = C.parseCell(cells[i]);
    const stt = C.slotPlacementStatus(slot, cells, info, sb, s.rooms);
    const pending = C.unplacedBans(slot, cells, sb);
    // 학반별 고사장 후보: 이 교실의 반 학생 중 이 교시 응시생 (분반과 무관)
    const homePicks = [];
    const curHome = cur.type === 'home' ? C.homeCell(cur.subject, cur.ban) : '';
    for (const subj of slot.subjects) {
      const n = room.ban ? C.homeSize(info, subj, room.ban) : 0;
      const k = room.ban ? C.homeCell(subj, room.ban) : '';
      if (n && !cells.some((v, j) => j !== i && v === k)) homePicks.push({ k, subj, ban: room.ban, n });
    }
    C.unplacedHomes(slot, cells, info).forEach((x) => { const k = C.homeCell(x.subject, x.ban); if (!homePicks.some((p) => p.k === k) && k !== curHome) homePicks.push({ k, subj: x.subject, ban: x.ban, n: x.count }); });
    const remainWait = stt.remainWait + (cur.type === 'wait' ? cur.count : 0);
    const cap = Number(room.cap) || remainWait;
    const sugg = Math.max(0, Math.min(remainWait, cap));
    const classNo = C.val(room.ban);
    const waitHints = Object.entries(info.waitByBan).sort((a, b) => C.cmp(a[0], b[0])).map(([b, n]) => `<span class="pill ${b === room.ban ? 'hl' : ''}">${h(b)} ${n}명</span>`).join('');
    U.modal({
      title: `${slot.title} · ${room.name}${room.ban ? ` (${room.ban})` : ''}`,
      wide: true,
      body: `
        <p class="muted">현재: <b>${h(cur.type === 'exam' ? cur.key : cur.type === 'home' ? `${C.onlySubject(cur.subject)} ${cur.ban} 학급` : cur.type === 'more' ? `${C.onlySubject(cur.subject)} 추가 고사장` : cur.type === 'wait' ? `대기 ${cur.count}명` : cur.type === 'void' ? '빈 교실' : '비어 있음')}</b> · 최대 수용인원 ${room.cap || '-'}명</p>
        <h4>시험 과목-분반 <span class="muted">(미배치 ${pending.length})</span></h4>
        ${pending.length ? `<div class="pick-grid">${pending.map((x) => `<button class="pick ${classNo && C.classNoOfRoom(x.room) === classNo ? 'hl' : ''}" data-pick="${h(x.key)}"><b>${h(C.onlySubject(x.subject))} ${x.index}반</b><span>${h(C.roomLabel(x.room))} · ${x.stuCount}명</span></button>`).join('')}</div>` : '<p class="muted">모든 과목-분반을 배치하였습니다.</p>'}
        ${homePicks.length ? `<h4 class="mt">학반별 고사장 <span class="muted">(분반과 상관없이 그 반 응시생 전원이 이 교실에서 시험)</span></h4>
          <div class="pick-grid">${homePicks.map((x) => `<button class="pick ${x.ban === room.ban ? 'hl' : ''}" data-pick="${h(x.k)}"><b>${h(C.onlySubject(x.subj))} – ${h(x.ban)} 학급</b><span>${x.n}명</span></button>`).join('')}</div>` : ''}
        <h4 class="mt">추가 고사장 <span class="muted">(분반은 그대로 두고, 정원을 넘는 같은 과목 학생을 이 교실로 옮김)</span></h4>
        <div class="pick-grid">${slot.subjects.map((x) => `<button class="pick" data-pick="${h(C.moreCell(x))}"><b>${h(C.onlySubject(x))} 추가 고사장</b><span>정원 초과 학생 받기</span></button>`).join('')}</div>
        <h4 class="mt">대기(미응시 학생 자습)</h4>
        ${info.wait ? `<p class="muted">남은 대기 인원 <b>${remainWait}명</b> / 전체 ${info.wait}명 · 반별 미응시 인원: ${waitHints}</p>
          <div class="inline-form"><input type="number" class="input sm num" min="1" max="${Math.max(remainWait, 1)}" value="${sugg || ''}" data-wait-n> 명 <button class="btn outline sm" data-wait>대기 배치</button></div>` : '<p class="muted">이 교시에는 미응시 학생이 없습니다.</p>'}`,
      buttons: [{ label: '비우기', value: 'clear', cls: 'danger-text ghost' }, { label: '빈 교실로 지정', value: 'void', cls: 'ghost' }, { label: '닫기', value: null }],
      onMount(m, close) {
        m.addEventListener('click', (e) => {
          const b = e.target.closest('[data-pick]');
          if (b) { balanceToast(S.setCell(slot.key, i, b.dataset.pick)); close(); return; }
          if (e.target.closest('[data-wait]')) {
            const n = Number(m.querySelector('[data-wait-n]').value);
            if (!(n > 0)) return U.toast('대기 인원을 입력하세요.', 'error');
            if (n > remainWait) return U.toast(`대기 인원은 ${remainWait}명까지 배치할 수 있습니다.`, 'error');
            if (room.cap && n > room.cap) U.toast(`최대 수용인원(${room.cap}명)을 초과합니다.`, 'error');
            S.setCell(slot.key, i, C.waitCell(n)); close();
          }
        });
      },
    }).then((v) => { if (v === 'clear') S.setCell(slot.key, i, ''); if (v === 'void') S.setCell(slot.key, i, C.VOID_CELL); });
  }

  function showRoomInfo(slot, i) {
    const room = st().rooms[i];
    const list = st().seating.filter((r) => r.slot === slot.key && r.roomIndex === i);
    const by = {};
    list.forEach((r) => { by[r.ban] = (by[r.ban] || 0) + 1; });
    U.modal({
      title: `【${room.name}】 ${slot.title} ${list[0] ? C.onlySubject(list[0].subject) : ''}`,
      body: list.length ? `<table class="tbl compact"><thead><tr><th>반</th><th>인원</th></tr></thead><tbody>${Object.entries(by).sort((a, b) => C.cmp(a[0], b[0])).map(([b, n]) => `<tr class="${b === room.ban ? 'on' : ''}"><td>${h(b)}</td><td>${n}명</td></tr>`).join('')}<tr class="sum"><td>계</td><td>${list.length}명</td></tr></tbody></table>` : '<p class="muted">배치된 학생이 없습니다.</p>',
    });
  }

  // ================================================================ 9. 응시현황·좌석
  const seats = {
    id: 'seats', no: 9, title: '응시현황',
    status: () => st().confirmed.seats,
    render() {
      const s = st();
      if (!s.confirmed.placement) return stepHead(9, '응시현황 및 좌석번호 부여') + needFirst('먼저 학생 배치를 확정하세요.', 'placement', '7. 학생 배치');
      const locked = s.confirmed.seats;
      const f = ui.seatFilter;
      const days = [...new Set(s.seating.map((r) => r.day))];
      const periods = [...new Set(s.seating.map((r) => r.period))].sort(C.cmp);
      const roomsN = [...new Set(s.seating.map((r) => r.room))];
      const shown = s.seating.filter((r) => (!f.day || r.day === f.day) && (!f.period || r.period === f.period) && (!f.room || r.room === f.room));
      const blank = s.seating.filter((r) => !(r.seat > 0)).length;
      let msg, type = 'info';
      if (locked) { msg = '응시현황(좌석번호)을 확정하였습니다. 고사시간표 작성 완료! <b>10. 인쇄 및 출력물</b>에서 인쇄하세요.'; type = 'ok'; }
      else if (blank) msg = `좌석번호가 없는 학생이 ${blank}명 있습니다. <b>좌석 학번순</b> 또는 <b>좌석 랜덤</b>을 누르세요.`;
      else { msg = `좌석번호를 <b>${s.seatMethod === 'random' ? '랜덤으로' : '학번순으로'}</b> 자동 지정해 두었습니다. 이상이 없으면 <b>응시현황 확정</b>만 누르세요. <span class="muted">(바꾸려면 [좌석 학번순]·[좌석 랜덤] — 대기실은 랜덤에서 제외)</span>`; type = 'ok'; }
      const opt = (arr, v) => `<option value="">전체</option>${arr.map((x) => `<option ${x === v ? 'selected' : ''}>${h(x)}</option>`).join('')}`;
      // 1: 이름 검색 중이 아니면 200건씩 보여 준다 (검색은 줄 숨김 방식이라 검색 중에는 전부 그림)
      const limit = f.q ? 6000 : ui.seatShow;
      return stepHead(9, '응시현황 및 좌석번호 부여', '고사실별 응시 학생 명단입니다. 좌석번호를 학번순 또는 랜덤으로 지정한 뒤 확정합니다.',
        `<button class="btn ghost" data-act="seat-export">엑셀 저장</button>` +
        (locked ? '' : `<button class="btn outline" data-act="seat-order">좌석 학번순</button><button class="btn outline" data-act="seat-random">좌석 랜덤</button>`) +
        confirmBtn(locked, '응시현황 확정 취소', '응시현황 확정', locked ? 'seat-unconfirm' : 'seat-confirm')) +
        banner(type, msg) +
        `<div class="toolbar">
          <select class="input sm" data-change="sf" data-f="day">${opt(days, f.day)}</select>
          <select class="input sm" data-change="sf" data-f="period">${opt(periods, f.period)}</select>
          <select class="input sm" data-change="sf" data-f="room">${opt(roomsN, f.room)}</select>
          <input class="input sm search" type="search" placeholder="이름·반·과목" data-change="sf" data-f="q" data-filter="seat-tbody" value="${h(f.q)}">
          <span class="muted" data-filter-count="seat-tbody" data-fmt="{n}건 / 전체 ${s.seating.length}건">${shown.length}건 / 전체 ${s.seating.length}건</span>
        </div>
        <div class="table-wrap tall"><table class="tbl compact">
          <thead><tr><th>일차</th><th>교시</th><th>고사실</th><th>과목</th><th>학번</th><th>반</th><th>번호</th><th>성명</th><th>강의실</th><th>학번순</th><th>좌석번호</th></tr></thead>
          <tbody id="seat-tbody">${shown.slice(0, limit).map((r) => `<tr class="${r.subject === '미응시' ? 'dim' : ''}" data-q="${h(`${r.ban} ${r.num} ${r.name} ${r.subject}`)}"><td>${r.day}</td><td>${r.period}</td><td>${h(r.room)}</td><td>${h(r.subject)}</td><td>${C.studentNo(r.grade, r.ban, r.num)}</td><td>${h(r.ban)}</td><td>${r.num}</td><td>${h(r.name)}</td><td>${h(C.roomLabel(r.classRoom))}</td><td>${r.order}</td><td><b>${r.seat > 0 ? r.seat : '-'}</b></td></tr>`).join('')}</tbody>
        </table>${shown.length > limit ? `<div class="more-row"><span class="muted">${shown.length}건 중 ${limit}건 표시</span> <button class="btn outline sm" data-act="seat-more">200건 더 보기</button> <button class="btn ghost sm" data-act="seat-all">전체 보기</button> <span class="muted sm">위에서 일차·교시·고사실을 고르면 바로 좁혀집니다</span></div>` : ''}</div>`;
    },
    actions: {
      async 'seat-order'() { if (await U.confirm('좌석번호를 학번순으로 지정할까요?')) { S.seatsInOrder(); U.toast('학번순으로 지정하였습니다.', 'ok'); } },
      async 'seat-random'() { if (await U.confirm('좌석번호를 랜덤으로 지정할까요?\n\n※ 대기실은 제외됩니다.')) { S.seatsRandom(); U.toast('랜덤으로 지정하였습니다.', 'ok'); } },
      'seat-confirm'() {
        const errs = S.confirmSeats();
        if (errs.length) return U.alertList('응시현황을 확정할 수 없습니다', '아래 내용을 확인하세요.', errs);
        U.toast('응시현황을 확정하였습니다. 출력물을 인쇄할 수 있습니다.', 'ok');
      },
      async 'seat-unconfirm'() { if (await unconfirmDialog('seats', '응시현황')) S.unconfirmSeats(); },
      'seat-export'() { exportSeating(); },
      'seat-more'() { ui.seatShow += 200; rerender(true); },
      'seat-all'() { ui.seatShow = 6000; rerender(true); },
    },
    change: { sf(el) { ui.seatFilter[el.dataset.f] = el.value; if (el.dataset.f !== 'q') rerender(true); } },
  };

  function exportSeating() {
    if (!window.XLSX) return U.alert('엑셀 모듈을 불러오지 못했습니다.');
    const rows = st().seating.map((r) => ({ 일차: r.day, 교시: r.period, 고사실: r.room, 과목: r.subject, 학년: r.grade, 반: r.ban, 번호: r.num, 성명: r.name, 학번: C.studentNo(r.grade, r.ban, r.num), 강의실: r.classRoom, 학번순: r.order, 좌석번호: r.seat ?? '' }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), '응시현황');
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    U.download(`응시현황_${S.title()}.xlsx`, new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  }

  // Esc: 시간표 과목 선택 취소
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && (ui.ttSel || ui.ttSwap)) { ui.ttSel = null; ui.ttSwap = false; ui.ttSwapA = null; rerender(); } });

  /** 이 화면의 title(브라우저 기본 도움말)을 풍선도움말(data-tip)로 바꾼다 */
  const tipify = (html) => html.replace(/ title="/g, ' data-tip="');
  let rerender = () => {};
  window.Views = {
    list: [roster, basic, subjects, evalv, stuSubj, timetable, placement, seats],
    setRerender(f) { rerender = f; },
    importFile,
    helpers: { stepHead, banner, needFirst, badge },
  };
})();
