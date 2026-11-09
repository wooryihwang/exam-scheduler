/* 핵심 알고리즘 회귀 테스트 (가상 데이터 사용) — 실행: node tests/core.test.js */
const assert = require('assert');
const C = require('../js/core.js');
global.window = {};
require('../js/sample.js');
const { sampleAoa } = global.window.Sample;

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('PASS', name); };

const parsed = C.parseNeis(sampleAoa(2026));
const rows = parsed.rows;
t('나이스 양식 파싱 + 미재학 제외', () => { assert.ok(rows.length > 1000); assert.strictEqual(parsed.removed, 1); });
t('양식이 아니면 오류', () => assert.ok(C.parseNeis([['x']]).error));

const { subjects, subjectClasses } = C.buildBase(rows);
const rooms = C.buildRooms(rows);
t('과목 반수 = 과목반 수', () => subjects.forEach((s) => assert.strictEqual(s.banCount, subjectClasses.filter((c) => c.subject === s.name).length)));
t('학반 교실 판별: N반만 (별도실·공동교육과정반·편의반 제외)', () => {
  assert.strictEqual(rooms.filter(C.isClassRoom).length, 6);
  assert.ok(C.isClassRoom({ ban: '01반', name: '3-1' }));
  ['인공지능반(공동교육과정반)', '위탁학생', '편의반', ''].forEach((b) => assert.ok(!C.isClassRoom({ ban: b, name: 'x' })));
});
t('고사실 다시 읽기: 고친 값·별도실·직접 추가한 학반 유지', () => {
  const old = C.buildRooms(rows).map((r) => ({ ...r }));
  old[0].name = '본관 101'; old[0].cap = 25;
  old.splice(6, 0, { ban: '7반', stuCount: 0, maxClass: 30, name: '1-7', cap: 30, manual: true });
  old.push({ ban: '', stuCount: 0, maxClass: 0, name: '시청각실', cap: 40 });
  old.push({ ban: '9반', stuCount: 9, maxClass: 9, name: '1-9', cap: 9 }); // 데이터에 없는 예전 학반
  const r = C.mergeRooms(rows, old);
  assert.strictEqual(r.rooms[0].name, '본관 101'); assert.strictEqual(r.rooms[0].cap, 25);
  assert.ok(r.rooms.some((x) => x.ban === '7반'));
  assert.ok(r.rooms.some((x) => x.name === '시청각실'));
  assert.deepStrictEqual(r.removed, ['9반']);
  assert.strictEqual(r.rooms.filter((x) => x.ban).length, 7);
});
t('고사실: 학반 6 + 별도실 3', () => { assert.strictEqual(rooms.length, 9); assert.strictEqual(rooms.filter(C.isExtraRoom).length, 3); });

const evalNames = subjects.filter((s) => !/체육|과학탐구/.test(s.name)).map((s) => s.name);
const students = C.buildStudents(rows, evalNames);
const sets = C.subjectStudentSets(rows, evalNames);
t('동시 시험 가능 판정', () => {
  assert.ok(C.canSameTime(['음악(2)', '미술(2)'], sets));
  assert.ok(C.canSameTime(['중국어(2)', '일본어(2)'], sets));
  assert.ok(!C.canSameTime(['공통국어1(4)', '공통수학1(4)'], sets));
});
t('동시 시험 조합 탐색', () => {
  const { combos } = C.findSameTimeCombos(subjects.filter((s) => evalNames.includes(s.name)), sets, students.length);
  assert.ok(combos.some((c) => c.subjects.join() === '중국어(2),일본어(2)'));
  combos.forEach((c) => assert.ok(C.canSameTime(c.subjects, sets)));
});

