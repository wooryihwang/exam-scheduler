/* 화면 쪽 동작 테스트 (store.js): 작업 공간, 가져오기, 교시 잠금, 출력 설정, 되돌리기, 확정 취소 목록
 * 실행: node tests/store.test.js  (브라우저 없이 localStorage·window 를 흉내 내어 돌린다) */
const assert = require('assert');

// 브라우저 흉내
const mem = {};
global.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
global.window = { indexedDB: undefined, addEventListener() {} };
global.U = { toast() {}, download() {}, esc: (s) => String(s), fmtDate: (s) => s, fmtDateShort: (s) => s, today: () => '2026-10-12' };
global.Core = require('../js/core.js');
window.Core = global.Core;
require('../js/sample.js');
require('../js/store.js');
const S = window.Store, C = window.Core;

let pass = 0;
const pending = [];
const t = (name, fn) => {
  const r = fn();
  if (r && typeof r.then === 'function') pending.push(r.then(() => { pass++; console.log('PASS', name); }));
  else { pass++; console.log('PASS', name); }
};

// 체험 자료로 1학년 작업 공간을 만든다
const rows = C.parseNeis(window.Sample.sampleAoa()).rows;
S.importRows(rows, '체험.xlsx');
t('작업 공간: 자료 불러오면 학년 이름이 붙음', () => {
  assert.ok(S.state.rows.length > 1000);
  assert.strictEqual(S.currentProject().name, '1학년');
  assert.strictEqual(S.currentGrade(), 1);
});

t('학생편성 확정 → 과목·분반 생성, 확정 취소 목록', () => {
  S.confirmRoster();
  assert.ok(S.state.confirmed.roster && S.state.subjects.length > 0);
  const loss = S.unconfirmLoss('roster');
  assert.ok(loss.some((x) => /과목/.test(x)));
});

t('기초정보 되돌리기: 교시 시간 바꾼 뒤 Ctrl+Z', () => {
  const k = C.slotKey(1, 1), before = S.state.times[k];
  S.setTime(k, '09:00 ~ 09:50');
  assert.strictEqual(S.state.times[k], '09:00 ~ 09:50');
  const r = S.undo();
  assert.ok(r.done && r.done.kind === 'bs');
  assert.strictEqual(S.state.times[k], before);
});

t('출력 설정: 기본값과 분반 이름 표기', () => {
  assert.strictEqual(S.state.out.seatOrder, 'col');
  assert.strictEqual(S.state.out.paper, 'A4');
  S.setOut('secLabel', 'abc');
  const x = [...S.sbMap().values()][1];
  assert.strictEqual(S.secName(x), 'B반');
  S.setOut('secLabel', 'ganada'); assert.strictEqual(S.secName(x), '나반');
  S.setOut('secLabel', 'none'); assert.strictEqual(S.secName(x), '');
  S.setOut('secLabel', 'num'); assert.strictEqual(S.secName(x), '2반');
});

t('평가과목 일괄 선택: 3반 이상 체크 · 반전', () => {
  S.setAllEval(false);
  S.evalBulk('ban3');
  assert.ok(S.state.subjects.filter((s) => s.evaluate).every((s) => s.banCount >= 3));
  const n = S.state.subjects.filter((s) => s.evaluate).length;
  S.evalBulk('invert');
  assert.strictEqual(S.state.subjects.filter((s) => s.evaluate).length, S.state.subjects.length - n);
  S.setAllEval(true);
  S.confirmSubjects();
  assert.ok(S.state.confirmed.subjects);
});

t('시간표 자동 편성 → 칸 맞교환 · 일차 바꾸기 · 되돌리기', () => {
  S.state.dates[0] = S.state.dates[0] || '2026-10-12';
  S.ttAuto(false);
  const keys = Object.keys(S.state.timetable);
  assert.ok(keys.length >= 2);
  const [a, b] = keys;
  const A = JSON.stringify(S.state.timetable[a]), B = JSON.stringify(S.state.timetable[b]);
  const [d1, p1] = a.split('_').map(Number), [d2, p2] = b.split('_').map(Number);
  S.ttSwapCells(d1, p1, d2, p2);
  assert.strictEqual(JSON.stringify(S.state.timetable[a]), B);
  assert.strictEqual(JSON.stringify(S.state.timetable[b]), A);
  S.undo();
  assert.strictEqual(JSON.stringify(S.state.timetable[a]), A);
  const day1 = Object.entries(S.state.timetable).filter(([k]) => k.startsWith('1_')).map(([k, v]) => [k.slice(2), v]);
  S.ttSwapDays(1, 2);
  const day2 = Object.entries(S.state.timetable).filter(([k]) => k.startsWith('2_')).map(([k, v]) => [k.slice(2), v]);
  assert.deepStrictEqual(day2, day1);
  S.undo();
});

