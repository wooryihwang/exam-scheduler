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
  // 체크 저장 → 모두 해제 → 기존 체크로 되살림
  const saved = S.saveEvalChecks();
  assert.strictEqual(saved, S.state.subjects.length - n);
  S.setAllEval(false);
  S.restoreEvalChecks();
  assert.strictEqual(S.state.subjects.filter((s) => s.evaluate).length, saved);
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
  // 교시 지정은 빈 상태에서 시작 → 고른 교시만 별도실
  assert.strictEqual(S.finalSeating().filter((x) => C.studentKey(x.ban, x.num) === stu.key && x.special).length, 0);
  exams.forEach((e) => S.setSpecialSlot(stu.key, e.slot, 10));
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
  assert.deepStrictEqual(S.state.confirmed, { roster: false, basic: false, list: false, subjects: false, timetable: false, placement: false, seats: false });
  assert.strictEqual(S.state.rooms.length, rooms, '고사실 유지');
  assert.strictEqual(JSON.stringify(S.state.times), times, '교시 시간 유지');
  assert.strictEqual(S.state.subjectCodes[code], '07', '과목코드 유지');
  assert.ok(S.state.dates.every((d) => !d), '날짜는 비움');
  await S.newExam({ keepCodes: false });
  assert.deepStrictEqual(S.state.subjectCodes, {}, '과목코드 지움');
});

// 다른 테스트가 모두 끝난 뒤에 돌린다 (전체 초기화가 공용 자료를 지우므로)
const resetTest = () => t('학년별 초기화 · 전체 초기화', () => {
  const g1 = S.newProject('초기화1'); S.importRows(rows, 'a.xlsx');
  const g2 = S.newProject('초기화2'); S.importRows(rows, 'b.xlsx');
  assert.ok(S.projectHasRows(g1) && S.projectHasRows(g2));
  // 열려 있지 않은 학년만 비우기: 다른 학년은 그대로
  S.resetProject(g1);
  assert.strictEqual(S.projectHasRows(g1), false);
  assert.strictEqual(S.projectHasRows(g2), true);
  assert.ok(S.projectJSON(g2).length > 0 && S.projectJSON(g1) === '');
  // 열려 있는 학년 비우기
  S.resetProject(g2);
  assert.strictEqual(S.state.rows.length, 0);
  // 전체 초기화: 모든 작업 공간이 비고, 이름은 남음
  S.importRows(rows, 'c.xlsx'); S.switchProject(g1); S.importRows(rows, 'd.xlsx');
  const names = S.projects().map((p) => p.name).join(',');
  S.resetEverything();
  assert.ok(S.projects().every((p) => !S.projectHasRows(p.id)));
  assert.strictEqual(S.projects().map((p) => p.name).join(','), names);
});

const resetKeepTest = () => t('초기화: 위탁학생·별도 고사실 학생 남기기 / 모두', () => {
  const rows3 = C.parseNeis(window.Sample.sampleAoa(3)).rows;
  S.openGrade(3); S.importRows(rows3, 'k.xlsx');
  const g3 = S.currentProject().id;
  const [a, b] = S.rosterStudents();
  S.setSpecialStudent(a.key, 1);
  S.setIndustry(b, true);
  assert.strictEqual(S.projectSpecialCount(g3), 1);
  // 남기고 초기화 → 자료는 비지만 지정은 남고, 다시 불러오면 그대로
  S.resetProject(g3, { keep: true });
  assert.strictEqual(S.state.rows.length, 0);
  assert.strictEqual(S.projectSpecialCount(g3), 1);
  assert.ok(S.industryList().length >= 1);
  S.importRows(rows3, 'k2.xlsx');
  assert.ok(S.state.special.students[a.key]);
  assert.strictEqual(S.isIndustry(b), true);
  // 모두 초기화 → 별도 고사실 지정·위탁학생 명단까지 지움
  S.resetProject(g3);
  assert.strictEqual(S.projectSpecialCount(g3), 0);
  assert.strictEqual(S.industryList().length, 0);
  // 전체 초기화 keep
  S.importRows(rows3, 'k3.xlsx'); S.setSpecialStudent(a.key, 2); S.setIndustry(b, true);
  S.resetEverything({ keep: true });
  assert.strictEqual(S.projectSpecialCount(g3), 1);
  assert.strictEqual(S.industryList().length, 1);
  S.resetEverything();
  assert.strictEqual(S.projectSpecialCount(g3), 0);
  assert.strictEqual(S.industryList().length, 0);
  // 저장 폴더 이름: 금지 글자 제거
  S.setSaveFolder('고사/작업:파일');
  assert.strictEqual(S.saveFolder(), '고사작업파일');
});