const tt = { '1_1': ['음악(2)'], '1_2': ['한국사1(3)'], '1_3': ['공통국어1(4)'], '2_1': ['정보(3)', '기술·가정(3)'], '2_2': ['공통영어1(4)'], '3_1': ['중국어(2)', '일본어(2)'], '3_2': ['통합과학1(4)'], '4_1': ['미술(2)'], '4_2': ['공통수학1(4)'], '5_2': ['통합사회1(4)'] };
const dates = ['2026-12-14', '2026-12-15', '2026-12-16', '2026-12-17', '2026-12-18'];
const times = {}; for (let d = 1; d <= 5; d++) [1, 2, 3].forEach((p) => { times[`${d}_${p}`] = '09:00 ~ 09:50'; });
t('시간표 검증 통과', () => assert.deepStrictEqual(C.validateTimetable(evalNames, tt, sets, dates, times), []));
t('미편성·중복 검출', () => {
  const bad = { ...tt, '5_3': ['음악(2)'] }; delete bad['5_2'];
  const e = C.validateTimetable(evalNames, bad, sets, dates, { ...times, '5_3': '11:00 ~ 11:50' });
  assert.ok(e.some((x) => x.includes('중복'))); assert.ok(e.some((x) => x.includes('미편성')));
});
t('자동 편성: 모두 편성 + 동시 시험 규칙 + 기존 편성 유지', () => {
  const avail = []; for (let d = 1; d <= 5; d++) for (let p = 1; p <= 3; p++) avail.push({ d, p });
  const evalList = subjects.filter((s) => evalNames.includes(s.name));
  const r = C.autoTimetable(evalList, students, sets, { '1_1': ['한국사1(3)'] }, avail, { tries: 60 });
  assert.deepStrictEqual(r.unplaced, []);
  assert.deepStrictEqual(r.timetable['1_1'].slice(0, 1), ['한국사1(3)']);
  assert.deepStrictEqual(C.validateTimetable(evalNames, r.timetable, sets, dates, Object.fromEntries(avail.map((a) => [`${a.d}_${a.p}`, '09:00 ~ 09:50']))), []);
  // 칸이 모자라면 동시 시험 가능 과목끼리 묶어서라도 편성
  const tight = C.autoTimetable(evalList, students, sets, {}, avail.slice(0, 9), { tries: 60 });
  assert.deepStrictEqual(tight.unplaced, []);
  Object.values(tight.timetable).forEach((v) => assert.ok(C.canSameTime(v, sets)));
});
t('일차별 분포 합 = 학생 수', () => { for (let d = 1; d <= 5; d++) assert.strictEqual(C.dayDistribution(students, tt, d).dist.reduce((a, b) => a + b, 0), students.length); });