t('학생 배치: 자동 배치 · 교시 잠금은 자동 배치·편집·전체 삭제에서 보호', () => {
  S.confirmTimetable();
  // 체험 자료는 학반 정원이 작아 초과가 나므로, 확정 검사를 위해 정원을 넉넉히 둔다
  S.state.rooms.forEach((r, i) => S.setRoom(i, 'cap', 40));
  S.autoPlaceAll(true);
  const k = S.slots()[0].key, other = S.slots()[1].key;
  const snap = JSON.stringify(S.cells(k));
  S.toggleLock(k);
  assert.ok(S.isLocked(k));
  S.setCell(k, 0, '');
  assert.strictEqual(JSON.stringify(S.cells(k)), snap, '잠긴 교시는 편집되지 않음');
  S.clearAllPlacement();
  assert.strictEqual(JSON.stringify(S.cells(k)), snap, '전체 삭제에서도 남음');
  assert.ok(S.cells(other).every((v) => !v), '다른 교시는 지워짐');
  S.autoPlaceAll(true);
  assert.strictEqual(JSON.stringify(S.cells(k)), snap, '전체 자동 배치에서도 그대로');
  assert.ok(S.cells(other).some(Boolean));
  S.setAllLocks(false);
  assert.ok(!S.isLocked(k));
});

t('배치 확정 → 응시현황 → 확정 취소 목록에 명단 건수', () => {
  const r = S.confirmPlacement();
  assert.deepStrictEqual(r.errors || [], []);
  assert.ok(S.state.seating.length > 0);
  const loss = S.unconfirmLoss('timetable');
  assert.ok(loss.some((x) => x.includes(`${S.state.seating.length}건`)));
});

t('별도실: 학생별 추가 시간 · 고른 교시만', () => {
  const stu = S.students()[0];
  S.setSpecialStudent(stu.key, 2);
  S.setSpecialExtra(stu.key, 10);
  assert.strictEqual(S.specialPlan(stu.key, S.slots()[0].key).extra, 10);
  S.setSpecialMode(stu.key, 'pick');
  const exams = S.specialExamSlots(stu.key);
  assert.ok(exams.length > 0);
  S.setSpecialSlot(stu.key, exams[0].slot, null);
  assert.strictEqual(S.specialPlan(stu.key, exams[0].slot), null, '고르지 않은 교시는 원래 고사실');
  const fin = S.finalSeating().filter((x) => C.studentKey(x.ban, x.num) === stu.key && x.special);
  assert.strictEqual(fin.length, exams.length - 1);
  S.setSpecialStudent(stu.key, null);
});

t('다른 학년 설정 가져오기 · 여러 작업 공간', () => {
  const srcId = S.currentProject().id;
  const srcDates = S.state.dates.slice();
  S.newProject('2학년');
  assert.strictEqual(S.currentProject().name, '2학년');
  assert.ok(S.projectHasRows(srcId));
  assert.ok(S.projectConfirmedRoster(srcId));
  const r = S.copyBasicFrom(srcId, true);
  assert.ok(r);
  assert.deepStrictEqual(S.state.dates, srcDates);
  const u = S.undo();
  assert.ok(u.done && u.done.kind === 'bs', '가져오기도 되돌려짐');
  S.switchProject(srcId);
  assert.strictEqual(S.currentProject().name, '1학년');
});

t('백업 JSON 내보내기·불러오기', () => {
  const json = S.exportJSON();
  const n = S.state.seating.length;
  S.newProject('복원');
  S.importJSON(json);
  assert.strictEqual(S.state.seating.length, n);
});

t('새 고사 시작: 자료는 지우고 고사실·시간·과목코드는 남김', async () => {
  S.switchProject(S.projects().find((p) => p.name === '1학년').id);
  S.setSubjectCode(S.state.subjects[0].name, '07');
  const rooms = S.state.rooms.length, times = JSON.stringify(S.state.times), code = S.state.subjects[0].name;
  assert.ok(S.state.rows.length > 0 && S.state.seating.length > 0);
  await S.newExam({ keepCodes: true });
  assert.strictEqual(S.state.rows.length, 0);
  assert.strictEqual(S.state.seating.length, 0);
  assert.deepStrictEqual(S.state.confirmed, { roster: false, subjects: false, timetable: false, placement: false, seats: false });
  assert.strictEqual(S.state.rooms.length, rooms, '고사실 유지');
  assert.strictEqual(JSON.stringify(S.state.times), times, '교시 시간 유지');
  assert.strictEqual(S.state.subjectCodes[code], '07', '과목코드 유지');
  assert.ok(S.state.dates.every((d) => !d), '날짜는 비움');
  await S.newExam({ keepCodes: false });
  assert.deepStrictEqual(S.state.subjectCodes, {}, '과목코드 지움');
});

Promise.all(pending).then(() => console.log(`\n${pass}개 테스트 통과`)).catch((e) => { console.error(e); process.exit(1); });