const basicConfirmTest = () => t('기초정보·과목현황 확정은 따로 · 편성현황 확정 취소하면 같이 풀림', () => {
  S.newProject('기초확정'); S.importRows(rows, 'b.xlsx'); S.confirmRoster();
  assert.strictEqual(S.state.confirmed.basic, false, '편성현황만 확정하면 기초정보는 미확정');
  assert.strictEqual(S.state.confirmed.list, false, '과목현황도 미확정');
  assert.deepStrictEqual(S.confirmBasic(), []);
  assert.strictEqual(S.state.confirmed.basic, true);
  S.confirmList(); assert.strictEqual(S.state.confirmed.list, true);
  S.unconfirmRoster();
  assert.strictEqual(S.state.confirmed.basic, false); assert.strictEqual(S.state.confirmed.list, false);
  // 날짜가 비면 확정 안 됨
  S.confirmRoster(); S.setDate(0, ''); S.state.dates.fill('');
  assert.ok(S.confirmBasic().some((x) => /시행 일자/.test(x)));
  // 예전 데이터(평가과목까지 확정, basic 없음)는 기초정보·과목현황도 확정으로 읽힘
  const old = JSON.parse(S.exportJSON()); delete old.confirmed.basic; delete old.confirmed.list; old.confirmed.subjects = true;
  S.importJSON(JSON.stringify(old));
  assert.strictEqual(S.state.confirmed.basic, true); assert.strictEqual(S.state.confirmed.list, true);
});

const gapFixTest = () => t('고사장 띄우기 고정: 초기화·다시 불러오기 뒤에도 같은 교실 뒤가 띄워짐', () => {
  const rows3 = C.parseNeis(window.Sample.sampleAoa(3)).rows;
  S.openGrade(3); S.importRows(rows3, 'g.xlsx'); S.confirmRoster();
  const name = S.state.rooms[2].name;
  S.toggleRoomGap(2); S.setGapFix(true);
  assert.deepStrictEqual(S.gapFixed(3), [name]);
  S.resetProject(S.currentProject().id);
  assert.deepStrictEqual(S.state.roomGaps, []);
  S.importRows(rows3, 'g2.xlsx'); S.confirmRoster();
  assert.strictEqual(S.state.rooms[S.state.roomGaps[0]].name, name, '같은 교실 뒤가 다시 띄워짐');
  // 고정 중에 띄우기를 바꾸면 고정도 따라 바뀜
  S.toggleRoomGap(4);
  assert.strictEqual(S.gapFixed(3).length, 2);
  S.setGapFix(false); assert.strictEqual(S.gapFixed(3), null);
  S.resetProject(S.currentProject().id);
});

const allFileTest = () => t('모든 학년 한 파일: 저장 → 다른 PC(빈 상태)에서 불러오기', () => {
  const rows3 = C.parseNeis(window.Sample.sampleAoa(3)).rows;
  S.openGrade(1); S.importRows(rows, 'a1.xlsx'); S.confirmRoster();
  S.openGrade(3); S.importRows(rows3, 'a3.xlsx'); S.setIndustry(S.rosterStudents()[0], true);
  S.setSchool('시험고등학교');
  const text = S.exportAll();
  assert.ok(S.isAllFile(text));
  const n1 = S.state.rows.length;
  // 다른 PC처럼 모두 비운 뒤 불러오기
  S.resetEverything(); S.setSchool('');
  const names = S.importAll(text);
  assert.ok(names.includes('1학년') && names.includes('3학년'), names.join(','));
  assert.strictEqual(S.school(), '시험고등학교');
  S.openGrade(3); assert.strictEqual(S.state.rows.length, n1);
  assert.ok(S.industryList().length >= 1);
  S.openGrade(1); assert.strictEqual(S.state.confirmed.roster, true);
  assert.strictEqual(S.isAllFile(S.exportJSON()), false, '한 학년 파일은 모든 학년 파일이 아님');
  S.resetEverything();
});