const sbMap = C.subjectBanMap(subjectClasses);
const placement = {};
for (const slot of C.placeSlots(tt)) {
  const info = C.slotInfo(slot, students, subjectClasses);
  placement[slot.key] = C.autoPlaceSlot(slot, [], { rooms, sbMap, info }, false);
  t(`${slot.title} 자동 배치 완료`, () => assert.strictEqual(C.slotPlacementStatus(slot, placement[slot.key], info, sbMap, rooms).status, 'OK'));
}
t('학교 규칙 배치: 1개 반→특별실, 2개 반→앞 교실+빈 교실, 4개 반→뒤 교실+빈 교실', () => {
  const ctx = (slot) => ({ rooms, sbMap, info: C.slotInfo(slot, students, subjectClasses) });
  const fake = (bans, waitN) => {
    // 가짜 회차: 과목반 정보를 직접 만들어 규칙만 검사
    const sc = bans.map((n, k) => ({ subject: '선택과목', room: `선택-${k}`, stuCount: n }));
    const sbm = C.subjectBanMap(sc);
    const info = { banTotal: bans.length, exam: bans.reduce((a, b) => a + b, 0), wait: waitN, waitByBan: { '1반': 20, '2반': 20, '3반': 20, '4반': 20, '5반': 20, '6반': 20 } };
    return C.autoPlaceSlot({ key: 'x', subjects: ['선택과목'] }, [], { rooms, sbMap: sbm, info }, false, 'rule');
  };
  const one = fake([25], 120);
  assert.ok(C.isExtraRoom(rooms[one.findIndex((v) => C.parseCell(v).type === 'exam')]));
  const two = fake([25, 25], 100);
  assert.deepStrictEqual(two.slice(0, 3).map((v) => C.parseCell(v).type), ['exam', 'exam', 'void']);
  const four = fake([25, 25, 25, 25], 60);
  assert.deepStrictEqual(four.slice(0, 6).map((v) => C.parseCell(v).type), ['wait', 'void', 'exam', 'exam', 'exam', 'exam']);
  // 실제 회차(전체 응시)는 자기 교실
  const sl = C.examSlots(tt).find((x) => x.key === '1_2');
  const all = C.autoPlaceSlot(sl, [], ctx(sl), false, 'rule');
  assert.strictEqual(all[0], '한국사1(3)-1반');
  // 빈 교실은 응시현황에 학생이 생기지 않음
  assert.strictEqual(C.parseCell(C.VOID_CELL).type, 'void');
});
t('학반별 고사장 + 학생 강제 이동', () => {
  // 공통국어를 분반 대신 학반별 고사장으로 배치
  const sl = C.examSlots(tt).find((x) => x.key === '1_3');
  const info = C.slotInfo(sl, students, subjectClasses);
  const cells = rooms.map((r) => (C.isClassRoom(r) ? C.homeCell('공통국어1(4)', r.ban) : ''));
  const st0 = C.slotPlacementStatus(sl, cells, info, sbMap, rooms);
  assert.strictEqual(st0.status, 'OK'); assert.deepStrictEqual(st0.problems, []); assert.strictEqual(st0.remainBans, 0);
  // 분반과 학반별을 섞으면 오류
  const mixed = cells.slice(); mixed[0] = '공통국어1(4)-1반';
  assert.ok(C.slotPlacementStatus(sl, mixed, info, sbMap, rooms).problems.length > 0);
  const ctx = { rooms, sbMap, students, idx: C.studentIndex(rows), waitMode: 'class' };
  const r0 = C.slotRoster(ctx, sl, cells, {});
  assert.ok([...r0.rooms.get(0).list].every((s) => s.ban === '1반'));
  // 1반 학생 한 명을 2반 교실(같은 과목 시험실)로 이동
  const who = r0.rooms.get(0).list[0];
  const r1 = C.slotRoster(ctx, sl, cells, { [C.studentKey(who.ban, who.num)]: 1 });
  assert.strictEqual(r1.rooms.get(0).list.length, r0.rooms.get(0).list.length - 1);
  assert.ok(r1.rooms.get(1).list.some((s) => s.ban === who.ban && s.num === who.num && s.moved));
  // 확정해도 학생 수 그대로
  const pl = { ...placement, '1_3': cells };
  const res = C.buildSeating({ rows, rooms, subjectClasses, timetable: tt, placement: pl, moves: { '1_3': { [C.studentKey(who.ban, who.num)]: 1 } } }, students);
  assert.deepStrictEqual(res.errors, []);
  assert.strictEqual(res.seating.find((x) => x.slot === '1_3' && x.ban === who.ban && x.num === who.num).roomIndex, 1);
});
t('정원 맞추기: 초과 인원을 같은 과목 고사실 빈자리로', () => {
  const sl = C.examSlots(tt).find((x) => x.key === '1_3');
  const small = rooms.map((r) => ({ ...r }));
  small[0].cap = 25; // 1반 교실(29명)을 25석으로
  small[1].cap = 40; // 2반 교실은 여유
  const cells = small.map((r) => (C.isClassRoom(r) ? C.homeCell('공통국어1(4)', r.ban) : ''));
  const ctx = { rooms: small, sbMap, students, idx: C.studentIndex(rows), waitMode: 'class' };
  const b = C.balanceMoves(ctx, sl, cells);
  assert.ok(b.moved === 4 && !b.unresolved.length, JSON.stringify(b));
  // 빈자리가 없으면 해결하지 못한 초과로 알려 줌
  const tight = rooms.map((r) => ({ ...r })); tight[0].cap = 25;
  assert.strictEqual(C.balanceMoves({ ...ctx, rooms: tight }, sl, cells).unresolved[0].over, 4);
  const r = C.slotRoster(ctx, sl, cells, b.moves);
  for (const [i, x] of r.rooms) assert.ok(x.list.length <= (small[i].cap || Infinity), `${small[i].name} ${x.list.length}/${small[i].cap}`);
});
t('추가 고사장: 정원 초과 학생을 받아 옴', () => {
  const sl = C.examSlots(tt).find((x) => x.key === '1_3');
  const small = rooms.map((r) => ({ ...r, cap: C.isClassRoom(r) ? 25 : r.cap }));
  const cells = small.map((r) => (C.isClassRoom(r) ? C.homeCell('공통국어1(4)', r.ban) : ''));
  cells[6] = C.moreCell('공통국어1(4)'); // 별도실1을 추가 고사장으로
  const info = C.slotInfo(sl, students, subjectClasses);
  assert.strictEqual(C.slotPlacementStatus(sl, cells, info, sbMap, small).status, 'OK');
  const ctx = { rooms: small, sbMap, students, idx: C.studentIndex(rows), waitMode: 'class' };
  const b = C.balanceMoves(ctx, sl, cells);
  assert.ok(b.moved > 0 && !b.unresolved.length);
  const r = C.slotRoster(ctx, sl, cells, b.moves);
  assert.strictEqual(r.rooms.get(6).list.length, b.moved);
  for (const [i, x] of r.rooms) assert.ok(x.list.length <= small[i].cap);
});
t('배치 확정 전 엄격 검사: 정원 초과·빈 추가 고사장·미배치를 모두 찾음', () => {
  const roomy = rooms.map((r) => ({ ...r, cap: 40 }));
  const base = { rows, rooms: roomy, subjectClasses, timetable: tt, placement, moves: {} };
  assert.deepStrictEqual(C.placementIssues(base, students), []);
  const small = roomy.map((r, i) => ({ ...r, cap: i === 0 ? 20 : r.cap }));
  const over = C.placementIssues({ ...base, rooms: small }, students);
  assert.ok(over.some((x) => x.i === 0 && /초과/.test(x.msg)));
  const pl2 = { ...placement, '1_2': placement['1_2'].slice() }; pl2['1_2'][8] = C.moreCell('한국사1(3)');
  assert.ok(C.placementIssues({ ...base, placement: pl2 }, students).some((x) => x.i === 8 && /추가 고사장/.test(x.msg)));
  const pl3 = { ...placement, '1_2': placement['1_2'].slice() }; pl3['1_2'][0] = '';
  assert.ok(C.placementIssues({ ...base, placement: pl3 }, students).some((x) => x.slot === '1_2' && x.i === null));
});
t('학반 교실 매칭: 음악 1반은 1-1', () => assert.strictEqual(placement['1_1'][0], '음악(2)-1반'));
t('대기실은 같은 반 교실', () => assert.ok(/^대기 - /.test(placement['1_1'][3])));

