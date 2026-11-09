/*
 * 고사 시간표·고사실 배치 핵심 알고리즘
 * 원본: 「1학기 기말고사 프로그램(1학년).xlsm」의 VBA 매크로 및 시트 수식
 * DOM에 의존하지 않는 순수 함수만 두어 브라우저와 Node(검증 스크립트) 모두에서 사용한다.
 */
(function (root) {
  'use strict';

  const DAYS = 5;          // 최대 고사 일수
  const PERIODS = 5;       // 하루 최대 교시
  const SLOTS = 4;         // 한 교시에 동시에 칠 수 있는 최대 과목 수
  const MAX_EXAMS = 18;    // 배치 가능한 최대 시험 회차(일차×교시)
  const MAX_COMBOS = 1000; // 동시 시험 가능 조합 탐색 상한
  const WAIT_PREFIX = '대기 - ';
  const VOID_CELL = '빈 교실'; // 일부러 비워 두는 교실 (시험실 옆 완충). 자동 배치가 채우지 않는다

  const coll = new Intl.Collator('ko', { numeric: true });
  const cmp = (a, b) => coll.compare(String(a ?? ''), String(b ?? ''));
  const val = (s) => { const m = String(s ?? '').match(/^\s*(\d+)/); return m ? Number(m[1]) : 0; };
  const studentKey = (ban, num) => `${ban}${num}`;
  const slotKey = (d, p) => `${d}_${p}`;
  const parseSlotKey = (k) => k.split('_').map(Number);
  /** 과목명에서 단위수 괄호 제거: "공통국어1(4)" → "공통국어1" */
  const onlySubject = (s) => { s = String(s ?? ''); const p = s.lastIndexOf('('); return p > 0 ? s.slice(0, p) : s; };
  /** "7차일반 3" 같은 접두어 제거 (GetRoomName) */
  const roomLabel = (r) => String(r ?? '').replace('7차일반 ', '');

  // ---------------------------------------------------------------- 1. 나이스 학생편성현황 가져오기
  const DATA_COLS = ['학년도', '학기', '학년', '편제명', '과목', '강의실', '계열', '반', '번호', '성명'];

  /**
   * 시트의 2차원 배열(aoa)에서 나이스 학생편성현황 데이터를 추출 (BringDataFile)
   * - '학년도'와 '성명'이 같은 행에 있고 열 간격이 9, '개설강의실' 셀이 존재해야 한다.
   * - 성명이 비었거나 '(미재학)'이 포함된 행은 삭제한다.
   * - 10반 이상이 있으면 한 자리 반을 '01반' 형식으로 맞춘다.
   */
  function parseNeis(aoa) {
    let r1 = null, r2 = null, hasRoom = false;
    for (let r = 0; r < aoa.length; r++) {
      const row = aoa[r] || [];
      for (let c = 0; c < row.length; c++) {
        const v = String(row[c] ?? '').trim();
        if (v === '학년도' && !r1) r1 = { r, c };
        if (v === '성명' && !r2) r2 = { r, c };
        if (v === '개설강의실') hasRoom = true;
      }
    }
    if (!r1 || !r2 || !hasRoom || r1.r !== r2.r || r2.c - r1.c !== 9) {
      return { error: '나이스 학생편성현황 파일이 아닙니다. (학년도~성명 머리글, 개설강의실 항목 확인)' };
    }
    const rows = []; let removed = 0;
    for (let r = r1.r + 1; r < aoa.length; r++) {
      const src = aoa[r] || [];
      const rec = {};
      DATA_COLS.forEach((k, i) => { const v = src[r1.c + i]; rec[k] = v == null ? '' : String(v).trim(); });
      if (DATA_COLS.every((k) => rec[k] === '')) continue;
      if (rec.학년도 === '학년도' || rec.성명 === '성명') continue; // 반복된 머리글 행
      if (rec.성명 === '' || rec.성명.includes('(미재학)')) { removed++; continue; }
      rec.번호 = Number(rec.번호) || rec.번호;
      rec.강의실2 = rec.강의실; // 원래 강의실 (편의반 이동 전)
      rows.push(rec);
    }
    if (rows.some((x) => x.반 === '10반' || x.반 === '11반')) {
      rows.forEach((x) => { if (/^\d반$/.test(x.반)) x.반 = '0' + x.반; });
    }
    return { rows, removed };
  }

  // ---------------------------------------------------------------- 2. 학생편성현황 확정 → 과목/과목반/고사실 (InitBaseData)
  function buildBase(rows, useOriginalRoom) {
    const subjOrder = new Map();  // 과목 → 연번
    const subjCount = new Map();  // 과목 → 학생수(행 수)
    const sc = new Map();         // 과목|강의실 → {subject, room, stuCount}
    for (const x of rows) {
      const room = useOriginalRoom ? x.강의실2 : x.강의실;
      if (!subjOrder.has(x.과목)) subjOrder.set(x.과목, subjOrder.size + 1);
      subjCount.set(x.과목, (subjCount.get(x.과목) || 0) + 1);
      const k = x.과목 + '\u0001' + room;
      if (!sc.has(k)) sc.set(k, { subject: x.과목, room, stuCount: 0 });
      sc.get(k).stuCount++;
    }
    const subjectClasses = [...sc.values()]
      .map((v) => ({ ...v, order: subjOrder.get(v.subject) }))
      .sort((a, b) => a.order - b.order || cmp(a.room, b.room));
    const subjects = [...subjOrder.keys()].map((s) => ({
      name: s,
      banCount: subjectClasses.filter((c) => c.subject === s).length,
      stuCount: subjCount.get(s),
      evaluate: false,
    }));
    return { subjects, subjectClasses };
  }

  /** 반별 고사실 기본값 (InitBaseData 의 '고사실 정보') */
  function buildRooms(rows) {
    const grade = val(rows[0]?.학년) || '';
    const bans = new Map(); // 반 → Set(학생)
    for (const x of rows) {
      const ban = /위탁/.test(x.반) ? '위탁학생' : x.반;
      if (!bans.has(ban)) bans.set(ban, new Set());
      bans.get(ban).add(studentKey(x.반, x.번호));
    }
    const rooms = [...bans.entries()].map(([ban, set]) => {
      const n = set.size;
      let name = '';
      if (/편의/.test(ban)) name = `${grade}-편의`;
      else if (ban !== '위탁학생') name = `${grade}-${val(ban)}`;
      return { ban, stuCount: n, maxClass: n, name, cap: name ? n : 0 };
    });
    rooms.sort((a, b) => cmp(a.ban, b.ban));
    for (let i = 1; i <= 3; i++) rooms.push({ ban: '', stuCount: 0, maxClass: 0, name: `별도실${i}`, cap: 30 });
    return rooms;
  }

  /**
   * 편성 데이터의 학반으로 고사실 목록을 다시 만든다. 기존에 고친 고사실명·수용인원,
   * 별도실, 직접 추가한 학반은 그대로 둔다. → { rooms, added[], removed[] }
   */
  function mergeRooms(rows, oldRooms) {
    if (!oldRooms || !oldRooms.length) return { rooms: buildRooms(rows), added: [], removed: [] };
    const fresh = buildRooms(rows).filter((r) => r.ban); // 데이터의 학반(위탁·편의 포함)
    const byBan = new Map(oldRooms.filter((r) => r.ban).map((r) => [r.ban, r]));
    const freshBans = new Set(fresh.map((r) => r.ban));
    const added = [], removed = [];
    const classes = fresh.map((r) => {
      const o = byBan.get(r.ban);
      if (!o) { added.push(r.ban); return r; }
      return { ...r, name: o.name, cap: o.cap };
    });
    // 직접 추가한 학반(데이터에 없음)은 유지, 예전 데이터에만 있던 학반은 제거
    const manual = oldRooms.filter((r) => r.ban && !freshBans.has(r.ban) && r.manual);
    oldRooms.filter((r) => r.ban && !freshBans.has(r.ban) && !r.manual).forEach((r) => removed.push(r.ban));
    const others = oldRooms.filter((r) => !r.ban); // 별도실 등
    const list = [...classes, ...manual].sort((a, b) => cmp(a.ban, b.ban));
    return { rooms: [...list, ...others], added, removed };
  }

  /** 고사실로 쓸 수 있는 행인지 (고사실명이 있어야 함) */
  const isRoomUsable = (r) => !!(r && String(r.name ?? '').trim() !== '' && String(r.name) !== '0');
  /** 1반~마지막 학반 교실 (반명이 'N반'인 고사실. 별도실·편의반·위탁·공동교육과정반 제외) */
  const isClassRoom = (r) => isRoomUsable(r) && /^\s*\d+\s*반\s*$/.test(String(r.ban ?? ''));
  /** 별도실: 최대수업인원이 없고 수용인원이 있는 고사실 (InitDicExtraRoom) */
  const isExtraRoom = (r) => isRoomUsable(r) && !(Number(r.maxClass) > 0) && Number(r.cap) > 0;

  // ---------------------------------------------------------------- 3. 평가과목 / 학생별 평가과목
  /** 평가 대상 학생 목록 (InitStudentTable): 평가과목을 하나 이상 가진 학생, 반·번호 순 */
  function buildStudents(rows, evalSubjects) {
    const ev = new Set(evalSubjects);
    const map = new Map();
    for (const x of rows) {
      if (!ev.has(x.과목)) continue;
      const k = studentKey(x.반, x.번호);
      if (!map.has(k)) map.set(k, { key: k, grade: val(x.학년), ban: x.반, num: Number(x.번호) || 0, name: x.성명, subjects: [] });
      const s = map.get(k);
      if (!s.subjects.includes(x.과목)) s.subjects.push(x.과목);
    }
    return [...map.values()].sort((a, b) => cmp(a.ban, b.ban) || a.num - b.num);
  }

  /** 과목 → 응시 학생 key 집합 */
  function subjectStudentSets(rows, subjects) {
    const want = new Set(subjects);
    const m = new Map(subjects.map((s) => [s, new Set()]));
    for (const x of rows) if (want.has(x.과목)) m.get(x.과목).add(studentKey(x.반, x.번호));
    return m;
  }

  const disjoint = (a, b) => { const [s, l] = a.size < b.size ? [a, b] : [b, a]; for (const k of s) if (l.has(k)) return false; return true; };

  /** 동시에 시험 가능한가: 어떤 학생도 두 과목을 동시에 듣지 않음 (CanSameTime) */
  function canSameTime(subjects, sets) {
    const list = [...new Set(subjects.filter(Boolean))].map((s) => sets.get(s)).filter(Boolean);
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (!disjoint(list[i], list[j])) return false;
    return true;
  }

  /** 동시 시험 가능 과목 조합 (FindSameTimeSubject): 4과목 → 3과목 → 2과목 순, 최대 1000개 */
  function findSameTimeCombos(evalList, sets, totalStudents) {
    const names = evalList.map((s) => s.name);
    const n = names.length, out = [];
    const ok = (idx) => { for (let a = 0; a < idx.length; a++) for (let b = a + 1; b < idx.length; b++) if (!disjoint(sets.get(names[idx[a]]), sets.get(names[idx[b]]))) return false; return true; };
    let overflow = false;
    const push = (idx) => { if (out.length >= MAX_COMBOS) { overflow = true; return false; } out.push(idx.map((i) => names[i])); return true; };
    outer: for (const k of [4, 3, 2]) {
      const idx = [];
      const rec = (start) => {
        if (idx.length === k) { if (ok(idx) && !push(idx)) return false; return true; }
        for (let i = start; i < n; i++) {
          idx.push(i);
          // 가지치기: 지금까지 고른 과목끼리 겹치면 더 볼 필요 없음
          if (ok(idx) && !rec(i + 1)) return false;
          idx.pop();
        }
        return true;
      };
      if (!rec(0)) break outer;
    }
    const info = new Map(evalList.map((s) => [s.name, s]));
    const combos = out.map((c) => {
      const banCount = c.reduce((t, s) => t + (info.get(s).banCount || 0), 0);
      const stuCount = c.reduce((t, s) => t + (info.get(s).stuCount || 0), 0);
      return { subjects: c, banCount, stuCount, waitCount: totalStudents - stuCount };
    });
    return { combos, overflow };
  }

  // ---------------------------------------------------------------- 4. 고사 시간표
  /** timetable: { 'd_p': [과목, 과목, ...] } */
  const ttCell = (tt, d, p) => (tt[slotKey(d, p)] || []).filter(Boolean);

  function timetableSubjects(tt) {
    const out = [];
    for (let d = 1; d <= DAYS; d++) for (let p = 1; p <= PERIODS; p++) out.push(...ttCell(tt, d, p));
    return out;
  }

  /** 미편성 과목 (RemainSubjects) */
  function remainingSubjects(evalNames, tt) {
    const used = new Set(timetableSubjects(tt));
    return evalNames.filter((s) => !used.has(s));
  }

  /** 중복 편성 과목 (ExistSameSubject) */
  function duplicateSubjects(tt) {
    const seen = new Set(), dup = new Set();
    for (const s of timetableSubjects(tt)) { if (seen.has(s)) dup.add(s); seen.add(s); }
    return [...dup];
  }

  /** 선택한 칸에 추가로 편성 가능한 미편성 과목 (CanSubjects) */
  function candidateSubjects(evalNames, tt, d, p, sets) {
    const remain = remainingSubjects(evalNames, tt);
    const here = ttCell(tt, d, p);
    if (here.length === 0) return remain;
    return remain.filter((s) => canSameTime([...here, s], sets));
  }

  /** 일차별 응시 과목 수 분포 (StuCount): 0~5과목을 보는 학생 수 */
  function dayDistribution(students, tt, d) {
    const subs = new Set();
    for (let p = 1; p <= PERIODS; p++) ttCell(tt, d, p).forEach((s) => subs.add(s));
    const dist = [0, 0, 0, 0, 0, 0];
    const byCount = [[], [], [], [], [], []];
    let error = false;
    for (const st of students) {
      const mine = st.subjects.filter((s) => subs.has(s));
      if (mine.length > 5) { error = true; continue; }
      dist[mine.length]++;
      byCount[mine.length].push({ student: st, subjects: mine });
    }
    return { dist, byCount, error };
  }

  /** 교시별 상태 메시지 (6.시간표작성 '상태' 행) */
  function cellStatus(tt, d, p, sets, dates, times) {
    const subs = ttCell(tt, d, p);
    if (subs.length === 0) return { ok: true, msg: '' };
    if (!String(times[slotKey(d, p)] ?? '').trim()) return { ok: false, msg: '오류: 고사 시간 누락 (기초정보 확인)' };
    if (!dates[d - 1]) return { ok: false, msg: '오류: 고사 일자 누락 (기초정보 확인)' };
    return canSameTime(subs, sets) ? { ok: true, msg: '정상' } : { ok: false, msg: '오류: 동시 시험 불가' };
  }

  /**
   * 고사시간표 자동 편성 (원본에 없는 기능)
   * - 이미 편성된 과목은 그대로 두고 미편성 과목만 빈 칸(시간·일자가 있는 교시)에 넣는다.
   * - 한 교시에는 수강생이 겹치지 않는 과목만 최대 4과목.
   * - 목표: 학생 한 명이 하루에 보는 시험 수를 고르게(제곱합 최소), 하루 상한(perDay) 초과 최소화,
   *         빈 교시가 넉넉하면 과목을 따로 편성하고, 모자라면 동시 시험 가능 과목끼리 묶는다.
   * - 무작위 순서로 여러 번 시도해 가장 좋은 결과를 고른다.
   * avail: 편성 가능한 [{d,p}] 목록, subjects: [{name, stuCount}]
   */
  function autoTimetable(subjects, students, sets, ttIn, avail, opt = {}) {
    const tries = opt.tries || 300, rnd = opt.rnd || Math.random;
    const days = [...new Set(avail.map((a) => a.d))];
    const studentIdx = new Map(students.map((s, i) => [s.key, i]));
    const subStu = new Map(subjects.map((s) => [s.name, [...(sets.get(s.name) || [])].map((k) => studentIdx.get(k)).filter((i) => i != null)]));
    const maxSubj = Math.max(1, ...students.map((s) => s.subjects.length));
    const perDay = opt.perDay || Math.max(1, Math.ceil(maxSubj / Math.max(1, days.length)));
    const placedNames = new Set(timetableSubjects(ttIn));
    const todo = subjects.filter((s) => !placedNames.has(s.name));
    const slotKeys = avail.map((a) => slotKey(a.d, a.p));
    // 두 과목을 같은 교시에 볼 수 있는가 (미리 계산)
    const names = [...new Set([...subjects.map((s) => s.name), ...placedNames])];
    const compat = new Map(names.map((a) => [a, new Set(names.filter((b) => a !== b && sets.get(a) && sets.get(b) && disjoint(sets.get(a), sets.get(b))))]));

    function evaluate(tt) {
      const load = students.map(() => ({}));
      for (const k of Object.keys(tt)) {
        const d = parseSlotKey(k)[0];
        for (const s of tt[k]) for (const i of subStu.get(s) || []) load[i][d] = (load[i][d] || 0) + 1;
      }
      let cost = 0, over = 0, worst = 0;
      for (const l of load) for (const n of Object.values(l)) { cost += n * n; if (n > perDay) { over++; cost += 40 * (n - perDay); } worst = Math.max(worst, n); }
      return { cost, over, worst };
    }

    let best = null;
    for (let t = 0; t < tries; t++) {
      const tt = {}; for (const [k, v] of Object.entries(ttIn)) tt[k] = v.filter(Boolean).slice();
      const load = students.map(() => ({}));
      const dayCount = {};
      for (const k of Object.keys(tt)) {
        const d = parseSlotKey(k)[0];
        for (const s of tt[k]) { dayCount[d] = (dayCount[d] || 0) + 1; for (const i of subStu.get(s) || []) load[i][d] = (load[i][d] || 0) + 1; }
      }
      // 큰 과목부터, 비슷한 크기 안에서는 무작위
      const order = todo.slice().sort((a, b) => (b.stuCount - a.stuCount) + (rnd() - 0.5) * (t ? b.stuCount * 0.6 : 0));
      const unplaced = [];
      order.forEach((sub, idx) => {
        const studs = subStu.get(sub.name) || [];
        const free = slotKeys.filter((k) => !(tt[k] || []).length).length;
        const remaining = order.length - idx;
        let pick = null, pickCost = Infinity;
        for (const k of slotKeys) {
          const cur = tt[k] || [];
          if (cur.length >= SLOTS || !cur.every((x) => compat.get(sub.name).has(x))) continue;
          const d = parseSlotKey(k)[0];
          let c = 0;
          for (const i of studs) { const n = load[i][d] || 0; c += 2 * n + 1; if (n + 1 > perDay) c += 40; if (n + 1 > 5) c += 1e6; }
          c += 3 * (dayCount[d] || 0);                                  // 일차별 과목 수 균형
          if (cur.length) c += free >= remaining ? 8 : -8;              // 빈 칸이 넉넉하면 따로, 모자라면 묶기
          c += rnd() * 2;                                               // 동점 무작위
          if (c < pickCost) { pickCost = c; pick = k; }
        }
        if (!pick) { unplaced.push(sub.name); return; }
        tt[pick] = [...(tt[pick] || []), sub.name];
        const d = parseSlotKey(pick)[0];
        dayCount[d] = (dayCount[d] || 0) + 1;
        for (const i of studs) load[i][d] = (load[i][d] || 0) + 1;
      });
      const ev = evaluate(tt);
      const score = unplaced.length * 1e7 + ev.cost;
      if (!best || score < best.score) best = { score, tt, unplaced, ...ev };
    }
    return { timetable: best.tt, unplaced: best.unplaced, perDay, over: best.over, worst: best.worst };
  }

  /** 시간표 확정 가능 여부 (CompleteTimeTable) */
  function validateTimetable(evalNames, tt, sets, dates, times) {
    const errors = [];
    const dup = duplicateSubjects(tt);
    if (dup.length) errors.push('중복으로 편성된 과목이 있습니다: ' + dup.join(', '));
    for (let d = 1; d <= DAYS; d++) for (let p = 1; p <= PERIODS; p++) {
      const st = cellStatus(tt, d, p, sets, dates, times);
      if (!st.ok) errors.push(`${d}일차 ${p}교시 – ${st.msg}`);
    }
    const remain = remainingSubjects(evalNames, tt);
    if (remain.length) errors.push('미편성 과목이 있습니다: ' + remain.join(', '));
    if (examSlots(tt).length > MAX_EXAMS) errors.push(`시험 회차는 최대 ${MAX_EXAMS}개까지 가능합니다.`);
    return errors;
  }

  // ---------------------------------------------------------------- 5. 학생 배치
  /** 과목반 사전: '과목-n반' → {subject, room, stuCount} (InitDicSubjectRoom) */
  function subjectBanMap(subjectClasses) {
    const m = new Map(); const idx = new Map();
    for (const c of subjectClasses) {
      const i = (idx.get(c.subject) || 0) + 1; idx.set(c.subject, i);
      m.set(`${c.subject}-${i}반`, { ...c, key: `${c.subject}-${i}반`, index: i });
    }
    return m;
  }

  /** 시험 회차 목록 (InitBaeChiData): 일차 → 교시 순 */
  function examSlots(tt) {
    const out = [];
    for (let d = 1; d <= DAYS; d++) for (let p = 1; p <= PERIODS; p++) {
      const subs = ttCell(tt, d, p);
      if (subs.length) out.push({ key: slotKey(d, p), day: d, period: p, subjects: subs, title: `${d}일차 ${p}교시` });
    }
    return out;
  }

  /**
   * 자습 교시: 그날 마지막 시험 교시보다 앞인데 시험이 없는 교시 (예: 2·3교시만 시험이면 1교시)
   * 학생 전원이 자습(미응시)하므로 학생 배치·출력물에 함께 넣는다. 그날 시험이 끝난 뒤 교시는 넣지 않음
   */
  function studySlots(tt) {
    const out = [];
    for (let d = 1; d <= DAYS; d++) {
      const ps = []; for (let p = 1; p <= PERIODS; p++) if (ttCell(tt, d, p).length) ps.push(p);
      if (!ps.length) continue;
      for (let p = 1; p < Math.max(...ps); p++) if (!ttCell(tt, d, p).length) out.push({ key: slotKey(d, p), day: d, period: p, subjects: [], title: `${d}일차 ${p}교시`, study: true });
    }
    return out;
  }
  /** 학생 배치 회차 = 시험 회차 + 자습 교시 (일차 → 교시 순) */
  const placeSlots = (tt) => [...examSlots(tt), ...studySlots(tt)].sort((a, b) => a.day - b.day || a.period - b.period);

  /** 회차별 반수·응시·미응시 인원 및 반별 미응시 인원 (BaechInfoData, DicWaitStudent) */
  function slotInfo(slot, students, subjectClasses) {
    const subs = new Set(slot.subjects);
    const banCounts = slot.subjects.map((s) => subjectClasses.filter((c) => c.subject === s).length);
    let exam = 0; const waitByBan = {};
    const homeCount = {}; // 과목 → 반 → 응시 학생 수 (학반별 고사장용)
    for (const st of students) {
      const mine = st.subjects.filter((s) => subs.has(s));
      if (mine.length) exam++;
      else waitByBan[st.ban] = (waitByBan[st.ban] || 0) + 1;
      for (const s of mine) { (homeCount[s] = homeCount[s] || {})[st.ban] = (homeCount[s][st.ban] || 0) + 1; }
    }
    const wait = students.length - exam;
    return { banCounts, banTotal: banCounts.reduce((a, b) => a + b, 0), exam, wait, waitByBan, homeCount };
  }

  /** placement 셀 파싱: '과목-1반'(분반) | '과목@3반'(학반별 고사장) | '대기 - 30명' | '빈 교실' | '' */
  const HOME_SEP = '@';
  const MORE_SUFFIX = '#추가';
  function parseCell(v) {
    v = String(v ?? '');
    if (!v) return { type: 'empty' };
    if (v === VOID_CELL) return { type: 'void' };
    if (v.startsWith(WAIT_PREFIX)) return { type: 'wait', count: Number(v.slice(WAIT_PREFIX.length).replace('명', '')) || 0 };
    if (v.endsWith(MORE_SUFFIX)) return { type: 'more', subject: v.slice(0, -MORE_SUFFIX.length) };
    const at = v.lastIndexOf(HOME_SEP);
    if (at > 0) return { type: 'home', subject: v.slice(0, at), ban: v.slice(at + 1) };
    return { type: 'exam', key: v };
  }
  const waitCell = (n) => `${WAIT_PREFIX}${n}명`;
  /** 학반별 고사장: 이 교실 = 그 반의 해당 과목 응시생 전원 (수강 분반과 무관) */
  const homeCell = (subject, ban) => `${subject}${HOME_SEP}${ban}`;
  const homeSize = (info, subject, ban) => (info.homeCount[subject] || {})[ban] || 0;
  /** 추가 고사장: 처음엔 비어 있고, 같은 과목 시험실의 정원 초과 학생이 옮겨 온다 */
  const moreCell = (subject) => `${subject}${MORE_SUFFIX}`;

  /**
   * 회차의 배치 현황과 상태 (7.학생배치 '계/배치/미배치' 및 오류 체크)
   * counts: 고사실별 실제 인원(학생 이동 반영). 주면 수용인원 검사에 사용
   */
  function slotPlacementStatus(slot, cells, info, sbMap, rooms, counts) {
    let bans = 0, exam = 0, wait = 0; const problems = [], warnings = [];
    const seen = new Set(), sectionSubj = new Set(), homeSubj = new Set();
    let needBans = 0;
    cells.forEach((v, i) => {
      const c = parseCell(v);
      if (c.type === 'empty' || c.type === 'void') return;
      const room = rooms[i];
      if (!isRoomUsable(room)) problems.push(`${i + 1}번째 열: 고사실명이 없습니다.`);
      let n = 0;
      if (c.type === 'wait') { wait += c.count; n = c.count; }
      else if (c.type === 'more') {
        if (!slot.subjects.includes(c.subject)) problems.push(`${onlySubject(c.subject)} 추가 고사장: 이 교시의 시험 과목이 아닙니다.`);
        n = 0;
      } else if (c.type === 'home') {
        if (!slot.subjects.includes(c.subject)) problems.push(`${c.subject}: 이 교시의 시험 과목이 아닙니다.`);
        const k = homeCell(c.subject, c.ban);
        if (seen.has(k)) problems.push(`${onlySubject(c.subject)} ${c.ban}: 중복 배치되었습니다.`);
        seen.add(k); homeSubj.add(c.subject);
        n = homeSize(info, c.subject, c.ban);
        if (!n) problems.push(`${onlySubject(c.subject)} ${c.ban}: 이 반에는 응시생이 없습니다.`);
        bans++; exam += n;
      } else {
        const sb = sbMap.get(c.key);
        if (!sb) { problems.push(`${c.key}: 존재하지 않는 과목-반`); return; }
        if (!slot.subjects.includes(sb.subject)) problems.push(`${c.key}: 이 교시의 시험 과목이 아닙니다.`);
        if (seen.has(c.key)) problems.push(`${c.key}: 중복 배치되었습니다.`);
        seen.add(c.key); sectionSubj.add(sb.subject);
        bans++; exam += sb.stuCount; n = sb.stuCount;
      }
      if (counts && counts[i] != null) n = counts[i];
      if (room && Number(room.cap) > 0 && n > Number(room.cap)) warnings.push(`${room.name}: 최대 수용인원(${room.cap}명)을 초과하였습니다. (${n}명)`);
    });
    for (const s of homeSubj) if (sectionSubj.has(s)) problems.push(`${onlySubject(s)}: 분반 배치와 학반별 배치를 함께 쓸 수 없습니다.`);
    // 배치해야 할 칸 수: 학반별로 배치한 과목은 응시생이 있는 반 수, 나머지는 분반 수
    slot.subjects.forEach((s, k) => { needBans += homeSubj.has(s) ? Object.keys(info.homeCount[s] || {}).length : info.banCounts[k]; });
    const remainExam = info.exam - exam, remainWait = info.wait - wait;
    let status = 'OK';
    if (remainExam < 0) status = '응시초과';
    else if (remainExam > 0) status = '응시미배치';
    else if (remainWait > 0) status = '미응시미배치';
    else if (remainWait < 0) status = '미응시초과';
    return { bans, exam, wait, remainBans: needBans - bans, remainExam, remainWait, status, problems, warnings };
  }

  const STATUS_TEXT = {
    OK: '배치 완료',
    응시초과: '응시 인원을 초과하여 배치하였습니다.',
    응시미배치: '응시 인원을 배치하세요.',
    미응시미배치: '대기(미응시) 인원을 배치하세요.',
    미응시초과: '대기(미응시) 인원을 초과하여 배치하였습니다.',
  };

  /** 강의실 이름에서 학반 번호 추정: '4(1학년 4반)' → 4, '7차일반 3' → 3 */
  function classNoOfRoom(room) {
    room = String(room ?? '');
    let m = room.match(/7차일반\s*(\d+)/); if (m) return Number(m[1]);
    m = room.match(/(\d+)\s*반\)?\s*$/); if (m) return Number(m[1]);
    m = room.match(/^\s*(\d+)\s*\(/); if (m) return Number(m[1]);
    return 0;
  }

  /** 배치되지 않은 과목-반 (배치 목록 LTime 의 앞부분) */
  function unplacedBans(slot, cells, sbMap) {
    const parsed = cells.map(parseCell);
    const used = new Set(parsed.filter((c) => c.type === 'exam').map((c) => c.key));
    const homeSubj = new Set(parsed.filter((c) => c.type === 'home').map((c) => c.subject));
    const out = [];
    for (const s of slot.subjects) { if (homeSubj.has(s)) continue; for (const sb of sbMap.values()) if (sb.subject === s && !used.has(sb.key)) out.push(sb); }
    return out;
  }
  /** 학반별 배치 중인 과목에서 아직 고사실이 없는 반: [{subject, ban, count}] */
  function unplacedHomes(slot, cells, info) {
    const parsed = cells.map(parseCell);
    const done = new Set(parsed.filter((c) => c.type === 'home').map((c) => homeCell(c.subject, c.ban)));
    const subs = new Set(parsed.filter((c) => c.type === 'home').map((c) => c.subject));
    const out = [];
    for (const s of slot.subjects) if (subs.has(s)) for (const [ban, count] of Object.entries(info.homeCount[s] || {})) if (!done.has(homeCell(s, ban))) out.push({ subject: s, ban, count });
    return out.sort((a, b) => cmp(a.ban, b.ban));
  }

  /**
   * 한 회차 자동 배치 (FAutoBaechi.CAutoBaechi_Click)
   * 1) 별도실 모드: 시험 반을 별도실에 먼저 배치하고, 학반 교실은 각 반의 미응시 인원만큼 '대기(자습)'
   * 2) 일반 모드: 과목-반을 해당 학반 교실(강의실 번호 = 반 번호)에 우선 배치한 뒤
   *    남은 과목-반 → 빈 고사실 순서대로, 남은 미응시 인원 → 고사실 최대 수용인원까지 대기실로 배치
   */
  function autoPlaceSlot(slot, cellsIn, ctx, useExtra, mode = 'class') {
    // 자습 교시: 학생마다 자기 반 교실에서 자습
    if (!slot.subjects.length) {
      if (cellsIn.some(Boolean)) return fitWaits(cellsIn, ctx.rooms, ctx.info).cells;
      const cells = ctx.rooms.map((r) => { const n = isClassRoom(r) ? ctx.info.waitByBan[r.ban] || 0 : 0; return n ? waitCell(Math.min(n, Number(r.cap) || n)) : ''; });
      return fitWaits(cells, ctx.rooms, ctx.info).cells;
    }
    // 이미 있는 대기실의 빈자리를 먼저 채운 뒤(새 교실은 열지 않음) 자동 배치, 마지막에 자습 인원 합계를 맞춤
    const pre = cellsIn.some((v) => parseCell(v).type === 'wait') ? fitWaits(cellsIn, ctx.rooms, ctx.info, false).cells : cellsIn;
    return fitWaits(autoPlaceBy(slot, pre, ctx, useExtra, mode), ctx.rooms, ctx.info).cells;
  }
  function autoPlaceBy(slot, cellsIn, ctx, useExtra, mode) {
    if (mode === 'original') return autoPlaceOriginal(slot, cellsIn, ctx, useExtra);
    if (mode === 'rule') return autoPlaceRule(slot, cellsIn, ctx);
    const { rooms, sbMap, info } = ctx;
    const cells = rooms.map((_, i) => cellsIn[i] || '');
    const pending = unplacedBans(slot, cells, sbMap);
    const usable = rooms.map((r, i) => (isRoomUsable(r) ? i : -1)).filter((i) => i >= 0);

    if (useExtra) {
      for (const i of usable.filter((i) => isExtraRoom(rooms[i]))) {
        if (!pending.length) break;
        if (!cells[i]) cells[i] = pending.shift().key;
      }
    } else {
      // 학반 교실 매칭
      for (let k = 0; k < pending.length; k++) {
        const no = classNoOfRoom(pending[k].room);
        if (!no) continue;
        const i = usable.find((i) => !isExtraRoom(rooms[i]) && val(rooms[i].ban) === no && !/편의|위탁/.test(rooms[i].ban));
        if (i != null && i >= 0 && !cells[i]) { cells[i] = pending[k].key; pending.splice(k, 1); k--; }
      }
    }
    const placedWait = () => cells.map(parseCell).filter((c) => c.type === 'wait').reduce((t, c) => t + c.count, 0);
    const waitOf = (i) => info.waitByBan[rooms[i].ban] || 0;
    const empty = () => usable.filter((i) => !cells[i]);

    if (useExtra) {
      for (const i of empty()) { if (pending.length) cells[i] = pending.shift().key; }
      for (const i of empty()) {
        if (isExtraRoom(rooms[i])) continue;
        if (info.wait - placedWait() < 1) break;
        if (waitOf(i) > 0) cells[i] = waitCell(waitOf(i));
      }
      return cells;
    }
    // 학반과 매칭되지 않은 과목-반: 미응시 학생이 있으면 별도실 → 미응시가 적은 교실 순(대기실로 쓸 교실을 아낌),
    // 미응시 학생이 없으면 학반 교실을 먼저 사용
    const extraFirst = info.wait > 0 ? 1 : -1;
    const order = empty().sort((a, b) => extraFirst * (isExtraRoom(rooms[b]) - isExtraRoom(rooms[a])) || (waitOf(a) - waitOf(b)) || (a - b));
    while (pending.length && order.length) {
      const sb = pending.shift();
      // 정원이 충분한 고사실을 우선 (없으면 순서대로)
      const k = Math.max(0, order.findIndex((i) => !(Number(rooms[i].cap) > 0) || Number(rooms[i].cap) >= sb.stuCount));
      cells[order[k]] = sb.key; order.splice(k, 1);
    }
    // 대기실 ①: 미응시 학생이 있는 학반 교실에 그 반 인원만큼
    for (const i of empty()) {
      const n = Math.min(waitOf(i), Number(rooms[i].cap) || waitOf(i), info.wait - placedWait());
      if (!isExtraRoom(rooms[i]) && n > 0) cells[i] = waitCell(n);
    }
    // 대기실 ②: 남은 인원은 빈 고사실에 최대 수용인원까지
    for (const i of empty()) {
      const remain = info.wait - placedWait();
      if (remain < 1) break;
      cells[i] = waitCell(Math.min(remain, Number(rooms[i].cap) || remain));
    }
    // 그래도 남으면 기존 대기실을 수용인원까지 채움
    cells.forEach((v, i) => {
      const c = parseCell(v), remain = info.wait - placedWait();
      if (c.type !== 'wait' || remain < 1) return;
      const room = Number(rooms[i].cap) - c.count;
      if (room > 0) cells[i] = waitCell(c.count + Math.min(room, remain));
    });
    return cells;
  }

  /**
   * 자습(미응시) 인원 맞추기: 대기실 인원 합계를 그 교시 자습 인원과 같게 만든다.
   * 모자라면 기존 대기실의 빈자리를 고르게(빈자리가 가장 많은 곳부터 한 명씩) 채우고,
   * 그래도 모자라면 빈 칸 교실(학반 교실 → 특별실) → '빈 교실'(완충) 순서로 대기실을 늘린다.
   * 넘치면 인원이 가장 많은 대기실부터 줄인다. → { cells, added, removed, short }
   */
  function fitWaits(cellsIn, rooms, info, grow = true) {
    const cells = rooms.map((_, i) => cellsIn[i] || '');
    const cap = (i) => Number(rooms[i].cap) || Infinity;
    const count = {};
    cells.forEach((v, i) => { const c = parseCell(v); if (c.type === 'wait') count[i] = c.count; });
    const total = () => Object.values(count).reduce((t, n) => t + n, 0);
    let added = 0, removed = 0;
    const fill = () => {
      while (total() < info.wait) {
        const i = Object.keys(count).map(Number).filter((j) => count[j] < cap(j)).sort((a, b) => (cap(b) - count[b]) - (cap(a) - count[a]) || a - b)[0];
        if (i == null) return false;
        count[i]++; added++;
      }
      return true;
    };
    if (!fill() && grow) {
      const usable = rooms.map((r, i) => (isRoomUsable(r) ? i : -1)).filter((i) => i >= 0);
      const spare = [
        ...usable.filter((i) => !cells[i] && isClassRoom(rooms[i])),
        ...usable.filter((i) => !cells[i] && !isClassRoom(rooms[i])),
        ...usable.filter((i) => cells[i] === VOID_CELL),
      ];
      for (const i of spare) { if (total() >= info.wait) break; count[i] = 0; if (fill()) break; }
    }
    while (total() > info.wait) {
      const i = Object.keys(count).map(Number).sort((a, b) => count[b] - count[a] || b - a)[0];
      count[i]--; removed++;
    }
    // 0명이 된 칸: 원래 '빈 교실'이면 그대로 두고, 대기실이었으면 비운다
    for (const [i, n] of Object.entries(count)) cells[i] = n > 0 ? waitCell(n) : cells[i] === VOID_CELL ? VOID_CELL : '';
    return { cells, added, removed, short: Math.max(0, info.wait - total()) };
  }

  /**
   * 원본 엑셀과 같은 자동 배치 (CAutoBaechi_Click 그대로)
   * '7차일반 N' 강의실만 N번째 고사실에 넣고, 나머지는 고사실 순서대로 과목-반 → 대기(수용인원까지)
   */
  function autoPlaceOriginal(slot, cellsIn, ctx, useExtra) {
    const { rooms, sbMap, info } = ctx;
    const cells = rooms.map((_, i) => cellsIn[i] || '');
    const pending = () => unplacedBans(slot, cells, sbMap);
    const usable = rooms.map((r, i) => (isRoomUsable(r) ? i : -1)).filter((i) => i >= 0);
    if (useExtra) {
      for (const i of usable.filter((i) => isExtraRoom(rooms[i]))) { const p = pending(); if (!p.length) break; cells[i] = p[0].key; }
    } else {
      for (const sb of pending()) {
        const m = String(sb.room).match(/7차일반\s*(\d+)/);
        const i = m ? Number(m[1]) - 1 : -1;
        if (i >= 0 && i < rooms.length && !cells[i]) cells[i] = sb.key;
      }
    }
    const placedWait = () => cells.map(parseCell).filter((c) => c.type === 'wait').reduce((t, c) => t + c.count, 0);
    for (const i of usable) {
      if (cells[i]) continue;
      const p = pending();
      if (p.length) { cells[i] = p[0].key; continue; }
      const remain = info.wait - placedWait();
      if (remain < 1) break;
      const cap = Number(rooms[i].cap) || remain;
      if (useExtra) { const n = info.waitByBan[rooms[i].ban]; if (n) cells[i] = waitCell(n); }
      else if (remain < cap) { cells[i] = waitCell(remain); break; }
      else cells[i] = waitCell(cap);
    }
    return cells;
  }

  /**
   * 학교 규칙 자동 배치
   * ① 전체 학생이 응시: 과목-반을 각 반 자기 교실에 (학반 매칭, 나머지는 순서대로)
   * ② 1개 반만 응시: 인원이 맞는 특별실(별도실)에 넣고, 학생들은 각자 교실에서 자습
   * ③ 2~3개 반: 앞 교실부터 시험실, 바로 다음 교실은 '빈 교실'(완충), 그 뒤 교실부터 자습실
   * ④ 4개 반 이상: 뒤 교실(마지막 반)부터 시험실, 그 앞 교실은 '빈 교실', 앞 교실부터 자습실
   * 자습 인원이 학반 교실에 다 들어가지 않으면 특별실, 그래도 모자라면 완충 교실도 사용
   */
  const RULE_BACK_FROM = 4; // 이 분반 수부터 뒤 교실에 배치
  /** 두 고사실 사이에 '띄워진 공간'이 있는가. gaps: 고사실 번호 i(= i번째와 그다음 고사실 사이) 목록 */
  function roomsApart(gaps, a, b) {
    if (!gaps || !gaps.length) return false;
    const lo = Math.min(a, b), hi = Math.max(a, b);
    return gaps.some((g) => g >= lo && g < hi);
  }
  /** 회차에 응시하는 학생이 있는 반 → 1 */
  const students1 = (info) => { const o = {}; for (const m of Object.values(info.homeCount)) for (const b of Object.keys(m)) o[b] = 1; return o; };
  function autoPlaceRule(slot, cellsIn, ctx) {
    const { rooms, sbMap, info } = ctx;
    const cells = rooms.map((_, i) => cellsIn[i] || '');
    const pending = unplacedBans(slot, cells, sbMap);
    const usable = rooms.map((r, i) => (isRoomUsable(r) ? i : -1)).filter((i) => i >= 0);
    const classIdx = usable.filter((i) => isClassRoom(rooms[i]));          // 1반~마지막 반 교실 (순서대로)
    // 특별실(별도실)을 먼저, 그다음 반명이 있는 기타 교실(공동교육과정반 등)
    const extraIdx = usable.filter((i) => !isClassRoom(rooms[i])).sort((a, b) => (!!rooms[a].ban - !!rooms[b].ban) || a - b);
    const free = (i) => !cells[i];
    const cap = (i) => Number(rooms[i].cap) || 0;
    const placedWait = () => cells.map(parseCell).filter((c) => c.type === 'wait').reduce((t, c) => t + c.count, 0);
    const remainWait = () => info.wait - placedWait();
    const putWait = (i, n) => { n = Math.min(n, remainWait(), cap(i) || n); if (n > 0) cells[i] = waitCell(n); };
    const fillWaits = (order) => { for (const i of order) { if (remainWait() < 1) break; if (free(i)) putWait(i, remainWait()); } };
    const n = pending.length + cells.map(parseCell).filter((c) => c.type === 'exam').length;

    // 시험 분반이 모두 학반 수업이면(강의실 번호 = 반) 각자 자기 교실에서 시험·자습
    const homeOf = (sb) => { const no = classNoOfRoom(sb.room); return no ? classIdx.find((j) => free(j) && val(rooms[j].ban) === no) : undefined; };
    if (pending.length && pending.every((sb) => homeOf(sb) != null) && new Set(pending.map(homeOf)).size === pending.length) {
      pending.forEach((sb) => { cells[homeOf(sb)] = sb.key; });
      for (const i of classIdx) if (free(i)) putWait(i, info.waitByBan[rooms[i].ban] || 0);
      fillWaits([...classIdx, ...extraIdx]);
      return cells;
    }

    // ①-1 전체 학생이 응시하는데 나이스 분반이 여러 반 학생이 섞인 경우 → 학반별 고사장 (각 반 학생은 자기 교실)
    if (info.wait === 0 && pending.length && !cells.some(Boolean)) {
      const bans = Object.keys(students1(info));
      const oneSubject = bans.every((b) => slot.subjects.filter((s) => homeSize(info, s, b) > 0).length === 1);
      const roomOf = (b) => usable.find((i) => rooms[i].ban === b);
      const convenience = pending.some((sb) => /편의/.test(sb.room));
      if (oneSubject && !convenience && bans.every((b) => roomOf(b) != null)) {
        for (const b of bans) { const subj = slot.subjects.find((s) => homeSize(info, s, b) > 0); cells[roomOf(b)] = homeCell(subj, b); }
        return cells;
      }
    }

    if (info.wait === 0 || !classIdx.length) {
      // ① 모두 응시: 자기 교실 우선, 남은 분반은 남은 교실 순서대로
      for (let k = 0; k < pending.length; k++) {
        const no = classNoOfRoom(pending[k].room);
        const i = classIdx.find((j) => free(j) && val(rooms[j].ban) === no);
        if (no && i != null) { cells[i] = pending[k].key; pending.splice(k--, 1); }
      }
      for (const i of [...classIdx, ...extraIdx]) { if (!pending.length) break; if (free(i)) cells[i] = pending.shift().key; }
      fillWaits([...classIdx, ...extraIdx]);
      return cells;
    }

    if (n === 1 && pending.length === 1) {
      // ② 한 개 반: 인원에 맞는 가장 작은 특별실, 학생들은 각자 교실에서 자습
      const sb = pending[0];
      const fit = extraIdx.filter((i) => free(i) && cap(i) >= sb.stuCount).sort((a, b) => cap(a) - cap(b))[0];
      const any = extraIdx.filter(free).sort((a, b) => cap(b) - cap(a))[0];
      const room = fit != null ? fit : any;
      if (room != null) {
        cells[room] = sb.key; pending.shift();
        for (const i of classIdx) if (free(i)) putWait(i, info.waitByBan[rooms[i].ban] || 0);
        fillWaits([...classIdx, ...extraIdx]);
        return cells;
      }
    }

    // ③·④ 앞(또는 뒤) 교실 묶음에 시험실 + 완충 빈 교실
    const back = n >= RULE_BACK_FROM;
    const order = back ? classIdx.slice().reverse() : classIdx.slice();
    // 교실 정원보다 큰 분반은 맞는 특별실로 먼저 (가장 작은 것부터)
    const blockCap = Math.max(0, ...order.filter(free).slice(0, pending.length).map(cap));
    for (const sb of pending.slice().sort((a, b) => b.stuCount - a.stuCount)) {
      if (sb.stuCount <= blockCap) continue;
      const fit = extraIdx.filter((i) => free(i) && cap(i) >= sb.stuCount).sort((a, b) => cap(a) - cap(b))[0];
      if (fit != null) { cells[fit] = sb.key; pending.splice(pending.indexOf(sb), 1); }
    }
    const examRooms = [];
    for (const i of order) { if (examRooms.length >= pending.length) break; if (free(i)) examRooms.push(i); }
    // 큰 분반을 큰 교실에 (같은 크기면 분반 순서대로)
    const bigFirst = pending.slice(0, examRooms.length).map((sb, k) => ({ sb, k })).sort((a, b) => b.sb.stuCount - a.sb.stuCount || a.k - b.k);
    const roomsByCap = examRooms.slice().sort((a, b) => cap(b) - cap(a) || a - b);
    bigFirst.forEach(({ sb }, k) => { cells[roomsByCap[k]] = sb.key; });
    pending.splice(0, examRooms.length);
    for (const i of extraIdx) { if (!pending.length) break; if (free(i)) cells[i] = pending.shift().key; } // 교실이 모자라면 특별실
    // 완충: 시험실 묶음 바로 옆(자습실 쪽) 교실 하나를 비움
    // 단, 그 사이에 '띄워진 공간'(복도·계단 등)이 있으면 이미 떨어져 있으므로 비우지 않는다
    let buffer;
    if (examRooms.length) {
      const edge = back ? Math.min(...examRooms) : Math.max(...examRooms);
      buffer = classIdx[classIdx.indexOf(edge) + (back ? -1 : 1)];
      if (buffer != null && roomsApart(ctx.gaps, edge, buffer)) buffer = undefined;
      if (buffer != null && free(buffer)) cells[buffer] = VOID_CELL; else buffer = undefined;
    }
    // 자습실: 남은 학반 교실(시험실 반대쪽) → 특별실 → 그래도 모자라면 완충 교실
    fillWaits(classIdx);
    fillWaits(extraIdx);
    if (remainWait() > 0 && buffer != null) { cells[buffer] = ''; putWait(buffer, remainWait()); }
    return cells;
  }

  /** 별도실 모드를 제안할 수 있는가: 필요한 고사실 수 ≤ 별도실 수 */
  function canUseExtra(info, rooms) {
    const n = rooms.filter(isExtraRoom).length;
    return n > 0 && info.banTotal <= n;
  }

  /** 과목+강의실 → 학생 (InitDicSubjectStu, 편의반 반영된 강의실 기준), 과목+반 → 학생 (학반별 고사장) */
  function studentIndex(rows) {
    const bySection = new Map(), byHome = new Map();
    for (const x of rows) {
      const s = { grade: val(x.학년), ban: x.반, num: Number(x.번호) || 0, name: x.성명, room: x.강의실 };
      const k1 = x.과목 + '\u0001' + x.강의실, k2 = x.과목 + '\u0001' + x.반;
      if (!bySection.has(k1)) bySection.set(k1, []);
      bySection.get(k1).push(s);
      if (!byHome.has(k2)) byHome.set(k2, []);
      byHome.get(k2).push(s);
    }
    return { bySection, byHome };
  }

  /**
   * 한 회차의 고사실별 학생 명단 → { rooms: Map(고사실 index → {kind, subject, list}), errors, notices }
   * moves: { studentKey: 고사실 index } 학생 강제 이동 (같은 과목 시험실끼리, 자습실끼리만 유효)
   */
  function slotRoster(ctx, slot, cells, moves) {
    const { rooms, sbMap, students, idx, waitMode } = ctx;
    const original = waitMode === 'original';
    const errors = [], notices = [];
    const roomStudents = new Map();
    const waitRooms = [];
    cells.forEach((v, i) => {
      const c = parseCell(v);
      if (c.type === 'exam') {
        const sb = sbMap.get(c.key);
        if (!sb) return;
        const list = (idx.bySection.get(sb.subject + '\u0001' + sb.room) || []).map((s) => ({ ...s, subject: sb.subject }));
        if (!original) list.sort((a, b) => cmp(a.ban, b.ban) || a.num - b.num); // 원본은 편성현황 파일 순서
        if (list.length !== sb.stuCount) errors.push(`${slot.title} ${c.key}: 학생수 오류`);
        roomStudents.set(i, { kind: 'exam', subject: sb.subject, list });
      } else if (c.type === 'home') {
        const list = (idx.byHome.get(c.subject + '\u0001' + c.ban) || []).map((s) => ({ ...s, subject: c.subject })).sort((a, b) => a.num - b.num);
        roomStudents.set(i, { kind: 'exam', subject: c.subject, list });
      } else if (c.type === 'more') {
        roomStudents.set(i, { kind: 'exam', subject: c.subject, list: [], more: true });
      } else if (c.type === 'wait') {
        waitRooms.push({ i, count: c.count, ban: rooms[i].ban, list: [] });
      }
    });
    // 대기 학생
    const subs = new Set(slot.subjects);
    let pool = students.filter((s) => !s.subjects.some((x) => subs.has(x)));
    if (original) {
      // 원본: 고사실 순서대로 같은 반 학생을 넣고, 남는 자리는 명단 앞쪽 학생으로 채운다
      for (const w of waitRooms) {
        let own = Math.min(pool.filter((s) => s.ban === w.ban).length, w.count), other = w.count - own;
        const take = new Set();
        for (const s of pool) {
          if (own < 1 && other < 1) break;
          if (s.ban === w.ban) { if (own > 0) { take.add(s.key); own--; } }
          else if (other > 0) { take.add(s.key); other--; }
        }
        w.list = pool.filter((s) => take.has(s.key));
        pool = pool.filter((s) => !take.has(s.key));
        const moved = [...new Set(w.list.filter((s) => s.ban !== w.ban).map((s) => s.ban))];
        if (moved.length) notices.push(`${slot.title} ${rooms[w.i].name}: 다른 반 대기 인원 ${w.list.filter((s) => s.ban !== w.ban).length}명 배치 (${moved.join(', ')})`);
      }
    } else {
      for (const w of waitRooms) {
        const own = pool.filter((s) => s.ban === w.ban).slice(0, w.count);
        w.list.push(...own);
        const ids = new Set(own.map((s) => s.key));
        pool = pool.filter((s) => !ids.has(s.key));
      }
      for (const w of waitRooms) {
        const need = w.count - w.list.length;
        if (need > 0) {
          const take = pool.slice(0, need);
          const moved = new Set(take.map((s) => s.ban));
          w.list.push(...take); pool = pool.slice(need);
          if (take.length) notices.push(`${slot.title} ${rooms[w.i].name}: 다른 반 대기 인원 ${take.length}명 배치 (${[...moved].join(', ')})`);
        }
      }
    }
    for (const w of waitRooms) roomStudents.set(w.i, { kind: 'wait', subject: '미응시', list: w.list.map((s) => ({ grade: s.grade, ban: s.ban, num: s.num, name: s.name, room: '', subject: '미응시' })) });
    if (pool.length) errors.push(`${slot.title}: 대기실에 배치되지 않은 인원 ${pool.length}명`);

    // 학생 강제 이동
    let movedCount = 0;
    for (const [key, to] of Object.entries(moves || {})) {
      const target = roomStudents.get(+to);
      if (!target) continue;
      for (const [i, r] of roomStudents) {
        const k = r.list.findIndex((s) => studentKey(s.ban, s.num) === key);
        if (k < 0) continue;
        if (i === +to) break;
        const s = r.list[k];
        const ok = target.kind === r.kind && (r.kind === 'wait' || target.subject === s.subject);
        if (ok) { r.list.splice(k, 1); target.list.push({ ...s, moved: true }); movedCount++; }
        break;
      }
    }
    if (movedCount) for (const r of roomStudents.values()) r.list.sort((a, b) => cmp(a.ban, b.ban) || a.num - b.num);
    return { rooms: roomStudents, errors, notices, movedCount };
  }

  /**
   * 정원 맞추기: 최대 수용인원을 넘는 고사실의 학생을 같은 과목 시험실(자습실은 다른 자습실) 중
   * 빈자리가 가장 많은 곳으로 옮긴다. 옮길 학생은 받는 교실의 반 학생을 먼저, 없으면 명단 뒤쪽부터.
   * → { moves: {학생key: 고사실 index}, moved, unresolved: [{i, over}] }
   */
  function balanceMoves(ctx, slot, cells) {
    const { rooms } = ctx;
    const base = slotRoster(ctx, slot, cells, {});
    const cap = (i) => Number(rooms[i].cap) || Infinity;
    const groups = new Map(); // 같은 과목 시험실끼리, 자습실끼리
    for (const [i, r] of base.rooms) {
      const g = r.kind === 'wait' ? 'wait' : 'exam:' + r.subject;
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push({ i, list: r.list.slice() });
    }
    const moves = {}, unresolved = [];
    let moved = 0;
    for (const list of groups.values()) {
      for (;;) {
        const over = list.filter((x) => x.list.length > cap(x.i)).sort((a, b) => (b.list.length - cap(b.i)) - (a.list.length - cap(a.i)))[0];
        if (!over) break;
        const to = list.filter((x) => x !== over && x.list.length < cap(x.i)).sort((a, b) => (cap(b.i) - b.list.length) - (cap(a.i) - a.list.length) || a.i - b.i)[0];
        if (!to) { unresolved.push({ i: over.i, over: over.list.length - cap(over.i) }); break; }
        // 받는 교실의 반 학생을 우선, 없으면 명단 뒤쪽 학생
        let k = -1;
        for (let j = over.list.length - 1; j >= 0; j--) if (over.list[j].ban === rooms[to.i].ban) { k = j; break; }
        if (k < 0) k = over.list.length - 1;
        const [s] = over.list.splice(k, 1);
        to.list.push(s);
        moves[studentKey(s.ban, s.num)] = to.i;
        moved++;
      }
    }
    return { moves, moved, unresolved };
  }

  /**
   * 배치 확정 전 엄격 검사: 조금이라도 문제가 있으면 목록으로 돌려준다 (학생 이동 반영한 실제 인원 기준)
   * → [{ slot: 회차 key, title, i: 고사실 index(교시 전체 문제는 null), msg }]
   */
  function placementIssues(state, students, waitMode = 'class') {
    const rooms = state.rooms;
    const sbMap = subjectBanMap(state.subjectClasses);
    const ctx = { rooms, sbMap, students, idx: studentIndex(state.rows), waitMode };
    const out = [];
    const names = new Set();
    rooms.forEach((r, i) => { if (isRoomUsable(r)) { if (names.has(r.name)) out.push({ slot: null, title: '고사실', i, msg: `고사실명 중복: ${r.name}` }); names.add(r.name); } });
    for (const slot of placeSlots(state.timetable)) {
      const cells = (state.placement[slot.key] || []).slice();
      const info = slotInfo(slot, students, state.subjectClasses);
      const ros = slotRoster(ctx, slot, cells, (state.moves || {})[slot.key]);
      const counts = cells.map((_, i) => (ros.rooms.get(i) ? ros.rooms.get(i).list.length : null));
      const st = slotPlacementStatus(slot, cells, info, sbMap, rooms, counts);
      const add = (i, msg) => out.push({ slot: slot.key, title: slot.title, i, msg });
      st.problems.forEach((m) => add(null, m));
      if (st.status !== 'OK') add(null, `${STATUS_TEXT[st.status]} (응시 ${st.remainExam > 0 ? `${st.remainExam}명 미배치` : st.remainExam < 0 ? `${-st.remainExam}명 초과` : '완료'}, 자습 ${st.remainWait > 0 ? `${st.remainWait}명 미배치` : st.remainWait < 0 ? `${-st.remainWait}명 초과` : '완료'})`);
      ros.errors.forEach((m) => add(null, m.replace(`${slot.title} `, '').replace(`${slot.title}: `, '')));
      cells.forEach((v, i) => {
        const c = parseCell(v), n = counts[i], cap = Number(rooms[i] && rooms[i].cap) || 0;
        if (c.type === 'empty' || c.type === 'void') return;
        if (cap && n != null && n > cap) add(i, `${rooms[i].name}: 최대 수용인원 ${cap}명을 ${n - cap}명 초과 (${n}명)`);
        if (c.type === 'more' && !n) add(i, `${rooms[i].name}: 비어 있는 추가 고사장 (학생 0명) — 지우거나 빈 교실로 바꾸세요`);
        if ((c.type === 'exam' || c.type === 'home') && n === 0) add(i, `${rooms[i].name}: 시험실에 학생이 없습니다`);
      });
    }
    return out;
  }

  /**
   * 학생 배치 확정 → 응시현황 생성 (CompleteBachi)
   * 대기실: 같은 반 학생을 그 반 교실에 우선 배치하고, 남는 인원은 빈 자리가 있는 대기실에 순서대로 배치
   */
  function buildSeating(state, students, waitMode = 'class', only = null) {
    const rooms = state.rooms;
    const sbMap = subjectBanMap(state.subjectClasses);
    const slots = placeSlots(state.timetable).filter((x) => !only || only.has(x.key));
    const errors = [], notices = [];
    const names = new Set();
    rooms.forEach((r) => { if (isRoomUsable(r)) { if (names.has(r.name)) errors.push(`고사실명 중복: ${r.name}`); names.add(r.name); } });
    if (errors.length) return { errors };
    const ctx = { rooms, sbMap, students, idx: studentIndex(state.rows), waitMode };
    const out = [];
    for (const slot of slots) {
      const cells = state.placement[slot.key] || [];
      const info = slotInfo(slot, students, state.subjectClasses);
      const st = slotPlacementStatus(slot, cells, info, sbMap, rooms);
      if (st.problems.length) { errors.push(`${slot.title}: ${st.problems[0]}`); continue; }
      if (st.status !== 'OK') { errors.push(`${slot.title}: ${STATUS_TEXT[st.status]}`); continue; }
      const r = slotRoster(ctx, slot, cells, (state.moves || {})[slot.key]);
      errors.push(...r.errors); notices.push(...r.notices);
      const dd = `${slot.day}일차`, tt = `${slot.period}교시`;
      [...r.rooms.keys()].sort((a, b) => a - b).forEach((i) => {
        r.rooms.get(i).list.forEach((s, n) => out.push({
          day: dd, period: tt, room: rooms[i].name, roomIndex: i, subject: s.subject,
          grade: s.grade, ban: s.ban, num: s.num, name: s.name, classRoom: s.room,
          order: n + 1, seat: null, slot: slot.key,
        }));
      });
    }
    return { errors, notices, seating: out };
  }

  // ---------------------------------------------------------------- 6. 응시현황(좌석번호)
  const seatGroupKey = (r) => `${r.day}${r.period}${r.room}${r.subject}`;

  function assignSeatsInOrder(seating) { seating.forEach((r) => { r.seat = r.order; }); return seating; }

  /** 좌석번호 랜덤 (RandSeat): 고사실별로 섞되 대기실(미응시)은 학번순 유지 */
  function assignSeatsRandom(seating, rnd = Math.random) {
    const groups = new Map();
    seating.forEach((r) => { const k = seatGroupKey(r); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
    for (const list of groups.values()) {
      const seats = list.map((r) => r.order);
      if (list[0].subject !== '미응시') {
        for (let i = seats.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [seats[i], seats[j]] = [seats[j], seats[i]]; }
      }
      list.forEach((r, i) => { r.seat = seats[i]; });
    }
    return seating;
  }

  /** 응시현황 확정 전 검사 (HasErrorSeat) */
  function validateSeating(seating, students, slots, rooms) {
    const errors = [];
    const names = new Set(rooms.filter(isRoomUsable).map((r) => r.name));
    const idx = new Map(seating.map((r) => [`${studentKey(r.ban, r.num)}|${r.slot}`, r]));
    for (const st of students) {
      let cnt = 0;
      for (const sl of slots) {
        const r = idx.get(`${st.key}|${sl.key}`);
        if (!r) { errors.push(`${st.ban} ${st.num}번 ${st.name}: ${sl.title} 배치 누락`); continue; }
        if (r.subject !== '미응시') { if (!st.subjects.includes(r.subject)) errors.push(`${st.ban} ${st.num}번: ${r.subject} 배치 과목 이상`); else cnt++; }
        if (!names.has(r.room)) errors.push(`${st.ban} ${st.num}번: 고사실명 이상 (${r.room})`);
        if (!(Number(r.seat) > 0)) errors.push(`${st.ban} ${st.num}번 ${sl.title}: 좌석번호 없음`);
      }
      if (cnt !== st.subjects.length) errors.push(`${st.ban} ${st.num}번 ${st.name}: 배치되지 않은 과목이 있습니다.`);
      if (errors.length > 30) break;
    }
    return errors;
  }

  // ---------------------------------------------------------------- 7. 출력물용 계산
  /** '09:00 ~ 9:50' → '50분' (GetForTime) */
  function minutesOf(t) {
    const m = String(t ?? '').replace(/\s/g, '').match(/^(\d{1,2}):(\d{2})~(\d{1,2}):(\d{2})$/);
    if (!m) return 'XX분';
    const a = +m[1] * 60 + +m[2], b = +m[3] * 60 + +m[4];
    return (b - a) + '분';
  }
  const studentNo = (grade, ban, num) => `${grade}${String(val(ban)).padStart(2, '0')}${String(num).padStart(2, '0')}`;

  /**
   * 좌석 배치도: 위쪽이 앞(교탁). 왼쪽 위가 1번이고, 아래로 차례대로 채운 뒤 오른쪽 열로 넘어감
   * grid[r][c] — r=0 이 맨 앞(교탁 쪽), c=0 이 맨 왼쪽
   */
  /**
   * 좌석 격자: 1번은 왼쪽 앞. order 'col' = 세로(한 열)로 먼저 채움, 'row' = 가로(앞줄)로 먼저 채움
   * fixedRows > 0 이면 줄 수를 고정 (열 × 줄 이 인원보다 적으면 오류)
   */
  function seatGrid(count, cols, order = 'col', fixedRows = 0) {
    cols = Math.max(1, cols | 0);
    const rows = fixedRows > 0 ? fixedRows | 0 : Math.ceil(count / cols);
    if (fixedRows > 0 && rows * cols < count) return { error: `책상이 모자랍니다. ${cols}열 × ${rows}줄 = ${rows * cols}석, 인원 ${count}명 — 열이나 줄을 늘리세요.` };
    if (rows > (fixedRows > 0 ? 12 : 8)) return { error: `한 열에 ${fixedRows > 0 ? 12 : 8}명을 넘을 수 없습니다. 열의 수를 늘리세요. (현재 ${cols}열, ${count}명)` };
    const grid = [];
    for (let r = 0; r < rows; r++) {
      const line = [];
      for (let c = 0; c < cols; c++) {
        const seat = order === 'row' ? r * cols + c + 1 : c * rows + r + 1;
        line.push(seat <= count ? seat : 0);
      }
      grid.push(line);
    }
    return { rows, cols, grid };
  }

  // ---------------------------------------------------------------- 고사 일자: 휴일을 건너뛴 자동 지정
  /** 관공서 공휴일(대체·임시공휴일 포함). 2026년부터 노동절·제헌절 포함 */
  const KR_HOLIDAYS = {
    2025: '01-01 01-27 01-28 01-29 01-30 03-01 03-03 05-05 05-06 06-03 06-06 08-15 10-03 10-05 10-06 10-07 10-08 10-09 12-25',
    2026: '01-01 02-16 02-17 02-18 03-01 03-02 05-01 05-05 05-24 05-25 06-03 06-06 07-17 08-15 08-17 09-24 09-25 09-26 10-03 10-05 10-09 12-25',
    2027: '01-01 02-06 02-07 02-08 02-09 03-01 05-01 05-03 05-05 05-13 06-06 07-17 07-19 08-15 08-16 09-14 09-15 09-16 10-03 10-04 10-09 10-11 12-25 12-27',
    2028: '01-01 01-26 01-27 01-28 03-01 04-12 05-01 05-02 05-05 06-06 07-17 08-15 10-02 10-03 10-04 10-05 10-09 12-25',
  };
  /** 표에 없는 해는 양력 고정 공휴일만 (설·추석 등 음력 공휴일은 '추가 휴일'로 입력) */
  const FIXED_HOLIDAYS = '01-01 03-01 05-01 05-05 06-06 07-17 08-15 10-03 10-09 12-25';
  const hasHolidayTable = (year) => !!KR_HOLIDAYS[year];
  const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dateOf = (iso) => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  /** 쉬는 날인가: 주말 / 공휴일 / 추가 휴일. 이유 문자열 또는 '' */
  function holidayReason(iso, extra = []) {
    const d = dateOf(iso); if (!d) return '';
    if (extra.includes(iso)) return '추가 휴일';
    if (d.getDay() === 0) return '일요일';
    if (d.getDay() === 6) return '토요일';
    const md = iso.slice(5);
    const list = KR_HOLIDAYS[d.getFullYear()] || FIXED_HOLIDAYS;
    return list.split(' ').includes(md) ? '공휴일' : '';
  }
  /** start 다음 날부터 쉬는 날을 건너뛰어 n일을 고른다 */
  function nextSchoolDays(start, n, extra = []) {
    const d = dateOf(start); if (!d) return [];
    const out = [];
    for (let guard = 0; out.length < n && guard < 60; guard++) {
      d.setDate(d.getDate() + 1);
      const iso = isoOf(d);
      if (!holidayReason(iso, extra)) out.push(iso);
    }
    return out;
  }

  // ---------------------------------------------------------------- 8. 기존 엑셀 프로그램(.xlsm) 작업 가져오기
  const PROGRAM_SHEETS = ['1.편성현황', '2.기초정보', '4.평가과목', '6.시간표작성', '7.학생배치', '8.응시현황'];
  const COLS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const colName = (n) => (n > 26 ? COLS[Math.floor((n - 1) / 26) - 1] : '') + COLS[(n - 1) % 26];
  /** 엑셀 날짜(일련번호/Date/문자열) → 'YYYY-MM-DD' */
  function toISODate(v) {
    if (v == null || v === '') return '';
    let d;
    if (v instanceof Date) d = v;
    else if (typeof v === 'number') d = new Date(Math.round((v - 25569) * 864e5));
    else { const m = String(v).match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/); return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : ''; }
    const y = v instanceof Date ? d.getFullYear() : d.getUTCFullYear(), mo = (v instanceof Date ? d.getMonth() : d.getUTCMonth()) + 1, da = v instanceof Date ? d.getDate() : d.getUTCDate();
    return `${y}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`;
  }
  const isProgramWorkbook = (sheetNames) => PROGRAM_SHEETS.every((s) => sheetNames.includes(s));

  /**
   * 원본 프로그램 파일의 입력값을 읽는다. get(시트명, 'B7') → 셀 값
   * 반환: 편성 데이터, 일자·시간, 고사실, 평가 대상, 시간표, 배치, 좌석, 각 단계 확정 여부
   */
  function readProgram(get) {
    const s = (v) => (v == null ? '' : String(v).trim());
    const rows = [];
    for (let r = 7; r < 20000; r++) {
      const name = s(get('1.편성현황', `K${r}`)), subj = s(get('1.편성현황', `F${r}`));
      if (!name && !subj) { if (!s(get('1.편성현황', `K${r + 1}`))) break; continue; }
      const room = s(get('1.편성현황', `G${r}`));
      rows.push({ 학년도: s(get('1.편성현황', `B${r}`)), 학기: s(get('1.편성현황', `C${r}`)), 학년: s(get('1.편성현황', `D${r}`)), 편제명: s(get('1.편성현황', `E${r}`)), 과목: subj, 강의실: room,
        계열: s(get('1.편성현황', `H${r}`)), 반: s(get('1.편성현황', `I${r}`)), 번호: Number(get('1.편성현황', `J${r}`)) || 0, 성명: name, 강의실2: s(get('1.편성현황', `L${r}`)) || room });
    }
    const dates = [10, 11, 12, 13, 14].map((r) => toISODate(get('2.기초정보', `C${r}`)));
    const times = {};
    for (let r = 5; r <= 29; r++) {
      const d = val(get('2.기초정보', `F${r}`)), p = val(get('2.기초정보', `G${r}`)), t = s(get('2.기초정보', `H${r}`));
      if (d && p && t) times[slotKey(d, p)] = t;
    }
    const rooms = [];
    for (let r = 5; r <= 19; r++) {
      const ban = s(get('2.기초정보', `J${r}`));
      if (ban === '계') break;
      rooms.push({ ban, stuCount: Number(get('2.기초정보', `K${r}`)) || 0, maxClass: Number(get('2.기초정보', `L${r}`)) || 0, name: s(get('2.기초정보', `M${r}`)), cap: Number(get('2.기초정보', `N${r}`)) || 0 });
    }
    while (rooms.length && !rooms[rooms.length - 1].ban && !rooms[rooms.length - 1].name) rooms.pop();
    const evaluate = [];
    for (let r = 5; r < 200; r++) {
      const subj = s(get('4.평가과목', `B${r}`)); if (!subj) break;
      if (s(get('4.평가과목', `E${r}`)).toUpperCase() === 'O') evaluate.push(subj);
    }
    const timetable = {};
    for (let d = 0; d < DAYS; d++) for (let p = 0; p < PERIODS; p++) {
      const v = [0, 1, 2, 3].map((k) => s(get('6.시간표작성', `${colName(6 + d * 4 + k)}${6 + p * 3}`))).filter(Boolean);
      if (v.length) timetable[slotKey(d + 1, p + 1)] = v;
    }
    const placement = {};
    examSlots(timetable).forEach((sl, i) => {
      if (i >= MAX_EXAMS) return;
      placement[sl.key] = rooms.map((_, j) => s(get('7.학생배치', `${colName(12 + j)}${9 + i * 3}`)));
    });
    const seats = {};
    for (let r = 5; r < 50000; r++) {
      const day = s(get('8.응시현황', `E${r}`)); if (!day) break;
      seats[[day, s(get('8.응시현황', `F${r}`)), s(get('8.응시현황', `G${r}`)), s(get('8.응시현황', `J${r}`)), Number(get('8.응시현황', `K${r}`))].join('|')] = Number(get('8.응시현황', `O${r}`)) || null;
    }
    const codes = {};
    for (let r = 5; r < 200; r++) { const subj = s(get('9-7.라벨', `B${r}`)); if (!subj) break; const c = s(get('9-7.라벨', `C${r}`)); if (c) codes[subj] = c; }
    const done = (sheet, addr) => s(get(sheet, addr)) === '확정';
    return {
      rows, dates, times, rooms, evaluate, timetable, placement, seats, subjectCodes: codes,
      title: s(get('9-1.전체', 'C2')).replace(/\s*시험시간표\s*$/, '').replace(/\s{2,}/g, ' '),
      seatCols: Number(get('9-4.좌석', 'Y4')) || 5,
      confirmed: { roster: done('1.편성현황', 'F1'), subjects: done('4.평가과목', 'G1'), timetable: done('6.시간표작성', 'D4'), placement: done('7.학생배치', 'C2'), seats: done('8.응시현황', 'B3') },
    };
  }
  const seatKey = (r) => [r.day, r.period, r.room, r.ban, r.num].join('|');

  /**
   * readProgram 결과로 웹 작업 상태를 재구성한다. 단계마다 웹의 검사를 다시 거쳐,
   * 원본에서 확정된 단계만 확정 상태로 이어받는다. → { state, report[] }
   */
  function stateFromProgram(p) {
    const report = [];
    const st = {
      rows: p.rows, dates: p.dates, times: p.times, title: p.title, seatCols: p.seatCols, subjectCodes: p.subjectCodes,
      rooms: p.rooms.length ? p.rooms : buildRooms(p.rows),
      confirmed: { roster: false, subjects: false, timetable: false, placement: false, seats: false },
      subjects: [], subjectClasses: [], evalSubjects: [], combos: [], combosOverflow: false,
      timetable: {}, placement: {}, seating: [], notices: [],
      options: { autoMode: 'original', waitMode: 'original' },
    };
    if (!p.rows.length) return { state: null, report: ['[1.편성현황]에 학생 데이터가 없습니다.'] };
    report.push(`학생편성현황 ${p.rows.length}건, 고사실 ${st.rooms.filter(isRoomUsable).length}개를 가져왔습니다.`);
    if (!(p.confirmed.roster || p.confirmed.subjects)) return { state: st, report };
    const base = buildBase(p.rows);
    const ev = new Set(p.evaluate);
    st.subjects = base.subjects.map((x) => ({ ...x, evaluate: ev.has(x.name) }));
    st.subjectClasses = base.subjectClasses;
    st.confirmed.roster = true;
    if (!p.confirmed.subjects || !ev.size) return { state: st, report };

    st.evalSubjects = st.subjects.filter((x) => x.evaluate).map((x) => x.name);
    const students = buildStudents(p.rows, st.evalSubjects);
    const sets = subjectStudentSets(p.rows, st.evalSubjects);
    const total = new Set(p.rows.map((x) => studentKey(x.반, x.번호))).size;
    const r = findSameTimeCombos(st.subjects.filter((x) => x.evaluate), sets, total);
    st.combos = r.combos; st.combosOverflow = r.overflow;
    st.confirmed.subjects = true;
    report.push(`평가과목 ${st.evalSubjects.length}과목 확정`);
    for (const [k, v] of Object.entries(p.timetable)) { const f = v.filter((x) => ev.has(x)); if (f.length) st.timetable[k] = f; }
    if (!p.confirmed.timetable) return { state: st, report };
    const ttErr = validateTimetable(st.evalSubjects, st.timetable, sets, st.dates, st.times);
    if (ttErr.length) { report.push('고사시간표는 미확정으로 가져왔습니다: ' + ttErr[0]); return { state: st, report }; }
    st.confirmed.timetable = true;
    st.placement = p.placement;
    // 원본 엑셀에 없는 자습 교시(그날 첫 시험 전 빈 교시): 각자 자기 반 교실에서 자습하도록 자동 배치
    const study = new Set(studySlots(st.timetable).map((x) => x.key));
    for (const sl of studySlots(st.timetable)) {
      const info = slotInfo(sl, students, st.subjectClasses);
      st.placement[sl.key] = autoPlaceSlot(sl, [], { rooms: st.rooms, sbMap: subjectBanMap(st.subjectClasses), info }, false, 'rule');
    }
    report.push(`고사시간표 ${examSlots(st.timetable).length}회차 확정`);
    if (!p.confirmed.placement) return { state: st, report };
    const res = buildSeating(st, students, 'original');
    if (res.errors.length) { report.push('학생 배치는 미확정으로 가져왔습니다: ' + res.errors[0]); return { state: st, report }; }
    st.seating = res.seating; st.notices = res.notices; st.confirmed.placement = true;
    let hit = 0;
    st.seating.forEach((x) => { const v = study.has(x.slot) ? x.order : p.seats[seatKey(x)]; if (v > 0) { x.seat = v; hit++; } });
    report.push(`학생 배치 확정 (${st.seating.length}건, 좌석번호 ${hit}건 이어받음)`);
    if (p.confirmed.seats && hit === st.seating.length && !validateSeating(st.seating, students, placeSlots(st.timetable), st.rooms).length) {
      st.confirmed.seats = true; report.push('응시현황 확정 — 바로 출력물을 인쇄할 수 있습니다.');
    } else if (p.confirmed.seats) report.push('응시현황은 미확정으로 가져왔습니다. 좌석번호를 확인 후 확정하세요.');
    return { state: st, report };
  }

  const api = {
    DAYS, PERIODS, SLOTS, MAX_EXAMS, WAIT_PREFIX, STATUS_TEXT,
    cmp, val, studentKey, slotKey, parseSlotKey, onlySubject, roomLabel, studentNo, minutesOf,
    parseNeis, buildBase, buildRooms, mergeRooms, isRoomUsable, isExtraRoom, isClassRoom,
    buildStudents, subjectStudentSets, canSameTime, findSameTimeCombos,
    ttCell, remainingSubjects, duplicateSubjects, candidateSubjects, dayDistribution, cellStatus, validateTimetable, autoTimetable,
    subjectBanMap, examSlots, studySlots, placeSlots, slotInfo, parseCell, waitCell, homeCell, homeSize, moreCell, VOID_CELL, slotPlacementStatus, slotRoster, studentIndex, unplacedHomes, balanceMoves, placementIssues, unplacedBans, classNoOfRoom,
    autoPlaceSlot, fitWaits, roomsApart, canUseExtra, buildSeating,
    assignSeatsInOrder, assignSeatsRandom, validateSeating, seatGrid,
    isProgramWorkbook, readProgram, stateFromProgram, seatKey, toISODate,
    holidayReason, nextSchoolDays, hasHolidayTable,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Core = api;
})(typeof window !== 'undefined' ? window : globalThis);