const industryTest = () => t('위탁학생: 3학년에서만 · 표시 기억 · 연락 확인', () => {
  const rows3 = C.parseNeis(window.Sample.sampleAoa(3)).rows;
  // 1학년 작업에서는 기능이 꺼짐
  S.newProject('1학년위탁'); S.importRows(rows, 'g1.xlsx');
  assert.strictEqual(S.industryEnabled(), false);
  S.setIndustry(S.rosterStudents()[0], true);
  assert.strictEqual(S.isIndustry(S.rosterStudents()[0]), false);
  S.setIndustry(S.rosterStudents()[0], false);
  S.newProject('산업'); S.importRows(rows3, 'i.xlsx');
  assert.strictEqual(S.industryEnabled(), true);
  const x = S.rosterStudents()[0];
  S.setIndustry(x, true);
  assert.ok(S.isIndustry(x));
  // 다른 작업 공간에서 같은 학생 자료를 다시 불러와도 학번·이름으로 다시 표시됨
  S.newProject('산업2'); S.importRows(rows3, 'j.xlsx');
  assert.ok(S.isIndustry(S.rosterStudents().find((y) => y.key === x.key)));
  // 같은 학번이라도 이름이 다르면 표시하지 않음
  assert.strictEqual(S.isIndustry({ ...x, name: x.name + '다름' }), false);
  S.confirmRoster(); S.setAllEval(true); S.confirmSubjects();
  const ind = S.industryStudents();
  assert.strictEqual(ind.length, 1);
  assert.strictEqual(S.industryUncontacted().length, 1);
  S.setIndustryContact(ind[0].key, true);
  assert.strictEqual(S.industryUncontacted().length, 0);
  S.setIndustry(x, false);
  assert.strictEqual(S.industryStudents().length, 0);
});

const cellLockTest = () => t('학생 배치 칸 잠금: 자동 배치·인원 맞추기·비우기에도 그대로', () => {
  S.newProject('칸잠금'); S.importRows(rows, 'k.xlsx');
  S.confirmRoster(); S.setAllEval(true); S.confirmSubjects();
  S.state.dates[0] = S.state.dates[0] || '2026-10-12';
  S.ttAuto(false); S.confirmTimetable();
  S.autoPlaceAll(true);
  const slot = S.slots().find((x) => x.subjects.length && S.cells(x.key).filter(Boolean).length >= 2);
  assert.ok(slot, '배치된 교시가 있어야 함');
  const cells0 = S.cells(slot.key);
  const i = cells0.findIndex((v) => v);
  // 잠긴 칸을 일부러 다른 값으로 바꾼 뒤 잠근다
  const other = cells0.findIndex((v, k) => k !== i && v);
  S.swapCells(slot.key, i, other);
  const want = S.cells(slot.key)[i];
  assert.strictEqual(S.toggleCellLock(slot.key, i), true);
  S.autoPlaceAll(true);
  assert.strictEqual(S.cells(slot.key)[i], want, '전체 다시 자동 배치 뒤에도 그대로');
  S.autoPlace(slot, false);
  assert.strictEqual(S.cells(slot.key)[i], want, '교시 자동 배치 뒤에도 그대로');
  S.rebalance(slot.key);
  assert.strictEqual(S.cells(slot.key)[i], want, '인원 맞추기 뒤에도 그대로');
  S.clearSlot(slot.key);
  assert.strictEqual(S.cells(slot.key)[i], want, '비우기 뒤에도 그대로');
  assert.strictEqual(S.cells(slot.key).filter(Boolean).length, 1, '잠기지 않은 칸은 비워짐');
  // 잠긴 칸은 맞바꿀 수 없음
  const j = S.cells(slot.key).findIndex((v, k) => k !== i);
  S.swapCells(slot.key, i, j);
  assert.strictEqual(S.cells(slot.key)[i], want);
  assert.strictEqual(S.toggleCellLock(slot.key, i), false);
});

Promise.all(pending).then(() => { resetTest(); industryTest(); cellLockTest(); resetKeepTest(); basicConfirmTest(); gapFixTest(); allFileTest(); console.log(`\n${pass}개 테스트 통과`); }).catch((e) => { console.error(e); process.exit(1); });
