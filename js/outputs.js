/* 10. 인쇄 및 출력물: 화면 미리보기와 인쇄용 페이지를 같은 마크업으로 만든다 */
(function () {
  'use strict';
  const C = window.Core, S = window.Store, h = U.esc;
  const st = () => S.state;
  const { stepHead, needFirst } = Views.helpers;

  const TABS = [
    ['all', '10-1 전체 시간표'],
    ['room', '10-2 고사실 응시현황'],
    ['roomtt', '10-3 고사실 시간표'],
    ['seat', '10-4 좌석 배치표'],
    ['class', '10-5 학급별'],
    ['student', '10-6 학생별'],
    ['label', '10-7 봉투 라벨'],
    ['sp', '10-8 별도 수험생'],
  ];
  const ui = { tab: 'all', slot: '', room: '', ban: '', day: '', student: '', labelSel: new Set() };

  // ---------------------------------------------------------------- 데이터 도우미
  /** 출력용 응시현황 (확정 응시현황 + 8. 별도 고사실 지정) */
  const seatAll = () => S.finalSeating();
  /** 고사실 정보: 일반 고사실 또는 별도실(번호 SPECIAL_BASE 이상) */
  const roomAt = (i) => (i >= S.SPECIAL_BASE ? S.specialRoom(i - S.SPECIAL_BASE + 1) : st().rooms[i]);
  /** '08:50 ~ 9:40' 에 추가 시간(분)을 더한 종료 시각 */
  const endWithExtra = (t, extra) => {
    const m = String(t || '').replace(/\s/g, '').match(/^(\d{1,2}):(\d{2})~(\d{1,2}):(\d{2})$/);
    if (!m || !extra) return '';
    const e = +m[3] * 60 + +m[4] + extra;
    return `${m[1]}:${m[2]} ~ ${Math.floor(e / 60)}:${String(e % 60).padStart(2, '0')}`;
  };
  /** 별도실의 그 교시 추가 시간: 학생마다 다를 수 있음 → { max, same } */
  const roomExtra = (slotKey, i) => {
    if (i < S.SPECIAL_BASE) return { max: 0, same: true };
    const ex = seatAll().filter((r) => r.slot === slotKey && r.roomIndex === i).map((r) => Number(r.extra) || 0);
    return { max: Math.max(0, ...ex), same: new Set(ex).size <= 1 };
  };
  const extraNote = (slot, i) => {
    const e = roomExtra(slot.key, i);
    if (!e.max) return '';
    return ` <b class="p-extra">${e.same ? `추가 ${e.max}분` : `학생별 추가 시간 (최대 ${e.max}분)`} → ${h(endWithExtra(slotTime(slot), e.max))}</b>`;
  };
  const extraTag = (r) => (r.special && r.extra ? ` +${r.extra}분` : '');
  const slotTime = (slot) => st().times[slot.key] || '';
  const slotDate = (slot) => st().dates[slot.day - 1] || '';
  const usedRooms = () => {
    const used = new Set(seatAll().map((r) => r.roomIndex));
    const sp = [...used].filter((i) => i >= S.SPECIAL_BASE).sort((a, b) => a - b).map((i) => ({ ...roomAt(i), i }));
    return st().rooms.map((r, i) => ({ ...r, i })).filter((r) => used.has(r.i)).concat(sp);
  };
  /** 회차·고사실 칸 정보: {kind:'exam'|'wait'|'', subject, count, classRoom, ban} */
  /** 고사실 칸 정보. 인원은 응시현황(학생 이동 반영)에서 센다 */
  function cellOf(slot, i) {
    const here = seatAll().filter((r) => r.slot === slot.key && r.roomIndex === i);
    const real = here.length;
    if (i >= S.SPECIAL_BASE) {
      // 별도실: 여러 과목 학생이 함께 볼 수 있음
      if (!real) return { kind: '' };
      const subs = [...new Set(here.map((r) => r.subject))];
      return { kind: 'exam', subject: subs.map(C.onlySubject).join(', '), subjects: subs, count: real, classRoom: '별도실', label: roomAt(i).name, special: true };
    }
    const c = C.parseCell(S.cells(slot.key)[i]);
    if (c.type === 'exam') { const x = S.sbMap().get(c.key); return { kind: 'exam', subject: x.subject, count: real, classRoom: x.room, label: S.secName(x) }; }
    if (c.type === 'more') return { kind: 'exam', subject: c.subject, count: real, classRoom: '추가 고사장', label: '추가 고사장' };
    if (c.type === 'home') return { kind: 'exam', subject: c.subject, count: real, classRoom: `${c.ban} 학급`, label: `${c.ban} 학급` };
    if (c.type === 'wait') return { kind: 'wait', subject: '미응시', count: real };
    return { kind: '' };
  }
  const roster = (slotKey, i) => seatAll().filter((r) => r.slot === slotKey && r.roomIndex === i).sort((a, b) => a.seat - b.seat || a.order - b.order);
  const byStudent = () => {
    const m = new Map();
    seatAll().forEach((r) => m.set(`${C.studentKey(r.ban, r.num)}|${r.slot}`, r));
    return m;
  };
  const examDays = () => [...new Set(S.slots().map((s) => s.day))];
  const examPeriods = () => [...new Set(S.slots().map((s) => s.period))].sort((a, b) => a - b);
  /** 첫 칸(머리 칸)들은 정한 너비, 나머지 n칸은 남은 너비를 똑같이 나누는 colgroup */
  const eqCols = (heads, n) => {
    const used = heads.reduce((t, w) => t + w, 0), each = ((100 - used) / Math.max(1, n)).toFixed(3);
    return `<colgroup>${heads.map((w) => `<col style="width:${w}%">`).join('')}${Array.from({ length: n }, () => `<col style="width:${each}%">`).join('')}</colgroup>`;
  };
  const schoolLine = () => (S.school() ? `<div class="p-school">${h(S.school())}</div>` : '');
  const pageHead = (title, sub = '') => `<div class="p-head">${schoolLine()}<div class="p-title">${h(title)}</div>${sub ? `<div class="p-sub">${sub}</div>` : ''}</div>`;

  // ---------------------------------------------------------------- 9-1 전체 시간표 (MakeGradeTable)
  function pageAll() {
    const rooms = usedRooms(), slots = S.slots();
    let body = '', lastDay = 0;
    slots.forEach((slot) => {
      const sameDay = slots.filter((s) => s.day === slot.day).length;
      const cells = rooms.map((r) => cellOf(slot, r.i));
      // 같은 과목이 이어지면 한 칸으로 합침 (일반 고사실과 별도실은 합치지 않음)
      const groups = [];
      cells.forEach((c, k) => {
        const label = c.kind === 'exam' ? C.onlySubject(c.subject) : c.kind === 'wait' ? '대기(자습)' : '·';
        const sp = rooms[k].i >= S.SPECIAL_BASE;
        const g = groups[groups.length - 1];
        if (g && g.label === label && label !== '·' && g.sp === sp) g.span++; else groups.push({ label, span: 1, kind: c.kind, sp });
      });
      const total = cells.reduce((t, c) => t + (c.kind === 'exam' ? c.count : 0), 0);
      const dayCell = slot.day !== lastDay ? `<td class="p-date" rowspan="${sameDay * 2}">${h(U.fmtDateShort(slotDate(slot)) || slot.day + '일차')}</td>` : '';
      lastDay = slot.day;
      body += `<tr class="r1">${dayCell}<td class="p-gyosi">${slot.period}교시<small>(${C.minutesOf(slotTime(slot))})</small></td>${groups.map((g) => `<td colspan="${g.span}" class="${g.kind === 'wait' ? 'p-wait' : ''} ${g.sp ? 'p-sp' : ''}">${h(g.label)}</td>`).join('')}<td rowspan="2" class="p-total">${total}</td></tr>
        <tr class="r2"><td class="p-time">${h(slotTime(slot).replace(/\s/g, ''))}</td>${cells.map((c, k) => `<td class="p-cnt ${rooms[k].i >= S.SPECIAL_BASE ? 'p-sp' : ''}">${c.count || '·'}</td>`).join('')}</tr>`;
    });
    const size = slots.length > 11 ? 'all-s' : slots.length > 8 ? 'all-m' : 'all-l';
    return `<div class="page landscape fill allpage ${size} ${st().out.paper === 'B4' ? 'b4' : ''}" data-sheet="전체 시간표"><div class="seat-head">${schoolLine()}<div class="sh-sub">${h(S.title())}</div><div class="sh-title">시험시간표</div><div class="sh-note">위 칸: 시험 과목 · 아래 칸: 고사실 인원 (대기 = 미응시 학생 자습)${rooms.some((r) => r.i >= S.SPECIAL_BASE) ? ' · 연한 갈색 칸: 별도실' : ''}</div></div>
      <table class="ptbl all fill-main"><colgroup><col class="c-date"><col class="c-gubun">${rooms.map(() => `<col style="width:${(76 / Math.max(1, rooms.length)).toFixed(3)}%">`).join('')}<col class="c-total"></colgroup><thead><tr><th>날짜</th><th>구분</th>${rooms.map((r) => `<th class="${r.i >= S.SPECIAL_BASE ? 'p-sp' : ''}">${h(r.name)}</th>`).join('')}<th>응시계</th></tr></thead><tbody>${body}</tbody></table></div>`;
  }

  // ---------------------------------------------------------------- 9-2 고사실 응시현황표
  function pageRoom(slot, i) {
    const room = roomAt(i), c = cellOf(slot, i), list = roster(slot.key, i);
    const isWait = c.kind === 'wait';
    const perCol = 20, perPage = 40;
    const pages = [];
    for (let p = 0; p < Math.max(1, Math.ceil(list.length / perPage)); p++) pages.push(list.slice(p * perPage, (p + 1) * perPage));
    return pages.map((chunk, pi) => {
      const sp = !!c.special;
      const col = (arr, off) => `<table class="ptbl roster roster2"><thead><tr><th>연번</th><th>학번</th><th>성명</th>${sp ? '<th>과목</th><th>추가 시간</th>' : ''}<th>좌석</th><th>비고</th></tr></thead><tbody>${Array.from({ length: perCol }, (_, k) => {
        const r = arr[k];
        const ext = (x) => (x.extra ? `+${x.extra}분 <small>(~${h(endWithExtra(slotTime(slot), x.extra).split('~')[1] || '')})</small>` : '-');
        const g5 = (k + 1) % 5 === 0 ? 'g5' : '';
        return r ? `<tr class="${g5}"><td class="no">${pi * perPage + off + k + 1}</td><td>${C.studentNo(r.grade, r.ban, r.num)}</td><td class="nm">${h(r.name)}</td>${sp ? `<td>${h(C.onlySubject(r.subject))}</td><td>${ext(r)}</td>` : ''}<td class="seat"><span class="acc">${r.seat ?? ''}</span></td><td class="memo"></td></tr>` : `<tr class="blank ${g5}"><td class="no">&nbsp;</td><td></td><td></td>${sp ? '<td></td><td></td>' : ''}<td></td><td></td></tr>`;
      }).join('')}</tbody></table>`;
      const subj = isWait ? '대기(자습)' : (c.subject || '');
      return `<div class="page fill roompage" data-sheet="${h(`${slot.day}일${slot.period}교시 ${room.name}${pi ? ` (${pi + 1})` : ''}`)}">
        <div class="seat-head">${schoolLine()}<div class="sh-sub">${h(S.title())}</div><div class="sh-title">${isWait ? '대기실 인원현황표' : '고사실 응시현황표'}</div><div class="sh-line">${h(room.name)} · ${slot.period}교시 · ${h(subj)}${pi ? ` · (${pi + 1}쪽)` : ''}</div></div>
        <table class="ptbl seat-info"><thead><tr><th>시행일</th><th>교시</th><th>고사실</th><th>과목(단위)</th><th>${isWait ? '인원' : '응시인원'}</th></tr></thead>
        <tbody><tr><td>${h(U.fmtDate(slotDate(slot)))}</td><td>${slot.period}교시${extraNote(slot, i)}<small class="tm">${h(slotTime(slot))}</small></td><td class="acc">${h(room.name)}</td><td>${h(subj)}${!isWait && c.classRoom ? `<small class="tm">${h(C.roomLabel(c.classRoom))}</small>` : ''}</td><td class="acc">${list.length}명</td></tr></tbody></table>
        <div class="two-col fill-main">${col(chunk.slice(0, perCol), 0)}${col(chunk.slice(perCol), perCol)}</div>
        <div class="sign">감독교사 &nbsp; 정: ____________ (인) &nbsp;&nbsp; 부: ____________ (인)</div></div>`;
    }).join('');
  }

  // ---------------------------------------------------------------- 9-3 고사실별 시험시간표
  function pageRoomTT(i) {
    const room = roomAt(i), days = examDays(), periods = examPeriods();
    const slots = S.slots();
    return `<div class="page fill" data-sheet="${h(room.name)}">${pageHead('고사실 시험시간표', h(S.title()))}
      <div class="p-big">고사실: <b>${h(room.name)}</b>${room.ban ? ` <span>(${h(room.ban)})</span>` : ''}</div>
      <table class="ptbl roomtt eq fill-main">${eqCols([16], days.length)}<thead><tr><th>교시</th>${days.map((d) => `<th>${d}일차<br><small>${h(U.fmtDateShort(st().dates[d - 1]))}</small></th>`).join('')}</tr></thead>
      <tbody>${periods.map((p) => `<tr><th>${p}교시<br><small>${h((st().times[C.slotKey(days[0], p)] || '').replace(/\s/g, ''))}</small></th>${days.map((d) => {
        const slot = slots.find((s) => s.day === d && s.period === p);
        if (!slot) return room.ban && C.isClassRoom(room) ? `<td class="p-wait">자습<br><small>${h(room.ban)}</small></td>` : '<td class="dim">·</td>';
        const c = cellOf(slot, i);
        if (c.kind === 'exam') return c.special ? `<td><b>${h(c.subject)}</b><br><small>${c.count}명${(() => { const e = roomExtra(slot.key, i); return e.max ? ` · ${e.same ? '' : '최대 '}+${e.max}분` : ''; })()}</small></td>` : `<td><b>${h(C.onlySubject(c.subject))}</b><br><small>${c.label ? `${h(c.label)} · ` : ''}${c.count}명</small></td>`;
        if (c.kind === 'wait') return `<td class="p-wait">대기(자습)<br><small>${c.count}명</small></td>`;
        return '<td class="dim">·</td>';
      }).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  // ---------------------------------------------------------------- 9-4 좌석 배치표
  function pageSeat(slot, i) {
    const room = roomAt(i), c = cellOf(slot, i), list = roster(slot.key, i);
    // 별도실로 옮긴 학생의 원래 좌석 (자리는 비워 둠)
    const away = new Map(seatAll().filter((r) => r.slot === slot.key && r.special && r.origRoom === room.name && r.origSeat > 0).map((r) => [r.origSeat, r]));
    const maxSeat = Math.max(list.length, ...list.map((r) => Number(r.seat) || 0), ...away.keys());
    const o = st().out;
    const g = C.seatGrid(maxSeat, st().seatCols, o.seatOrder, Number(o.seatRows) || 0);
    const bySeat = new Map(list.map((r) => [r.seat, r]));
    const colHead = `<thead><tr>${Array.from({ length: g.cols || st().seatCols }, (_, k) => `<th class="col-head">${k + 1}열</th>`).join('')}</tr></thead>`;
    const grid = g.error ? `<p class="bad-text">${h(g.error)}</p>` : `<table class="seat-grid fill-main">${colHead}<tbody>${g.grid.map((line) => `<tr>${line.map((n) => {
      const r = bySeat.get(n), a = away.get(n);
      if (r) return `<td><div class="seat-card"><div class="seat-no">${n}</div><div class="seat-who"><div class="seat-id">${C.studentNo(r.grade, r.ban, r.num)}</div><div class="seat-name">${h(r.name)}</div></div></div></td>`;
      if (a) return `<td class="away-seat"><div class="seat-card"><div class="seat-no">${n}</div><div class="seat-who"><div class="seat-id">${C.studentNo(a.grade, a.ban, a.num)} ${h(a.name)}</div><div class="seat-away">→ ${h(a.room)} 응시</div></div></div></td>`;
      return n ? `<td class="empty-seat"><div class="seat-card"><div class="seat-no">${n}</div><div class="seat-who"></div></div></td>` : '<td class="empty-seat blank"></td>';
    }).join('')}</tr>`).join('')}</tbody></table>`;
    const blanks = g.grid ? g.grid.flat().filter((n) => !n).length : 0;
    const gridRows = g.grid ? g.grid.length : 0;
    // 명렬표: 좌석번호 순 (별도실로 옮긴 학생도 원래 자리에 표시)
    const people = [...list.map((r) => ({ seat: r.seat, r })), ...[...away].map(([seat, r]) => ({ seat, r, away: true }))].sort((a, b) => a.seat - b.seat);
    const groups = people.length > 40 ? 3 : 2;
    const per = Math.max(1, Math.ceil(people.length / groups));
    const colsOf = Array.from({ length: groups }, (_, k) => people.slice(k * per, (k + 1) * per));
    const notes = (blanks ? 1 : 0) + (away.size ? 1 : 0);
    const listMm = people.length && o.seatList ? 12 + per * 4.9 : 0;
    // A4 297mm − 위아래 여백 28 − 제목 23 − 정보표 26 − 교탁 15 − 표 사이 8 − 주석 − 명렬표 (모두 여백 포함, mm)
    // examtable과 같이 열이 6개 이상이면 가로 용지
    const land = (g.cols || st().seatCols) >= 6;
    const avail = (land ? 210 : 297) - 28 - 25 - 26 - 15 - 8 - notes * 9 - listMm - 8;
    const seatH = gridRows ? Math.max(9, Math.min(22, (avail - (gridRows + 1) * 2.5) / gridRows)) : 22;
    const listTbl = people.length && o.seatList ? `<div class="seat-lists" style="--groups:${groups}">${colsOf.map((c, gi) => `<table class="ptbl seat-list2"><thead><tr><th>연번</th><th>학번</th><th>성명</th><th>좌석</th><th>비고</th></tr></thead>
      <tbody>${Array.from({ length: per }, (_, k) => { const x = c[k]; return x ? `<tr><td>${gi * per + k + 1}</td><td>${C.studentNo(x.r.grade, x.r.ban, x.r.num)}</td><td class="nm ${x.away ? 'away' : ''}">${h(x.r.name)}</td><td class="acc">${x.seat}</td><td class="memo">${x.away ? `→ ${h(x.r.room)}` : ''}</td></tr>` : '<tr class="pad"><td></td><td></td><td></td><td></td><td></td></tr>'; }).join('')}</tbody></table>`).join('')}</div>` : '';
    return `<div class="page fill seatpage ${land ? 'landscape' : ''}" data-sheet="${h(`${slot.day}일${slot.period}교시 ${room.name}`)}">
      <div class="seat-head">${schoolLine()}<div class="sh-sub">${h(S.title())}</div><div class="sh-title">고사실 좌석배치도</div></div>
      <table class="ptbl seat-info"><thead><tr><th>시행일</th><th>교시</th><th>고사실</th><th>과목(단위)</th><th>응시인원</th></tr></thead>
      <tbody><tr><td>${h(U.fmtDate(slotDate(slot)))}</td><td>${slot.period}교시${extraNote(slot, i)}</td><td class="acc">${h(room.name)}</td><td>${h(c.kind === 'wait' ? '대기(자습)' : c.subject || '')}</td><td class="acc">${list.length}명</td></tr></tbody></table>
      <div class="podium top bar">교 탁 (앞)</div>${grid.replace('<table class="seat-grid fill-main">', `<table class="seat-grid cards with-list ${seatH < 14 ? 'small' : ''}" style="--seat-h:${seatH.toFixed(1)}mm">`)}${listTbl}${blanks ? `<p class="p-note">※ 점선 칸 ${blanks}개는 ${st().seatCols}열 × ${g.rows}줄 책상 중 응시자가 없는 자리입니다. (열의 수는 위쪽에서 바꿀 수 있습니다)</p>` : ''}${away.size ? `<p class="p-note">※ 별도실로 옮긴 학생 자리 ${away.size}개는 비워 두었습니다.</p>` : ''}</div>`;
  }

  // ---------------------------------------------------------------- 9-5 학급별 고사시간표
  function pageClass(ban, day) {
    const slots = S.slots().filter((s) => s.day === day);
    const stu = S.students().filter((x) => x.ban === ban);
    const idx = byStudent();
    return `<div class="page fill cls-page ${stu.length > 32 ? 'dense' : ''}" data-sheet="${h(`${ban} ${day}일차`)}">${pageHead(`${ban} 고사 시간표`, `${h(S.title())} · ${day}일차 ${h(U.fmtDate(st().dates[day - 1]))}`)}
      <table class="ptbl cls eq fill-main">${eqCols([5, 9], slots.length * 2)}<thead><tr><th rowspan="2">번호</th><th rowspan="2">성명</th>${slots.map((s) => `<th colspan="2">${s.period}교시 <small>${h(slotTime(s).replace(/\s/g, ''))}</small></th>`).join('')}</tr>
      <tr>${slots.map(() => '<th>과목</th><th>고사실</th>').join('')}</tr></thead>
      <tbody>${stu.map((x) => `<tr><td>${x.num}</td><td>${h(x.name)}</td>${slots.map((s) => {
        const r = idx.get(`${x.key}|${s.key}`);
        if (!r) return '<td class="bad-text" colspan="2">확인 필요</td>';
        return r.subject === '미응시' ? `<td class="p-wait">자습</td><td>${h(r.room)}</td>` : `<td>${h(C.onlySubject(r.subject))}</td><td>${r.special ? '<b>' : ''}${h(r.room)}${r.special ? '</b>' : ''} <small>(${r.seat})${extraTag(r)}</small></td>`;
      }).join('')}</tr>`).join('')}</tbody></table>
      <p class="p-note">※ 고사실 옆 괄호 안의 숫자는 좌석번호입니다.</p></div>`;
  }

  // ---------------------------------------------------------------- 9-6 학생별 시험시간표 (A4 한 장에 4명)
  /**
   * 학생 한 명의 시험시간표. transpose=true 면 가로=교시, 세로=일차 (2×2 배치처럼 폭이 좁을 때)
   */
  function slipStudent(x, transpose) {
    const idx = byStudent(), days = examDays(), periods = examPeriods(), slots = S.slots();
    const cell = (d, p) => {
      const s = slots.find((y) => y.day === d && y.period === p);
      // 학년 전체 시험이 없는 교시: 자기 반 교실에서 자습
      if (!s) { const home = st().rooms.find((y) => y.ban === x.ban); return `<td class="p-wait">자습${home ? `<br><small>${h(home.name)}</small>` : ''}</td>`; }
      const r = idx.get(`${x.key}|${s.key}`);
      if (!r) return '<td class="bad-text">확인 필요</td>';
      const extra = r.special && r.extra ? ` · +${r.extra}분` : '';
      return r.subject === '미응시' ? `<td class="p-wait">자습<br><small>${h(r.room)}</small></td>` : `<td><b>${h(C.onlySubject(r.subject))}</b><br><small>${h(r.room)}${st().out.slipSeat ? ` · ${r.seat}번` : ''}${extra}</small></td>`;
    };
    const dayHead = (d) => `${d}일차 <small>${h(U.fmtDateShort(st().dates[d - 1]))}</small>`;
    const table = transpose
      ? `<table class="ptbl slip-tbl tr eq">${eqCols([16], periods.length)}<thead><tr><th>일차</th>${periods.map((p) => `<th>${p}교시</th>`).join('')}</tr></thead>
         <tbody>${days.map((d) => `<tr><th>${dayHead(d)}</th>${periods.map((p) => cell(d, p)).join('')}</tr>`).join('')}</tbody></table>`
      : `<table class="ptbl slip-tbl eq">${eqCols([12], days.length)}<thead><tr><th>교시</th>${days.map((d) => `<th>${dayHead(d)}</th>`).join('')}</tr></thead>
         <tbody>${periods.map((p) => `<tr><th>${p}교시</th>${days.map((d) => cell(d, p)).join('')}</tr>`).join('')}</tbody></table>`;
    return `<div class="slip">
      <div class="slip-head"><div class="slip-top"><span>${h(S.school() || '')}</span><b>${C.studentNo(x.grade, x.ban, x.num)} ${h(x.name)}</b></div><div class="slip-title">${h(S.title())} 시험시간표</div></div>
      ${table}${slipNote()}</div>`;
  }
  /** 학생별 시간표 하단 유의사항 */
  const slipNote = () => {
    const o = st().out;
    const lines = o.slipNoteOn ? String(o.slipNote || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean) : [];
    return lines.length ? `<div class="slip-note">${lines.map((x) => `<div>※ ${h(x)}</div>`).join('')}</div>` : '';
  };
  /** 학생별 시간표 배치 형태: rows 가로 4등분 / grid 가로·세로 4등분(2×2) / one 한 장에 1명 */
  const SLIP_LAYOUTS = [['rows', '가로 4등분 (한 장에 4명, 위아래)'], ['grid', '가로·세로 4등분 (한 장에 4명, 2×2)'], ['one', '한 장에 1명']];
  const pagesStudents = (list) => {
    const lay = ui.slipLayout || 'rows';
    const per = lay === 'one' ? 1 : 4;
    const out = [];
    for (let i = 0; i < list.length; i += per) {
      const last = list[Math.min(i + per - 1, list.length - 1)];
      const name = per === 1 ? `${list[i].ban} ${list[i].num}번 ${list[i].name}` : `${list[i].ban} ${list[i].num}~${last.num}번`;
      // 2×2·한 장에 1명은 가로 내용(일차)이 많으면 표를 돌려 가로=교시, 세로=일차
      const tr = (lay === 'grid' || lay === 'one') && examDays().length > examPeriods().length;
      out.push(`<div class="page slips ${lay} ${slipNote() ? 'with-note' : ''}" data-layout="${lay}" data-sheet="${h(name)}">${list.slice(i, i + per).map((x) => slipStudent(x, tr)).join('')}</div>`);
    }
    return out.join('');
  };

  // ---------------------------------------------------------------- 10-8 별도 수험생
  /** 별도실 학생 목록 (지정 순서: 반·번호) */
  const spStudents = () => S.students().filter((x) => st().special.students[x.key] && st().special.students[x.key].room);
  const timeWith = (slot, extra) => { const t = slotTime(slot); return extra ? endWithExtra(t, extra) : t; };
  /** 학생별 안내: 시험 교시마다 어디서, 몇 시까지 보는지 (A4 한 장에 2명) */
  function spGuide(x) {
    const idx = byStudent();
    const rows = S.slots().map((sl) => ({ sl, r: idx.get(`${x.key}|${sl.key}`) })).filter((y) => y.r && y.r.subject !== '미응시');
    const sp = st().special.students[x.key];
    return `<div class="sp-guide">
      <div class="slip-head"><div class="slip-top"><span>${h(S.school() || '')}</span><b>${C.studentNo(x.grade, x.ban, x.num)} ${h(x.name)}</b></div><div class="slip-title">별도 시험 안내</div></div>
      <p class="sp-guide-lead">${h(S.title())} · 지정 별도실: <b>${h(S.specialRoom(sp.room).name)}</b> · ${sp.mode === 'pick' ? '고른 교시만 별도실' : '시험 보는 모든 교시 별도실'}</p>
      <table class="ptbl"><thead><tr><th>일시</th><th>과목</th><th>고사실</th><th>시험 시간</th><th>추가 시간</th></tr></thead>
      <tbody>${rows.map(({ sl, r }) => `<tr class="${r.special ? 'sp-on' : ''}"><th>${h(U.fmtDateShort(slotDate(sl)))} ${sl.period}교시</th><td>${h(C.onlySubject(r.subject))}</td><td>${r.special ? `<b>${h(r.room)}</b>` : `${h(r.room)} (${r.seat}번)`}</td><td>${h(timeWith(sl, r.special ? r.extra : 0))}</td><td>${r.special && r.extra ? `+${r.extra}분` : '-'}</td></tr>`).join('')}</tbody></table>
      <p class="p-note">※ 굵은 글씨 고사실(별도실)에서 시험을 봅니다. 자습 교시에는 자기 교실에서 자습합니다.</p></div>`;
  }
  const pagesSpGuide = (list) => { const out = []; for (let i = 0; i < list.length; i += 2) out.push(`<div class="page sp-guides" data-sheet="${h(`별도 안내 ${list[i].name}`)}">${list.slice(i, i + 2).map(spGuide).join('')}</div>`); return out.join(''); };
  /** 교시별 명렬: 교시마다 별도실에 오는 학생과 끝나는 시각 (감독용) */
  function pagesSpList() {
    const rows = [];
    S.slots().forEach((sl) => seatAll().filter((r) => r.slot === sl.key && r.special).sort((a, b) => a.roomIndex - b.roomIndex || a.seat - b.seat).forEach((r) => rows.push({ sl, r })));
    if (!rows.length) return '';
    const per = 24, out = [];
    for (let p = 0; p < rows.length; p += per) {
      const chunk = rows.slice(p, p + per);
      out.push(`<div class="page fill" data-sheet="${h(`별도 명렬 ${p / per + 1}`)}">${pageHead('별도 고사실 교시별 명렬', h(S.title()))}
        <table class="ptbl sp-list fill-main"><thead><tr><th>일시</th><th>별도실</th><th>좌석</th><th>학번</th><th>성명</th><th>과목</th><th>추가 시간</th><th>시험 시간</th><th>원래 고사실</th><th>감독 확인</th></tr></thead>
        <tbody>${chunk.map(({ sl, r }) => `<tr><th>${h(U.fmtDateShort(slotDate(sl)))} ${sl.period}교시</th><td><b>${h(r.room)}</b></td><td>${r.seat}</td><td>${C.studentNo(r.grade, r.ban, r.num)}</td><td><b>${h(r.name)}</b></td><td>${h(C.onlySubject(r.subject))}</td><td>${r.extra ? `+${r.extra}분` : '-'}</td><td>${h(timeWith(sl, r.extra))}</td><td>${h(r.origRoom || '')}</td><td></td></tr>`).join('')}</tbody></table>
        <div class="sign">감독교사 확인: ____________ (인)</div></div>`);
    }
    return out.join('');
  }

  // ---------------------------------------------------------------- 9-7 문제지 봉투 라벨 (InitLabelData)
  function labels() {
    const out = [];
    S.slots().forEach((slot) => {
      st().rooms.forEach((r, i) => {
        if (!C.isRoomUsable(r)) return;
        const c = cellOf(slot, i);
        if (c.kind !== 'exam') return;
        out.push({ n: out.length + 1, slot, room: r.name, subject: c.subject, classRoom: C.roomLabel(c.classRoom), count: roster(slot.key, i).length });
      });
      // 별도실
      Array.from({ length: S.specialCount() }, (_, j) => j + 1).forEach((k) => {
        const i = S.SPECIAL_BASE + k - 1, rows = seatAll().filter((x) => x.slot === slot.key && x.roomIndex === i);
        [...new Set(rows.map((x) => x.subject))].forEach((sub) => out.push({ n: out.length + 1, slot, room: roomAt(i).name, subject: sub, classRoom: `별도실${(() => { const e = roomExtra(slot.key, i); return e.max ? ` (${e.same ? '' : '최대 '}+${e.max}분)` : ''; })()}`, count: rows.filter((x) => x.subject === sub).length }));
      });
    });
    return out;
  }
  const labelBox = (l) => {
    const code = st().subjectCodes[l.subject];
    return `<div class="label-box">
      <div class="lb-no">${S.school() ? `${h(S.school())} · ` : ''}No. ${l.n}</div>
      <table><tr><th>일 시</th><td class="lb-when"><b>${h(U.fmtDate(slotDate(l.slot)))}</b><br>${l.slot.period}교시 <span>(${h(slotTime(l.slot))})</span></td></tr>
      <tr><th>과 목</th><td><b>${h(C.onlySubject(l.subject))}</b>${code ? ` 【 ${h(code)} 】` : ''}</td></tr>
      <tr><th>고사실</th><td>${h(l.room)}</td></tr>
      <tr><th>응시분반</th><td>${h(l.classRoom)}</td></tr>
      <tr><th>응시인원</th><td>${l.count}명</td></tr></table></div>`;
  };
  /** 봉투 라벨 B: A4 가로 한 장에 하나, 과목명 크게 */
  const labelBig = (l) => {
    const code = st().subjectCodes[l.subject];
    return `<div class="page landscape labels-big" data-sheet="${h(`라벨 ${l.n}`)}"><div class="lbb">
      <div class="lbb-top"><span>${h(S.school() || '')}</span><span>No. ${l.n}</span></div>
      <div class="lbb-title">${h(S.title())}</div>
      <div class="lbb-subj">${h(C.onlySubject(l.subject))}${code ? `<small>【 ${h(code)} 】</small>` : ''}</div>
      <div class="lbb-when">${h(U.fmtDate(slotDate(l.slot)))} · ${l.slot.period}교시 <span>(${h(slotTime(l.slot))})</span></div>
      <table class="lbb-tbl"><tr><th>고사실</th><td>${h(l.room)}</td><th>응시분반</th><td>${h(l.classRoom)}</td><th>응시인원</th><td>${l.count}명</td></tr></table>
    </div></div>`;
  };
  const pagesLabels = (list) => {
    if (st().out.labelStyle === 'big') return list.map(labelBig).join('');
    const out = [];
    for (let i = 0; i < list.length; i += 2) out.push(`<div class="page labels" data-sheet="${h(`라벨 ${list[i].n}${list[i + 1] ? '-' + list[i + 1].n : ''}`)}">${list.slice(i, i + 2).map(labelBox).join('')}</div>`);
    return out.join('');
  };

  // ---------------------------------------------------------------- 화면
  const sel = (act, items, cur) => `<select class="input sm" data-change="${act}">${items.map(([v, l]) => `<option value="${h(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${h(l)}</option>`).join('')}</select>`;

  function ensureDefaults() {
    const slots = S.slots(), rooms = usedRooms(), studs = S.students();
    if (!slots.find((s) => s.key === ui.slot)) ui.slot = slots[0]?.key || '';
    const inSlot = seatAll().filter((r) => r.slot === ui.slot).map((r) => r.roomIndex);
    if (!inSlot.includes(+ui.room)) ui.room = String(inSlot[0] ?? rooms[0]?.i ?? '');
    const bans = [...new Set(studs.map((x) => x.ban))];
    if (!bans.includes(ui.ban)) ui.ban = bans[0] || '';
    if (!examDays().includes(+ui.day)) ui.day = String(examDays()[0] || '');
  }

  /** 라디오 묶음 (출력 설정) */
  const radios = (name, label, list, cur) => `<div class="scope-radios layout-radios" role="radiogroup" aria-label="${h(label)}"><span class="scope-label">${h(label)}</span>${list.map(([k, l]) => `<label class="scope-radio ${String(k) === String(cur) ? 'on' : ''}"><input type="radio" name="${name}" value="${k}" data-change="${name}" ${String(k) === String(cur) ? 'checked' : ''}><span>${h(l)}</span></label>`).join('')}</div>`;
  const check = (name, label, on, tip = '') => `<label class="inline chk" ${tip ? `title="${h(tip)}"` : ''}><input type="checkbox" data-change="${name}" ${on ? 'checked' : ''}> ${h(label)}</label>`;

  function controlsAndPreview() {
    ensureDefaults();
    const slots = S.slots(), slot = slots.find((s) => s.key === ui.slot), i = +ui.room;
    const roomsInSlot = [...new Set(seatAll().filter((r) => r.slot === ui.slot).map((r) => r.roomIndex))].sort((a, b) => a - b);
    const slotSel = sel('o-slot', slots.map((s) => [s.key, `${s.title} (${s.study ? '자습' : s.subjects.map(C.onlySubject).join(', ')})`]), ui.slot);
    const roomSel = (list) => sel('o-room', list.map((k) => [k, roomAt(k).name]), ui.room);
    const bans = [...new Set(S.students().map((x) => x.ban))];
    let ctrl = '', preview = '', scopes = [];
    switch (ui.tab) {
      case 'all':
        ctrl = radios('o-paper', '용지', [['A4', 'A4 가로'], ['B4', 'B4 가로']], st().out.paper) + (S.slots().length > 11 && st().out.paper !== 'B4' ? '<span class="hint-inline">교시가 많아 A4에서는 글씨가 작습니다. <b>B4</b>를 권합니다.</span>' : '');
        preview = pageAll();
        scopes = [['cur', '전체 시간표']];
        break;
      case 'room':
        ctrl = slotSel + roomSel(roomsInSlot);
        preview = pageRoom(slot, i);
        scopes = [['cur', '현재 고사실'], ['slot', '이 교시 모든 고사실'], ['every', '전체 교시·전체 고사실']];
        break;
      case 'roomtt':
        ctrl = roomSel(usedRooms().map((r) => r.i));
        preview = pageRoomTT(i);
        scopes = [['cur', '현재 고사실'], ['every', '모든 고사실']];
        break;
      case 'seat':
        ctrl = slotSel + roomSel(roomsInSlot) + `<label class="inline">열(가로) <input type="number" class="input sm num" min="1" max="10" value="${st().seatCols}" data-change="o-cols"></label>
          <label class="inline" title="0이면 인원에 맞춰 자동">줄(세로) <input type="number" class="input sm num" min="0" max="12" value="${Number(st().out.seatRows) || 0}" data-change="o-rows"></label>` +
          radios('o-order', '번호 순서', [['col', '세로(한 열)로 먼저'], ['row', '가로(앞줄)로 먼저']], st().out.seatOrder) +
          radios('o-seatlist', '모양', [['1', '좌석 + 명렬'], ['0', '좌석만']], st().out.seatList ? '1' : '0') +
          '<span class="muted sm">설정은 모든 고사실에 똑같이 적용됩니다</span>';
        preview = pageSeat(slot, i);
        scopes = [['cur', '현재 고사실'], ['slot', '이 교시 모든 고사실'], ['every', '전체 교시·전체 고사실']];
        break;
      case 'class':
        ctrl = sel('o-ban', bans.map((b) => [b, b]), ui.ban) + sel('o-day', examDays().map((d) => [d, `${d}일차`]), ui.day);
        preview = pageClass(ui.ban, +ui.day);
        scopes = [['cur', `${ui.ban} ${ui.day}일차`], ['slot', `${ui.ban} 모든 일차`], ['every', '전체 학급·모든 일차']];
        break;
      case 'student': {
        const studs = S.students().filter((x) => x.ban === ui.ban);
        const lay = ui.slipLayout || 'rows';
        if (!studs.some((x) => x.key === ui.stu)) ui.stu = studs[0] ? studs[0].key : '';
        const one = studs.find((x) => x.key === ui.stu);
        ctrl = sel('o-ban', bans.map((b) => [b, b]), ui.ban) + sel('o-stu', studs.map((x) => [x.key, `${x.num}번 ${x.name}`]), ui.stu) +
          check('o-slipseat', '좌석번호 표시', st().out.slipSeat) + check('o-noteon', '하단 유의사항', st().out.slipNoteOn) +
          `<button class="btn ghost sm" data-act="o-note-edit" title="학생별 시간표 아래에 인쇄할 유의사항 문구를 고칩니다">✎ 유의사항 고치기</button>` +
          `<div class="scope-radios layout-radios" role="radiogroup" aria-label="배치 형태"><span class="scope-label">배치 형태</span>${SLIP_LAYOUTS.map(([k, l]) => `<label class="scope-radio ${k === lay ? 'on' : ''}"><input type="radio" name="o-layout" value="${k}" data-change="o-layout" ${k === lay ? 'checked' : ''}><span>${h(l)}</span></label>`).join('')}</div>`;
        preview = pagesStudents(studs.slice(0, lay === 'one' ? 2 : 4));
        scopes = [['one', one ? `${one.num}번 ${one.name} 1명` : '선택한 학생'], ['slot', `${ui.ban} 전체 (${studs.length}명)`], ['every', `전체 학생 (${S.students().length}명)`]];
        break;
      }
      case 'label': {
        const ls = labels();
        const subs = st().evalSubjects;
        ctrl = radios('o-lstyle', '라벨 모양', [['table', '표 (한 장에 2개)'], ['big', '과목 크게 (A4 가로 한 장에 1개)']], st().out.labelStyle);
        preview = `<div class="grid-2 top no-print-inner">
          <div class="card"><h3>과목코드 입력 <span class="muted">(선택)</span></h3><table class="tbl compact"><tbody>${subs.map((x) => `<tr><td>${h(x)}</td><td><input class="input sm" data-change="o-code" data-s="${h(x)}" value="${h(st().subjectCodes[x] || '')}"></td></tr>`).join('')}</tbody></table></div>
          <div class="card"><h3>문제지 봉투 라벨 데이터 <span class="muted">${ls.length}개</span></h3><div class="table-wrap mid"><table class="tbl compact selectable"><thead><tr><th><input type="checkbox" data-change="o-lsel-all" ${ui.labelSel.size === ls.length && ls.length ? 'checked' : ''}></th><th>연번</th><th>일차</th><th>교시</th><th>과목</th><th>고사실</th><th>응시분반</th><th>인원</th></tr></thead>
          <tbody>${ls.map((l) => `<tr><td><input type="checkbox" data-change="o-lsel" data-n="${l.n}" ${ui.labelSel.has(l.n) ? 'checked' : ''}></td><td>${l.n}</td><td>${l.slot.day}일차</td><td>${l.slot.period}교시</td><td>${h(C.onlySubject(l.subject))}</td><td>${h(l.room)}</td><td>${h(l.classRoom)}</td><td>${l.count}</td></tr>`).join('')}</tbody></table></div></div>
        </div>` + pagesLabels(ls.slice(0, st().out.labelStyle === 'big' ? 1 : 2));
        scopes = [['slot', `선택한 라벨 (${ui.labelSel.size}개)`], ['every', `전체 라벨 (${ls.length}개)`]];
        break;
      }
      case 'sp': {
        const list = spStudents(), mode = ui.spMode || 'guide';
        if (!list.some((x) => x.key === ui.spStu)) ui.spStu = list[0] ? list[0].key : '';
        ctrl = radios('o-spmode', '종류', [['guide', '학생별 안내'], ['list', '교시별 명렬 (감독용)']], mode) + (mode === 'guide' && list.length ? sel('o-spstu', list.map((x) => [x.key, `${x.ban} ${x.num}번 ${x.name}`]), ui.spStu) : '');
        if (!list.length) preview = '<div class="empty"><p>별도실 시험자가 없습니다. <b>8. 별도 고사실</b>에서 학생을 지정하면 여기에 안내문과 명렬이 만들어집니다.</p></div>';
        else preview = mode === 'guide' ? pagesSpGuide(list.filter((x) => x.key === ui.spStu)) : pagesSpList();
        scopes = mode === 'guide' ? [['cur', '선택한 학생'], ['every', `별도실 학생 전체 (${list.length}명)`]] : [['every', '교시별 명렬 전체']];
        break;
      }
    }
    // 탭마다 범위를 따로 기억. 처음에는 가장 넓은 범위(마지막 항목)를 선택
    ui.scopes = ui.scopes || {};
    if (!scopes.some(([k]) => k === ui.scopes[ui.tab])) ui.scopes[ui.tab] = scopes[scopes.length - 1][0];
    ui.scope = ui.scopes[ui.tab];
    const outBar = `<div class="out-bar">
        <div class="scope-radios" role="radiogroup" aria-label="저장·출력 범위"><span class="scope-label">범위</span>${scopes.slice().reverse().map(([k, l]) => `<label class="scope-radio ${k === ui.scope ? 'on' : ''}"><input type="radio" name="o-scope" value="${k}" data-change="o-scope" ${k === ui.scope ? 'checked' : ''}><span>${h(l)}</span></label>`).join('')}</div>
        <button class="btn outline sm" data-act="out-excel" title="표를 엑셀 파일로 저장 (쪽마다 시트 하나)">📊 엑셀 저장</button>
        <button class="btn outline sm" data-act="out-pdf" title="A4 쪽 그대로 PDF 파일로 저장">📄 PDF 저장</button>
        <button class="btn primary sm" data-act="out-print" title="프린터로 출력">🖨 출력</button>
      </div>`;
    const scopeLabel = (scopes.find(([k]) => k === ui.scope) || scopes[0])[1];
    return { ctrl, preview, printBtns: outBar, scopeLabel };
  }
  /** 라벨 '선택' 범위는 하나 이상 골라야 함 */
  const scopeReady = () => { if (ui.tab === 'label' && ui.scope === 'slot' && !ui.labelSel.size) { U.toast('라벨 목록에서 저장·출력할 라벨을 선택하세요.', 'error'); return false; } return true; };
  const btn = (act, label) => `<button class="btn outline sm" data-act="${act}">${h(label)}</button>`;

  /** 인쇄 대상 페이지 HTML */
  function printHtml(scope) {
    const slots = S.slots(), slot = slots.find((s) => s.key === ui.slot);
    const roomsOf = (k) => [...new Set(seatAll().filter((r) => r.slot === k).map((r) => r.roomIndex))].sort((a, b) => a - b);
    const bans = [...new Set(S.students().map((x) => x.ban))];
    switch (ui.tab) {
      case 'all': return pageAll();
      case 'room':
      case 'seat': {
        const f = ui.tab === 'room' ? pageRoom : pageSeat;
        if (scope === 'cur') return f(slot, +ui.room);
        if (scope === 'slot') return roomsOf(slot.key).map((i) => f(slot, i)).join('');
        return slots.map((s) => roomsOf(s.key).map((i) => f(s, i)).join('')).join('');
      }
      case 'roomtt': return scope === 'cur' ? pageRoomTT(+ui.room) : usedRooms().map((r) => pageRoomTT(r.i)).join('');
      case 'class':
        if (scope === 'cur') return pageClass(ui.ban, +ui.day);
        if (scope === 'slot') return examDays().map((d) => pageClass(ui.ban, d)).join('');
        return bans.map((b) => examDays().map((d) => pageClass(b, d)).join('')).join('');
      case 'student': return pagesStudents(scope === 'one' ? S.students().filter((x) => x.key === ui.stu) : scope === 'slot' ? S.students().filter((x) => x.ban === ui.ban) : S.students());
      case 'sp': return (ui.spMode || 'guide') === 'list' ? pagesSpList() : pagesSpGuide(scope === 'cur' ? spStudents().filter((x) => x.key === ui.spStu) : spStudents());
      case 'label': { const ls = labels(); return pagesLabels(scope === 'slot' ? ls.filter((l) => ui.labelSel.has(l.n)) : ls); }
    }
    return '';
  }

  // ---------------------------------------------------------------- 엑셀 저장 / PDF 저장
  const TAB_NAME = { all: '전체시간표', room: '고사실응시현황', roomtt: '고사실시간표', seat: '좌석배치표', class: '학급별시간표', student: '학생별시간표', label: '봉투라벨', sp: '별도수험생' };
  const safeName = (s) => String(s).replace(/[\\/:*?"<>|[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  const fileBase = (scopeLabel) => safeName(`${S.school() ? S.school() + '_' : ''}${S.title()}_${TAB_NAME[ui.tab]}_${scopeLabel}`);

  /** 인쇄용 HTML을 화면 밖에 그려 쪽(.page) 목록을 얻는다 */
  function renderPages(scope) {
    const html = printHtml(scope);
    if (!html) return null;
    const host = document.createElement('div');
    host.className = 'export-host';
    host.innerHTML = html;
    document.body.appendChild(host);
    return { host, pages: [...host.querySelectorAll('.page')] };
  }

  /** 엑셀: 쪽마다 시트 하나 (제목 줄 + 표를 위에서 아래로) */
  function exportExcel(scope, scopeLabel) {
    if (!window.XLSX) return U.alert('엑셀 모듈(SheetJS)을 불러오지 못했습니다. 인터넷 연결을 확인하세요.');
    const r = renderPages(scope);
    if (!r || !r.pages.length) return U.toast('저장할 내용이 없습니다.', 'error');
    try {
      const wb = XLSX.utils.book_new();
      const used = new Set();
      r.pages.forEach((pg, n) => {
        const ws = XLSX.utils.aoa_to_sheet([]);
        let row = 0;
        const put = (text) => { XLSX.utils.sheet_add_aoa(ws, [[text]], { origin: row }); row++; };
        pg.querySelectorAll('.p-school, .p-title, .p-sub, .p-big, .lb-no').forEach((el) => { if (!el.closest('table')) put(el.innerText.replace(/\s+/g, ' ').trim()); });
        if (row) row++;
        const slips = [...pg.querySelectorAll('.slip')];
        if (slips.length) {
          // 학생별 시간표: 2×2 는 좌우 두 칸으로, 나머지는 위에서 아래로
          const grid = pg.dataset.layout === 'grid';
          let rowTop = 0, rowMax = 0;
          slips.forEach((sl, k) => {
            const col = grid && k % 2 ? 8 : 0;
            if (!grid || k % 2 === 0) { rowTop = k ? rowMax + 2 : 0; }
            const head = sl.querySelector('.slip-head');
            XLSX.utils.sheet_add_aoa(ws, [[head ? head.innerText.replace(/\s+/g, ' ').trim() : '']], { origin: { r: rowTop, c: col } });
            XLSX.utils.sheet_add_dom(ws, sl.querySelector('table'), { origin: { r: rowTop + 1, c: col }, raw: true });
            const rows = sl.querySelectorAll('tr').length;
            rowMax = Math.max(grid && k % 2 ? rowMax : 0, rowTop + 1 + rows);
          });
          row = rowMax + 1;
        } else pg.querySelectorAll('table').forEach((t) => {
          if (t.parentElement.closest('table')) return; // 표 안의 표는 바깥 표에 포함
          XLSX.utils.sheet_add_dom(ws, t, { origin: row, raw: true });
          const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
          row = range.e.r + 2;
        });
        pg.querySelectorAll('.sign, .podium, .p-note').forEach((el) => put(el.innerText.replace(/\s+/g, ' ').trim()));
        ws['!cols'] = Array.from({ length: 24 }, () => ({ wch: 12 }));
        // 시트 이름: 쪽 제목에서 (31자, 중복 금지)
        let name = safeName(pg.dataset.sheet || `${n + 1}쪽`).slice(0, 28) || `${n + 1}`;
        while (used.has(name)) name = name.slice(0, 26) + '_' + n;
        used.add(name);
        XLSX.utils.book_append_sheet(wb, ws, name);
      });
      const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      U.download(`${fileBase(scopeLabel)}.xlsx`, new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      U.toast(`엑셀로 저장하였습니다. (${r.pages.length}쪽 → 시트 ${r.pages.length}개)`, 'ok');
    } catch (e) { console.error(e); U.alert('엑셀 저장 중 오류: ' + e.message); }
    finally { r.host.remove(); }
  }

  /** 필요할 때만 PDF 모듈을 불러온다 (cdnjs) */
  const loadScript = (src) => new Promise((ok, fail) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => fail(new Error('모듈을 불러오지 못했습니다: ' + src)); document.head.appendChild(s); });
  async function pdfLibs() {
    if (!window.html2canvas) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
    if (!(window.jspdf && window.jspdf.jsPDF)) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    return window.jspdf.jsPDF;
  }

  /** PDF: A4 쪽을 그대로 그려 저장 (가로 쪽은 가로 A4) */
  let pdfBusy = false;
  async function exportPdf(scope, scopeLabel) {
    if (pdfBusy) return;
    let JsPDF;
    try { JsPDF = await pdfLibs(); } catch (e) { return U.alert(e.message + '\n인터넷 연결을 확인하세요.'); }
    const r = renderPages(scope);
    if (!r || !r.pages.length) return U.toast('저장할 내용이 없습니다.', 'error');
    pdfBusy = true;
    const prog = document.createElement('div');
    prog.className = 'pdf-progress';
    document.body.appendChild(prog);
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      let pdf = null;
      for (let n = 0; n < r.pages.length; n++) {
        prog.textContent = `PDF 만드는 중… ${n + 1} / ${r.pages.length}쪽`;
        const pg = r.pages[n];
        const land = pg.classList.contains('landscape');
        const [W, H] = pg.classList.contains('b4') ? [364, 257] : land ? [297, 210] : [210, 297];
        const canvas = await window.html2canvas(pg, { scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: true });
        const img = canvas.toDataURL('image/jpeg', 0.92);
        const fmt = pg.classList.contains('b4') ? [257, 364] : 'a4';
        if (!pdf) pdf = new JsPDF({ orientation: land ? 'l' : 'p', unit: 'mm', format: fmt, compress: true });
        else pdf.addPage(fmt, land ? 'l' : 'p');
        // 쪽 너비에 맞추고, 내용이 길면 한 쪽 안에 들어가게 줄임
        let w = W, h = (canvas.height / canvas.width) * W;
        if (h > H) { w = (H / h) * W; h = H; }
        pdf.addImage(img, 'JPEG', (W - w) / 2, 0, w, h);
        await new Promise((res) => setTimeout(res, 0));
      }
      pdf.save(`${fileBase(scopeLabel)}.pdf`);
      U.toast(`PDF로 저장하였습니다. (${r.pages.length}쪽)`, 'ok');
    } catch (e) { console.error(e); U.alert('PDF 저장 중 오류: ' + e.message); }
    finally { r.host.remove(); prog.remove(); pdfBusy = false; }
  }

  function doPrint(scope) {
    const html = printHtml(scope);
    if (!html) return U.toast('인쇄할 내용이 없습니다.', 'error');
    const root = document.getElementById('print-root');
    root.innerHTML = html;
    document.body.classList.add('printing');
    const done = () => { document.body.classList.remove('printing'); root.innerHTML = ''; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => window.print(), 50);
  }

  const outputs = {
    id: 'outputs', no: 10, title: '인쇄 및 출력물',
    status: () => st().confirmed.seats,
    render() {
      if (!st().confirmed.seats) return stepHead(10, '인쇄 및 출력물') + needFirst('먼저 응시현황(좌석번호)을 확정하세요.', 'seats', '9. 응시현황');
      const { ctrl, preview, printBtns, scopeLabel } = controlsAndPreview();
      ui.scopeLabel = scopeLabel;
      return stepHead(10, (TABS.find(([k]) => k === ui.tab) || [])[1] || '인쇄 및 출력물', '고사 운영에 필요한 시간표와 명단을 미리 봅니다. 범위를 고른 뒤 <b>📊 엑셀 저장</b> · <b>📄 PDF 저장</b> · <b>🖨 출력</b> 중 하나를 누르세요.') +
        `<div class="tabs">${TABS.map(([k, l]) => `<button class="tab ${ui.tab === k ? 'on' : ''}" data-act="o-tab" data-tab="${k}">${h(l)}</button>`).join('')}</div>
        <div class="toolbar">${ctrl}<span class="spacer"></span>${printBtns}</div>
        <div class="preview">${preview}</div>`;
    },
    actions: {
      'o-tab'(el) { ui.tab = el.dataset.tab; rerender(); },
      'out-print'() { if (!scopeReady()) return; doPrint(ui.scope); },
      'out-excel'() { if (!scopeReady()) return; exportExcel(ui.scope, ui.scopeLabel); },
      'out-pdf'() { if (!scopeReady()) return; exportPdf(ui.scope, ui.scopeLabel); },
      'print-cur'() { doPrint('cur'); },
      'print-slot'() { if (ui.tab === 'label' && !ui.labelSel.size) return U.toast('인쇄할 라벨을 선택하세요.', 'error'); doPrint('slot'); },
      'print-every'() { doPrint('every'); },
      async 'o-note-edit'() {
        let text = st().out.slipNote;
        const v = await U.modal({
          title: '학생별 시간표 유의사항',
          body: `<p class="hint">한 줄에 하나씩 적습니다. 줄마다 앞에 ※ 가 붙어 인쇄됩니다.</p><textarea class="input" rows="6" style="width:100%" data-note>${h(text)}</textarea>`,
          buttons: [{ label: '취소', value: null }, { label: '기본 문구로', value: 'reset' }, { label: '저장', value: 'ok', cls: 'primary' }],
          onMount(m) { const t = m.querySelector('[data-note]'); t.focus(); t.addEventListener('input', () => { text = t.value; }); },
        });
        if (v === 'ok') S.setOut('slipNote', text);
        if (v === 'reset') S.setOut('slipNote', S.defaultSlipNote);
      },
    },
    change: {
      'o-layout'(el) { ui.slipLayout = el.value; rerender(); },
      'o-scope'(el) { ui.scopes[ui.tab] = el.value; ui.scope = el.value; rerender(); },
      'o-slot'(el) { ui.slot = el.value; rerender(); },
      'o-room'(el) { ui.room = el.value; rerender(); },
      'o-ban'(el) { ui.ban = el.value; rerender(); },
      'o-day'(el) { ui.day = el.value; rerender(); },
      'o-cols'(el) { S.set('seatCols', Math.max(1, Math.min(10, Number(el.value) || 5))); },
      'o-rows'(el) { S.setOut('seatRows', Math.max(0, Math.min(12, Number(el.value) || 0))); },
      'o-order'(el) { S.setOut('seatOrder', el.value); },
      'o-seatlist'(el) { S.setOut('seatList', el.value === '1'); },
      'o-paper'(el) { S.setOut('paper', el.value); },
      'o-lstyle'(el) { S.setOut('labelStyle', el.value); },
      'o-slipseat'(el) { S.setOut('slipSeat', el.checked); },
      'o-noteon'(el) { S.setOut('slipNoteOn', el.checked); },
      'o-stu'(el) { ui.stu = el.value; ui.scopes.student = 'one'; rerender(); },
      'o-spmode'(el) { ui.spMode = el.value; rerender(); },
      'o-spstu'(el) { ui.spStu = el.value; rerender(); },
      'o-code'(el) { S.setSubjectCode(el.dataset.s, el.value.trim()); },
      'o-lsel'(el) { const n = +el.dataset.n; if (el.checked) ui.labelSel.add(n); else ui.labelSel.delete(n); rerender(); },
      'o-lsel-all'(el) { ui.labelSel = el.checked ? new Set(labels().map((l) => l.n)) : new Set(); rerender(); },
    },
  };

  let rerender = () => {};
  Views.list.push(outputs);
  Views.setOutputsRerender = (f) => { rerender = f; };
  // 사이드바 '인쇄 및 출력물' 하위 메뉴
  Views.outputsTabs = () => TABS;
  Views.outputsTab = () => ui.tab;
  Views.setOutputsTab = (k) => { if (TABS.some(([x]) => x === k)) ui.tab = k; };
})();
