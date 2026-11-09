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
    ['class', '10-5 학급별 시간표'],
    ['student', '10-6 학생별 시간표'],
    ['label', '10-7 봉투 라벨'],
    ['sp', '10-8 별도 수험생'],
  ];
  const ui = { tab: 'all', slot: '', room: '', ban: '', day: '', student: '', lbl: 0 };

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
  /** 4칸 정보표 (머리글 한 줄 + 값 한 줄). emph: 붉게 강조할 칸 번호 */
  const infoTbl = (items, emph = [], cls = '') => `<table class="ptbl seat-info info4 ${cls}"><thead><tr>${items.map(([k]) => `<th>${k}</th>`).join('')}</tr></thead><tbody><tr>${items.map(([, v], i) => `<td class="${emph.includes(i) ? 'acc' : ''}">${v}</td>`).join('')}</tr></tbody></table>`;
  /** 쪽 머리: 작은 시험 이름 → 큰 붉은 제목(+쪽 표시) → 부제 → 정보표. title/sub 는 이미 escape 된 HTML */
  const sheetHead = (title, sub = '', info = null, emph = [], pageLabel = '') => `<div class="seat-head">${schoolLine()}<div class="sh-sub">${h(S.title())}</div><div class="sh-title">${title}${pageLabel ? ` <span class="sh-page">${h(pageLabel)}</span>` : ''}</div>${sub ? `<div class="sh-line">${sub}</div>` : ''}</div>${info ? infoTbl(info, emph) : ''}`;
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
    const room = roomAt(i), days = examDays(), periods = examPeriods(), slots = S.slots();
    const classSize = room.ban ? S.students().filter((x) => x.ban === room.ban).length : 0;
    const k = periods.length >= 5 ? 'k5' : periods.length === 4 ? 'k4' : '';
    const cellAt = (d, p) => {
      const slot = slots.find((x) => x.day === d && x.period === p);
      if (!slot) return room.ban && C.isClassRoom(room) ? { subject: '자습', count: classSize || '', time: (st().times[C.slotKey(d, p)] || '').replace(/\s/g, '') } : null;
      const c = cellOf(slot, i);
      if (c.kind === 'exam') return { subject: c.special ? c.subject : C.onlySubject(c.subject), count: c.count, time: slotTime(slot).replace(/\s/g, ''), extra: c.special ? roomExtra(slot.key, i) : null };
      if (c.kind === 'wait') return { subject: '대기실', count: c.count, time: slotTime(slot).replace(/\s/g, ''), wait: true };
      return null;
    };
    const rows = periods.map((p) => `<tr class="r-subj"><th class="p-period" rowspan="3">${p}교시</th><th class="p-gubun">과목</th>${days.map((d) => { const c = cellAt(d, p); return `<td class="subj ${c && (c.wait || c.subject === '자습') ? 'wait' : ''}">${c ? h(c.subject) : '-'}</td>`; }).join('')}</tr>
      <tr class="r-cnt"><th class="p-gubun">응시자수</th>${days.map((d) => { const c = cellAt(d, p); return `<td class="acc">${c && c.count !== '' && c.count != null ? `${c.count}명` : '-'}${c && c.extra && c.extra.max ? `<span class="sp-extra">${c.extra.same ? '' : '최대 '}+${c.extra.max}분</span>` : ''}</td>`; }).join('')}</tr>
      <tr class="r-time"><th class="p-gubun">시험시간</th>${days.map((d) => { const c = cellAt(d, p); return `<td class="time">${c && c.time ? h(c.time) : '-'}</td>`; }).join('')}</tr>`).join('');
    return `<div class="page landscape fill roomttpage ${k}" data-sheet="${h(room.name)}">
      ${sheetHead(`고사실 시험시간표 (${h(room.name)})`, '', [['고사실', h(room.name)], ['소속반', h(room.ban || '-')], ['시험 일수', `${days.length}일`], ['하루 교시', `${periods.length}교시`]], [0, 2])}
      <table class="ptbl roomtt2 fill-main">${eqCols([9, 11], days.length)}<thead><tr><th>교시</th><th>구분</th>${days.map((d) => `<th>${d}일차<small>${h(U.fmtDateShort(st().dates[d - 1]))}</small></th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
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

  // ---------------------------------------------------------------- 9-5 학급별 고사시간표 (세로, 한 장 35명)
  function pageClass(ban, day) {
    const slots = S.slots().filter((x) => x.day === day);
    const stu = S.students().filter((x) => x.ban === ban), idx = byStudent();
    const home = st().rooms.find((r) => r.ban === ban);
    const date = U.fmtDate(st().dates[day - 1]);
    const per = 35, pages = Math.max(1, Math.ceil(stu.length / per));
    return Array.from({ length: pages }, (_, pi) => {
      const chunk = stu.slice(pi * per, (pi + 1) * per);
      const row = (x) => {
        let sp = false;
        const cells = slots.map((sl) => {
          const r = idx.get(`${x.key}|${sl.key}`);
          if (!r) return '<td class="bad-text" colspan="2">확인 필요</td>';
          if (r.subject === '미응시') return `<td class="wait">자습</td><td class="room wait">${h(r.room)}</td>`;
          if (r.special) sp = true;
          return `<td class="subj">${h(C.onlySubject(r.subject))}</td><td class="room ${r.special ? 'sp' : 'acc'}">${h(r.room)}${r.special ? '(별)' : ''}</td>`;
        }).join('');
        return `<tr><td class="no">${x.num}</td><td class="nm">${h(x.name)}</td>${cells}<td class="memo">${sp ? '별도 고사실' : ''}</td></tr>`;
      };
      const blanks = Array.from({ length: Math.max(0, per - chunk.length) }, (_, k) => `<tr class="blank"><td class="no">${pi * per + chunk.length + k + 1}</td><td></td>${slots.map(() => '<td></td><td></td>').join('')}<td></td></tr>`).join('');
      return `<div class="page fill clspage" data-sheet="${h(`${ban} ${day}일차${pi ? ` (${pi + 1})` : ''}`)}">
        ${sheetHead(`${h(ban)} 시험시간표${home ? ` (고사실 ${h(home.name)})` : ''}`, `${day}일차 · ${h(date || '-')}`, [['학급', h(ban)], ['소속 고사실', h(home ? home.name : '없음')], ['시행일', h(date || '-')], ['인원', `${stu.length}명`]], [1, 3], pages > 1 ? `#${pi + 1} / ${pages}` : '')}
        <table class="ptbl cls2 sheet5"><colgroup><col style="width:7%"><col style="width:12%">${slots.map(() => `<col style="width:${(72 / slots.length * 0.62).toFixed(2)}%"><col style="width:${(72 / slots.length * 0.38).toFixed(2)}%">`).join('')}<col style="width:9%"></colgroup>
        <thead><tr><th rowspan="2">번호</th><th rowspan="2">성명</th>${slots.map((sl) => `<th colspan="2">${sl.period}교시</th>`).join('')}<th rowspan="2">비고</th></tr><tr class="sub">${slots.map(() => '<th>과목명</th><th>고사실</th>').join('')}</tr></thead>
        <tbody>${chunk.map(row).join('')}${blanks}</tbody></table></div>`;
    }).join('');
  }

  // ---------------------------------------------------------------- 9-6 개별 수험표 (A4 4분할 또는 1명 크게)
  function slipStudent(x) {
    const idx = byStudent(), days = examDays(), periods = examPeriods(), slots = S.slots();
    const home = st().rooms.find((y) => y.ban === x.ban);
    const rows = days.map((d, di) => periods.map((p, pi) => {
      const sl = slots.find((y) => y.day === d && y.period === p);
      const r = sl ? idx.get(`${x.key}|${sl.key}`) : null;
      let cls = 'wait', subj = '자습', room = home ? home.name : '-', seat = '', time = sl ? slotTime(sl).replace(/\s/g, '') : '';
      if (sl && !r) { cls = 'bad'; subj = '확인 필요'; room = '-'; }
      else if (r && r.subject !== '미응시') { cls = 'exam'; subj = C.onlySubject(r.subject); room = r.room + (r.special ? '(별)' : ''); seat = r.seat != null ? String(r.seat) : ''; }
      else if (r) room = r.room;
      return `<tr class="${cls} ${pi === 0 && di > 0 ? 'day-top' : ''}">${pi === 0 ? `<td class="day" rowspan="${periods.length}"><div class="d">${d}일차</div><div class="dt">${h(U.fmtDateShort(st().dates[d - 1]))}</div></td>` : ''}<td class="per">${p}</td><td class="time">${h(time || '-')}</td><td class="subj">${h(subj)}</td><td class="room">${h(room)}</td><td class="seat">${st().out.slipSeat ? h(seat) : ''}</td></tr>`;
    }).join('')).join('');
    return `<div class="slip ticket">
      <div class="tk-bar"></div>
      <div class="tk-head">${schoolLine()}<span class="tk-title">${h(S.title())}</span> <span class="tk-suffix">수험표</span></div>
      <div class="tk-id"><span><small>학번</small><b class="acc">${C.studentNo(x.grade, x.ban, x.num)}</b></span><span><small>성명</small><b>${h(x.name)}</b></span></div>
      <table class="ptbl tk-tbl"><colgroup><col style="width:13%"><col style="width:8%"><col style="width:20%"><col style="width:31%"><col style="width:20%"><col style="width:8%"></colgroup><thead><tr><th>일자</th><th>교시</th><th>시간</th><th>과목</th><th>고사실</th><th>좌석</th></tr></thead><tbody>${rows}</tbody></table>
      ${slipNote()}</div>`;
  }
  /** 수험표 하단 유의사항 */
  const slipNote = () => {
    const o = st().out;
    const lines = o.slipNoteOn ? String(o.slipNote || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean) : [];
    return lines.length ? `<div class="slip-note">${lines.map((x) => `<div>※ ${h(x)}</div>`).join('')}</div>` : '';
  };
  /** 배치 형태: grid 한 장에 4명(2×2) / one 한 장에 1명 크게 */
  const SLIP_LAYOUTS = [['grid', 'A4 4분할 (한 장에 4명)'], ['one', '1명 크게 (한 장에 1명)']];
  const pagesStudents = (list) => {
    const lay = (ui.slipLayout || 'grid') === 'one' ? 'one' : 'grid';
    const per = lay === 'one' ? 1 : 4;
    const out = [];
    for (let i = 0; i < list.length; i += per) {
      const last = list[Math.min(i + per - 1, list.length - 1)];
      const name = per === 1 ? `${list[i].ban} ${list[i].num}번 ${list[i].name}` : `${list[i].ban} ${list[i].num}~${last.num}번`;
      out.push(`<div class="page slips ${lay} ${slipNote() ? 'with-note' : ''}" data-layout="${lay}" data-sheet="${h(name)}">${list.slice(i, i + per).map((x) => slipStudent(x)).join('')}</div>`);
    }
    return out.join('');
  };

  // ---------------------------------------------------------------- 10-8 별도 수험생
  /** 별도실 학생 목록 (반·번호 순) */
  const spStudents = () => S.students().filter((x) => st().special.students[x.key] && st().special.students[x.key].room);
  const timeWith = (slot, extra) => { const t = slotTime(slot); return extra ? endWithExtra(t, extra) : t; };
  /** 학생별 안내 (한 장에 1명): 별도실에서 보는 교시 목록 + 개별 수험표 */
  function spGuide(x) {
    const idx = byStudent(), sp = st().special.students[x.key], days = examDays(), periods = examPeriods(), slots = S.slots();
    const rows = slots.map((sl) => ({ sl, r: idx.get(`${x.key}|${sl.key}`) })).filter((y) => y.r && y.r.special);
    const roomName = S.specialRoom(sp.room).name;
    const grid = periods.map((p) => `<tr><th>${p}교시</th>${days.map((d) => {
      const sl = slots.find((y) => y.day === d && y.period === p), r = sl ? idx.get(`${x.key}|${sl.key}`) : null;
      if (!r || r.subject === '미응시') return `<td class="wait">${r ? '자습' : '-'}${r ? `<small>${h(r.room)}</small>` : ''}</td>`;
      return `<td><div class="s">${h(C.onlySubject(r.subject))}</div><div class="rm ${r.special ? 'sp' : 'acc'}">${h(r.room)}${r.special ? '(별)' : ''}${!r.special && r.seat != null ? ` · ${r.seat}번` : ''}</div><small>${h(slotTime(sl).replace(/\s/g, ''))}${r.special && r.extra ? ` (+${r.extra}분)` : ''}</small></td>`;
    }).join('')}</tr>`).join('');
    return `<div class="page fill spnotice" data-sheet="${h(`별도 안내 ${x.name}`)}">
      ${sheetHead('별도 고사실 응시 안내', '아래 시간에는 소속 교실이 아니라 별도 고사실에서 시험을 봅니다.', [['학년·반·번호', `${x.grade}학년 ${h(x.ban)} ${x.num}번`], ['성명', h(x.name)], ['별도 고사실', h(roomName)], ['해당 교시', sp.mode === 'pick' ? `${rows.length}개 교시` : '모든 시험']], [1, 2])}
      ${rows.length ? `<table class="ptbl sheet5 sp-rows"><colgroup><col style="width:10%"><col style="width:24%"><col><col style="width:18%"><col style="width:14%"></colgroup><thead><tr><th>연번</th><th>교시</th><th>과목</th><th>원고사실</th><th>답안지</th></tr></thead>
        <tbody>${rows.map(({ sl, r }, k) => `<tr><td class="no">${k + 1}</td><td class="nm">${h(U.fmtDateShort(slotDate(sl)))} ${sl.period}교시</td><td>${h(C.onlySubject(r.subject))}${r.extra ? ` <small>(+${r.extra}분 → ${h((timeWith(sl, r.extra).split('~')[1] || '').trim())})</small>` : ''}</td><td class="acc">${h(r.origRoom || '')}</td><td></td></tr>`).join('')}</tbody></table>` : '<p class="p-note">아직 배치된 교시가 없습니다.</p>'}
      <p class="p-note sp-notes">· 이 학생은 <b>원고사실 명단에도 그대로 올라 있습니다.</b> 명단 비고에 '별도'로 표시됩니다.<br>· 좌석배치도에는 나오지 않습니다. 그 교실에 앉지 않기 때문입니다.<br>· 시험이 끝나면 답안지를 원고사실 것과 합쳐 주세요.</p>
      <div class="sp-ticket"><div class="sh-title small">개별 수험표</div><div class="sh-line sm">${x.grade}학년 ${h(x.ban)} ${x.num}번 ${h(x.name)} · 학번 ${C.studentNo(x.grade, x.ban, x.num)}</div>
        <table class="ptbl sp-tk">${eqCols([12], days.length)}<thead><tr><th>교시</th>${days.map((d) => `<th>${d}일차<small>${h(U.fmtDateShort(st().dates[d - 1]))}</small></th>`).join('')}</tr></thead><tbody>${grid}</tbody></table>
        <p class="p-note">고사실 뒤에 <b class="amber">(별)</b>이 붙은 교시는 별도 고사실에서 봅니다.</p></div></div>`;
  }
  const pagesSpGuide = (list) => list.map(spGuide).join('');
  /** 교시별 명렬 (별도실마다 한 장): 감독용 */
  function pagesSpList() {
    const out = [];
    S.slots().forEach((sl) => {
      for (let k = 1; k <= S.specialCount(); k++) {
        const i = S.SPECIAL_BASE + k - 1;
        const rows = seatAll().filter((r) => r.slot === sl.key && r.roomIndex === i).sort((a, b) => (a.ban === b.ban ? a.num - b.num : String(a.ban).localeCompare(String(b.ban), 'ko')));
        if (!rows.length) continue;
        const room = roomAt(i);
        out.push(`<div class="page fill splist" data-sheet="${h(`별도 명렬 ${sl.day}일${sl.period}교시 ${room.name}`)}">
          ${sheetHead('별도 고사실 명렬', '아래 학생들은 소속 고사실 명단에도 올라 있습니다. 시험이 끝나면 답안지를 원고사실 것과 합쳐 주세요.', [['시행', `${sl.day}일차 ${sl.period}교시<small>${h(U.fmtDateShort(slotDate(sl)))} ${h(slotTime(sl))}</small>`], ['별도 고사실', h(room.name)], ['인원', `${rows.length}명`], ['감독', '']], [1, 2])}
          <table class="ptbl sheet5 sp-list2"><colgroup><col style="width:8%"><col style="width:15%"><col style="width:15%"><col><col style="width:14%"><col style="width:20%"><col style="width:11%"></colgroup><thead><tr><th>연번</th><th>학번</th><th>성명</th><th>과목</th><th>원고사실</th><th>비고</th><th>답안지</th></tr></thead>
          <tbody>${rows.map((r, k) => `<tr><td class="no">${k + 1}</td><td>${C.studentNo(r.grade, r.ban, r.num)}</td><td class="nm">${h(r.name)}</td><td>${h(C.onlySubject(r.subject))}</td><td class="acc">${h(r.origRoom || '')}</td><td class="memo">${r.extra ? `+${r.extra}분 (~${h((timeWith(sl, r.extra).split('~')[1] || '').trim())})` : ''}</td><td></td></tr>`).join('')}</tbody></table></div>`);
      }
    });
    return out.join('');
  }

  // ---------------------------------------------------------------- 9-7 문제지 봉투 라벨 (A4 가로 · 한 장에 하나)
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
  /** 스타일 A: 과목 크게 */
  const labelCardA = (l) => {
    const code = st().subjectCodes[l.subject];
    return `<div class="page landscape labelpage" data-sheet="${h(`라벨 ${l.n}`)}"><div class="env-card">
      <div class="env-title">${h(S.title())}</div>
      <div class="env-row"><span>일시: ${h(U.fmtDate(slotDate(l.slot)))} (${l.slot.day}일차 ${l.slot.period}교시) ${h(slotTime(l.slot))}</span><span class="env-seq">연번 #${l.n}</span></div>
      <div class="env-subj"><div class="env-subj-name">${h(C.onlySubject(l.subject))}</div>${code ? `<span class="env-code">【 ${h(code)} 】</span>` : ''}</div>
      <div class="env-boxes"><div class="env-box"><span>고사실</span><strong class="big">${h(l.room)}</strong></div><div class="env-box"><span>응시분반</span><strong>${h(l.classRoom || '전체')}</strong></div><div class="env-box hl"><span>응시인원</span><strong class="big">${l.count}명</strong></div></div>
    </div></div>`;
  };
  /** 스타일 B: 표 */
  const labelCardB = (l) => {
    const code = st().subjectCodes[l.subject], subj = C.onlySubject(l.subject);
    const grade = st().rows[0] ? `${C.val(st().rows[0].학년)}학년 ` : '';
    const rows = [['일시', `${h(U.fmtDate(slotDate(l.slot)))} ${l.slot.period}교시 <small>${h(slotTime(l.slot))}</small>`, false], ['과목', code ? `${h(subj)} (${h(code)})` : h(subj), false], ['고사실', h(l.room), true], ['응시분반', `${grade}${h(subj)} - ${h(l.classRoom || '전체')}`, false], ['응시인원', `${l.count}명`, false]];
    return `<div class="page landscape labelpage" data-sheet="${h(`라벨 ${l.n}`)}"><table class="env-tbl"><colgroup><col style="width:30%"><col></colgroup><tbody>${rows.map(([k, v, big]) => `<tr><th>${k}</th><td class="${big ? 'big' : ''}">${v}</td></tr>`).join('')}</tbody></table></div>`;
  };
  const pagesLabels = (list) => list.map(st().out.labelStyle === 'table' ? labelCardB : labelCardA).join('');

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
        const lay = ui.slipLayout || 'grid';
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
        if (!ls.some((l) => l.n === ui.lbl)) ui.lbl = ls[0] ? ls[0].n : 0;
        const cur = ls.find((l) => l.n === ui.lbl);
        ctrl = radios('o-lstyle', '라벨 모양', [['big', '스타일 A · 과목 크게'], ['table', '스타일 B · 표']], st().out.labelStyle) +
          (ls.length ? sel('o-lbl', ls.map((l) => [l.n, `${l.n}. ${l.slot.day}일차 ${l.slot.period}교시 · ${C.onlySubject(l.subject)} · ${l.room}`]), ui.lbl) : '');
        preview = `<div class="label-layout no-print-inner">
          <div class="card code-card"><h3>과목코드 입력 <span class="muted">(선택)</span></h3>
            <p class="hint">과목마다 봉투 라벨에 함께 인쇄할 과목코드를 적습니다. 비워 두면 과목명만 인쇄됩니다.</p>
            <table class="tbl compact code-tbl"><tbody>${subs.map((x) => `<tr><td>${h(x)}</td><td><input class="input sm" data-change="o-code" data-s="${h(x)}" value="${h(st().subjectCodes[x] || '')}" placeholder="12" maxlength="6"></td></tr>`).join('')}</tbody></table>
            <div class="code-save"><button class="btn primary sm" data-act="o-code-save" title="적어 둔 과목코드를 모두 저장하고 오른쪽 미리보기를 새로 그립니다">💾 과목코드 입력 저장</button></div>
          </div>
          <div class="label-preview">${cur ? pagesLabels([cur]) : '<div class="empty"><p>인쇄할 라벨이 없습니다. 시간표와 고사장 배치를 먼저 확정하세요.</p></div>'}</div>
        </div>`;
        scopes = [['cur', cur ? `미리보기 라벨 1개 (${cur.room})` : '미리보기 라벨'], ['every', `전체 라벨 (${ls.length}개)`]];
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
  const scopeReady = () => { if (ui.tab === 'label' && !labels().length) { U.toast('인쇄할 라벨이 없습니다.', 'error'); return false; } return true; };
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
      case 'label': { const ls = labels(); return pagesLabels(scope === 'cur' ? ls.filter((l) => l.n === ui.lbl) : ls); }
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

  // 10-7 미리보기: 오른쪽 칸 너비에 맞게 라벨 쪽을 축소
  function fitLabelPreview() {
    const box = document.querySelector('.label-preview'), page = box && box.querySelector('.page');
    if (!box || !page) return;
    box.style.zoom = '';
    const avail = box.clientWidth, w = page.getBoundingClientRect().width;
    if (w > avail + 1) box.style.zoom = String(Math.max(0.4, Math.floor((avail / w) * 100) / 100));
  }
  window.addEventListener('resize', fitLabelPreview);

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
      if (ui.tab === 'label') requestAnimationFrame(fitLabelPreview);
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
      'print-slot'() { doPrint('slot'); },
      'print-every'() { doPrint('every'); },
      'o-code-save'() { document.querySelectorAll('.code-card input[data-change="o-code"]').forEach((el) => S.setSubjectCode(el.dataset.s, el.value.trim())); rerender(); U.toast('과목코드를 저장하였습니다.', 'ok'); },
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
      'o-lbl'(el) { ui.lbl = +el.value; rerender(); },
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