const res = C.buildSeating({ rows, rooms, subjectClasses, timetable: tt, placement }, students);
t('배치 확정 → 응시현황', () => { assert.deepStrictEqual(res.errors, []); assert.strictEqual(res.seating.length, students.length * C.placeSlots(tt).length); });
t('좌석 미부여 시 검사 실패', () => assert.ok(C.validateSeating(res.seating, students, C.placeSlots(tt), rooms).length > 0));
C.assignSeatsRandom(res.seating);
t('랜덤 좌석 검사 통과 + 고사실 내 중복 없음', () => {
  assert.deepStrictEqual(C.validateSeating(res.seating, students, C.placeSlots(tt), rooms), []);
  const g = new Map();
  res.seating.forEach((r) => { const k = r.slot + r.room; if (!g.has(k)) g.set(k, new Set()); assert.ok(!g.get(k).has(r.seat)); g.get(k).add(r.seat); });
});
t('좌석표: 1번은 왼쪽 위(교탁 쪽), 아래로 차례대로', () => { const g = C.seatGrid(30, 5); assert.strictEqual(g.grid[0][0], 1); assert.strictEqual(g.grid[1][0], 2); assert.strictEqual(g.grid[0][1], 7); assert.strictEqual(g.grid[5][4], 30); });
t('시간 계산', () => { assert.strictEqual(C.minutesOf('08:50 ~ 9:40'), '50분'); assert.strictEqual(C.studentNo(1, '3반', 7), '10307'); });

// ---------------------------------------------------------------- 원본 엑셀 방식
const placementO = {};
for (const slot of C.placeSlots(tt)) {
  const info = C.slotInfo(slot, students, subjectClasses);
  placementO[slot.key] = C.autoPlaceSlot(slot, [], { rooms, sbMap, info }, false, 'original');
}
t('원본 방식 자동 배치: 순서대로 채움', () => {
  assert.deepStrictEqual(placementO['4_1'].slice(0, 3), ['미술(2)-1반', '미술(2)-2반', '미술(2)-3반']);
  for (const slot of C.placeSlots(tt)) assert.strictEqual(C.slotPlacementStatus(slot, placementO[slot.key], C.slotInfo(slot, students, subjectClasses), sbMap, rooms).status, 'OK');
});
t('원본 방식 대기 배정: 같은 반 먼저, 남는 자리는 명단 앞쪽', () => {
  const r = C.buildSeating({ rows, rooms, subjectClasses, timetable: tt, placement: placementO }, students, 'original');
  assert.deepStrictEqual(r.errors, []);
  // 4일차 1교시: 미술(4~6반)이 1-1~1-3에 들어가고, 1-4(4반 교실)는 4반 대기 학생이 없으므로 명단 앞쪽(1반)으로 채워진다
  const waitRoom = r.seating.filter((x) => x.slot === '4_1' && x.roomIndex === 3);
  assert.ok(waitRoom.length > 0 && waitRoom.every((x) => x.subject === '미응시'));
  assert.strictEqual(waitRoom[0].ban, '1반');
  assert.ok(!waitRoom.some((x) => x.ban === '4반'));
  assert.strictEqual(r.seating.length, students.length * C.placeSlots(tt).length);
});

// ---------------------------------------------------------------- 기존 엑셀 프로그램 가져오기 (가상 통합문서)
t('프로그램 파일 판별', () => { assert.ok(C.isProgramWorkbook(['1.편성현황', '2.기초정보', '4.평가과목', '6.시간표작성', '7.학생배치', '8.응시현황'])); assert.ok(!C.isProgramWorkbook(['Sheet1'])); });
t('readProgram → stateFromProgram: 확정 단계 이어받기', () => {
  const cells = {}; const put = (sh, a, v) => { (cells[sh] = cells[sh] || {})[a] = v; };
  rows.forEach((x, i) => { const r = 7 + i; 'BCDEFGHIJKL'.split('').forEach((c, j) => put('1.편성현황', c + r, [x.학년도, x.학기, x.학년, x.편제명, x.과목, x.강의실, x.계열, x.반, x.번호, x.성명, x.강의실2][j])); });
  dates.forEach((d, i) => put('2.기초정보', `C${10 + i}`, d));
  let r = 5; for (let d = 1; d <= 5; d++) for (let p = 1; p <= 5; p++, r++) { put('2.기초정보', `F${r}`, `${d}일차`); put('2.기초정보', `G${r}`, `${p}교시`); put('2.기초정보', `H${r}`, times[`${d}_${p}`] || ''); }
  rooms.forEach((x, i) => { put('2.기초정보', `J${5 + i}`, x.ban); put('2.기초정보', `K${5 + i}`, x.stuCount); put('2.기초정보', `L${5 + i}`, x.maxClass); put('2.기초정보', `M${5 + i}`, x.name); put('2.기초정보', `N${5 + i}`, x.cap); });
  subjects.forEach((x, i) => { put('4.평가과목', `B${5 + i}`, x.name); put('4.평가과목', `E${5 + i}`, evalNames.includes(x.name) ? 'O' : ''); });
  const COLS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (const [k, v] of Object.entries(tt)) { const [d, p] = k.split('_').map(Number); v.forEach((s, j) => put('6.시간표작성', `${COLS[5 + (d - 1) * 4 + j]}${6 + (p - 1) * 3}`, s)); }
  C.examSlots(tt).forEach((sl, i) => placementO[sl.key].forEach((v, j) => put('7.학생배치', `${COLS[11 + j]}${9 + i * 3}`, v)));
  [['1.편성현황', 'F1'], ['4.평가과목', 'G1'], ['6.시간표작성', 'D4'], ['7.학생배치', 'C2']].forEach(([sh, a]) => put(sh, a, '확정'));
  put('9-1.전체', 'C2', '2026학년도 1학년 1학기 기말고사  시험시간표');
  const prog = C.readProgram((sh, a) => cells[sh] && cells[sh][a]);
  assert.strictEqual(prog.rows.length, rows.length);
  assert.strictEqual(prog.title, '2026학년도 1학년 1학기 기말고사');
  const { state, report } = C.stateFromProgram(prog);
  assert.ok(state.confirmed.placement && !state.confirmed.seats, report.join('/'));
  assert.strictEqual(state.seating.length, students.length * C.placeSlots(tt).length);
  assert.strictEqual(state.options.waitMode, 'original');
});
t('엑셀 날짜 일련번호 변환', () => { assert.strictEqual(C.toISODate(46198), '2026-06-25'); assert.strictEqual(C.toISODate('2026-06-25 00:00:00'), '2026-06-25'); });

t('고사 일자: 주말·공휴일 건너뛰기', () => {
  // 2026-07-15(수) 시작 → 7/16(목), 7/17(금 제헌절) 건너뜀, 7/18·19 주말 → 7/20(월)
  assert.deepStrictEqual(C.nextSchoolDays('2026-07-15', 3), ['2026-07-16', '2026-07-20', '2026-07-21']);
  // 2026-09-23(수) 시작 → 추석 9/24~26, 주말 9/27 → 9/28(월)
  assert.deepStrictEqual(C.nextSchoolDays('2026-09-23', 2), ['2026-09-28', '2026-09-29']);
  // 추가 휴일
  assert.deepStrictEqual(C.nextSchoolDays('2026-06-22', 2, ['2026-06-23']), ['2026-06-24', '2026-06-25']);
  assert.strictEqual(C.holidayReason('2026-10-10'), '토요일');
  assert.strictEqual(C.holidayReason('2026-10-05'), '공휴일'); // 개천절 대체공휴일
  assert.strictEqual(C.holidayReason('2026-06-25'), '');
});

t('자습 인원 맞추기: 대기실 빈자리를 고르게 채움', () => {
  // 화면 사례: 시험 3실 + 대기 16명 ×4 (정원 24) + 빈 교실 2, 자습 79명 → 15명 미배치
  const rooms = ['1반', '2반', '3반', '4반', '5반', '6반', '7반'].map((b, i) => ({ name: `2-${i + 1}`, ban: b, cap: i < 3 ? 28 : 24 }))
    .concat([{ name: '2-0', ban: '공동반', cap: 9 }, { name: '넘나들실', ban: '', cap: 30 }]);
  const cells = ['화학-1반', '화학-2반', '화학-3반', C.waitCell(16), C.waitCell(16), C.waitCell(16), C.waitCell(16), C.VOID_CELL, C.VOID_CELL];
  const r = C.fitWaits(cells, rooms, { wait: 79 });
  assert.deepStrictEqual(r.cells.slice(3), [C.waitCell(20), C.waitCell(20), C.waitCell(20), C.waitCell(19), C.VOID_CELL, C.VOID_CELL]);
  assert.strictEqual(r.added, 15); assert.strictEqual(r.short, 0);
  // 대기실이 모자라면 빈 교실을 자습실로
  const r2 = C.fitWaits(cells, rooms, { wait: 100 });
  assert.strictEqual(r2.short, 0); assert.ok(C.parseCell(r2.cells[7]).type === 'wait' || C.parseCell(r2.cells[8]).type === 'wait');
  // 넘치면 줄임
  const r3 = C.fitWaits(cells, rooms, { wait: 60 });
  assert.strictEqual(r3.removed, 4); assert.strictEqual(r3.cells.slice(3, 7).map((v) => C.parseCell(v).count).reduce((a, b) => a + b), 60);
});

t('띄워진 공간: 사이가 떨어져 있으면 완충 빈 교실을 두지 않음', () => {
  assert.strictEqual(C.roomsApart([2], 2, 3), true);
  assert.strictEqual(C.roomsApart([2], 3, 4), false);
  assert.strictEqual(C.roomsApart([], 0, 6), false);
  assert.strictEqual(C.roomsApart([4], 6, 3), true);
});

t('자습 교시: 그날 첫 시험 전 빈 교시는 전원 자기 반 교실 자습', () => {
  const tt2 = { '2_2': ['A'], '2_3': ['B'], '3_1': ['C'] };
  assert.deepStrictEqual(C.studySlots(tt2).map((x) => x.key), ['2_1']); // 그날 마지막 시험 뒤 교시는 제외
  assert.deepStrictEqual(C.placeSlots(tt2).map((x) => x.key), ['2_1', '2_2', '2_3', '3_1']);
  const sl = C.studySlots(tt)[0];
  assert.ok(sl, '시험 자료에 자습 교시가 있어야 함');
  const info = C.slotInfo(sl, students, subjectClasses);
  assert.strictEqual(info.exam, 0); assert.strictEqual(info.wait, students.length);
  const cells = C.autoPlaceSlot(sl, [], { rooms, sbMap, info }, false, 'rule');
  assert.strictEqual(C.slotPlacementStatus(sl, cells, info, sbMap, rooms).status, 'OK');
  const ros = C.slotRoster({ rooms, sbMap, students, idx: C.studentIndex(rows), waitMode: 'class' }, sl, cells, {});
  for (const [i, r] of ros.rooms) if (C.isClassRoom(rooms[i])) assert.ok(r.list.every((x) => x.ban === rooms[i].ban), rooms[i].name);
});

console.log(`\n${pass}개 테스트 통과`);
