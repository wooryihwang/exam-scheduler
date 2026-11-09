/* 상태 관리: 학년별 작업 공간, 단계별 확정/취소(연쇄), localStorage 저장, 파생 데이터 캐시 */
(function () {
  'use strict';
  const C = window.Core;
  const LEGACY_KEY = 'exam-web/v1';
  const INDEX_KEY = 'exam-web/projects';
  const pKey = (id) => `exam-web/p/${id}`;
  const DEFAULT_SLIP_NOTE = [
    '시험 시작 10분 전까지 고사실에 들어가 지정된 좌석에 앉습니다.',
    '휴대전화 등 전자기기는 시험 시작 전에 모두 제출합니다.',
    '고사실 옆 숫자는 좌석번호입니다. 자습 교시에는 자기 교실에서 자습합니다.',
  ].join('\n');

  const blank = () => ({
    v: 1,
    title: '',
    fileName: '',
    rows: [],
    confirmed: { roster: false, subjects: false, timetable: false, placement: false, seats: false },
    subjects: [],
    subjectClasses: [],
    rooms: [],
    dates: ['', '', '', '', ''],
    times: {},
    evalSubjects: [],
    combos: [],
    combosOverflow: false,
    timetable: {},
    placement: {},
    moves: {},            // 학생 강제 이동: { 회차: { 학생key: 고사실 index } }
    // 별도실 시험자: 별도 1실(개별반 학생), 별도 2실(추가 시간 학생). students: { 학생key: { room: 1|2, reason } }
    // 별도실 학생: { room, reason, extra(기본 추가 시간·분), mode: 'all'(시험 전체) | 'pick'(고른 교시만), slots: {교시 key: 추가 분} }
    special: { rooms: [{ name: '별도1실' }, { name: '별도2실' }], students: {} },
    seating: [],
    seatCols: 5,
    // 출력물 설정: 좌석표(줄 수 0=자동, 채우는 순서 col=세로 먼저|row=가로 먼저, 명렬표), 학생별 시간표(유의사항·좌석번호),
    // 봉투 라벨 모양(table|big), 전체 시간표 용지(A4|B4), 분반 이름 표기(num 1반|neis 편성현황 그대로|ganada 가나다|abc ABC|none 안 씀)
    out: { seatRows: 0, seatOrder: 'col', seatList: true, slipNoteOn: true, slipNote: DEFAULT_SLIP_NOTE, slipSeat: true, labelStyle: 'table', paper: 'A4', secLabel: 'num' },
    plLocks: [],          // 학생 배치에서 잠근 교시 (자동 배치가 바꾸지 않음)
    subjectCodes: {},
    notices: [],
    // 자동 배치: 'class' 학반 교실 우선(권장) | 'original' 원본 엑셀과 동일
    // 대기 배정: 'class' 반별 우선(권장)      | 'original' 원본 엑셀과 동일
    options: { autoMode: 'rule', waitMode: 'class', ruleV: 1 },
    examDays: 5,          // 시험 기간 3·4·5일
    periods: 3,           // 하루 시험 교시 수 3·4·5교시
    extraHolidays: [],    // 학교 재량휴업일 등 추가로 건너뛸 날짜
    roomGaps: [],         // 띄워진 공간: 고사실 번호 i = i번째와 그다음 고사실 사이 (복도·계단 등으로 떨어져 있음)
  });
  const normalize = (obj) => {
    const s = Object.assign(blank(), obj);
    s.out = Object.assign(blank().out, obj && obj.out);
    s.options = Object.assign(blank().options, obj && obj.options);
    s.special = Object.assign(blank().special, obj && obj.special);
    if (!Array.isArray(s.special.rooms) || s.special.rooms.length < 2) s.special.rooms = blank().special.rooms;
    // 예전 데이터: 실마다 정했던 추가 시간 → 그 실 학생마다의 추가 시간으로 옮김
    s.special.rooms.forEach((r, j) => {
      if (!('extra' in r)) return;
      for (const x of Object.values(s.special.students)) if (x.room === j + 1 && x.extra == null) x.extra = j >= 1 ? Number(r.extra) || 0 : 0;
      delete r.extra;
    });
    for (const x of Object.values(s.special.students)) { if (x.extra == null) x.extra = 0; if (!x.mode) x.mode = 'all'; if (!x.slots) x.slots = {}; }
    // 학교 규칙 자동 배치가 생기기 전 작업은 자동 배치 방식을 학교 규칙으로 (대기 배정 방식은 그대로)
    if (!(obj && obj.options && obj.options.ruleV)) { s.options.autoMode = 'rule'; s.options.ruleV = 1; }
    if (!(obj && obj.examDays)) {
      // 예전 데이터: 시간표가 쓰는 마지막 일차 또는 입력된 날짜 수로 추정
      const used = Object.keys(s.timetable).map((k) => Number(k.split('_')[0]));
      const filled = s.dates.filter(Boolean).length;
      s.examDays = Math.min(5, Math.max(3, ...used, filled >= 3 ? filled : 5));
    }
    if (s.confirmed.placement && !s.confirmed.seats && s.seating.some((r) => !(r.seat > 0))) {
      s.seating.forEach((r) => { if (!(r.seat > 0)) r.seat = r.order; });
      s.seatMethod = s.seatMethod || 'order';
    }
    if (!(obj && obj.periods)) {
      // 예전 데이터: 시간이 입력되었거나 시험이 편성된 마지막 교시
      const ps = [...Object.keys(s.timetable), ...Object.keys(s.times).filter((k) => s.times[k])].map((k) => Number(k.split('_')[1]));
      s.periods = Math.min(5, Math.max(3, ...ps));
    }
    addStudySlots(s);
    const vals = Object.entries(s.times).filter(([, v]) => v);
    if (!vals.length || vals.every(([k, v]) => k.endsWith('_1') && v === '09:00 ~ 09:50')) s.times = defaultTimes();
    return s;
  };

  /**
   * 자습 교시(그날 첫 시험 전 등 시험이 없는 교시)가 생긴 예전 작업: 그 교시만 자동 배치(각자 자기 반 교실)하고,
   * 배치가 확정된 작업이면 그 교시의 응시현황(자습)만 덧붙인다. 이미 있는 배치·좌석은 그대로 둔다
   */
  function addStudySlots(s) {
    if (!s.confirmed.timetable || !s.rows.length) return;
    const study = C.studySlots(s.timetable).filter((x) => !(s.placement[x.key] || []).some(Boolean));
    if (!study.length) return;
    const students = C.buildStudents(s.rows, s.evalSubjects);
    const sbMap = C.subjectBanMap(s.subjectClasses);
    for (const sl of study) {
      const info = C.slotInfo(sl, students, s.subjectClasses);
      s.placement[sl.key] = C.autoPlaceSlot(sl, [], { rooms: s.rooms, sbMap, info, gaps: s.roomGaps }, false, s.options.autoMode);
    }
    if (s.confirmed.placement) {
      const res = C.buildSeating(s, students, s.options.waitMode, new Set(study.map((x) => x.key)));
      if (res.errors && res.errors.length) { console.warn('자습 교시 응시현황 만들기 실패', res.errors); return; }
      C.assignSeatsInOrder(res.seating);
      const order = new Map(C.placeSlots(s.timetable).map((x, i) => [x.key, i]));
      s.seating = [...s.seating, ...res.seating].sort((a, b) => order.get(a.slot) - order.get(b.slot) || a.roomIndex - b.roomIndex || a.order - b.order);
    }
  }

  /** 기본 고사 시간: 1교시 08:50~09:40, 2교시 10:10~11:00, 3교시 11:30~12:20 (모든 일차) */
  const DEFAULT_PERIOD_TIMES = ['08:50 ~ 09:40', '10:10 ~ 11:00', '11:30 ~ 12:20'];
  function defaultTimes() {
    const t = {};
    for (let d = 1; d <= C.DAYS; d++) DEFAULT_PERIOD_TIMES.forEach((v, i) => { t[C.slotKey(d, i + 1)] = v; });
    return t;
  }

  let state = blank();
  let index = { current: '', list: [] }; // list: [{ id, name }]
  let rev = 0;
  const listeners = new Set();
  const cache = new Map();

  /**
   * 저장소: 오프라인 실행파일이 띄운 서버(/api/all 응답)가 있으면 실행파일 옆 data 폴더의 파일에,
   * 아니면(인터넷 사이트·개발 서버) 브라우저 localStorage 에 저장한다.
   * 파일 저장은 시작할 때 한 번 모두 읽어 두고(동기 요청), 바뀔 때마다 서버로 보낸다.
   */
  const fileStore = (() => {
    try {
      const x = new XMLHttpRequest(); x.open('GET', '/api/all', false); x.send();
      if (x.status === 200) { const r = JSON.parse(x.responseText); if (r && r.mode === 'file') return { dir: r.dir, items: r.items || {} }; }
    } catch (e) { /* 파일 저장 서버가 아님 */ }
    return null;
  })();
  const post = (path, body) => fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
  const storage = fileStore ? {
    getItem: (k) => (k in fileStore.items ? fileStore.items[k] : null),
    setItem: (k, v) => { fileStore.items[k] = v; post('/api/set', { key: k, value: v }).catch(() => U.toast('data 폴더에 저장하지 못했습니다. 실행파일 창이 닫혔는지 확인하세요.', 'error')); },
    removeItem: (k) => { delete fileStore.items[k]; post('/api/del', { key: k }).catch(() => {}); },
  } : localStorage;
  const readJSON = (k) => { try { const v = storage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } };
  let saveFailed = false;
  const writeJSON = (k, v) => {
    try { storage.setItem(k, JSON.stringify(v)); saveFailed = false; return true; }
    catch (e) {
      // 저장 공간 부족: 작업이 사라지지 않도록 바로 백업 파일을 내려받게 한다 (한 번만)
      if (!saveFailed) { saveFailed = true; U.toast('브라우저 저장 공간이 부족해 저장하지 못했습니다. 백업 파일을 내려받습니다.', 'error'); try { U.download(`고사배치_긴급백업_${Date.now()}.json`, JSON.stringify(state)); } catch (e2) { /* 무시 */ } }
      return false;
    }
  };
  // 13: 자동 백업 (IndexedDB) — 단계를 확정할 때마다 한 벌 더 보관 (작업 공간마다 최근 5개)
  const DB_NAME = 'exam-web-backup', DB_STORE = 'backups';
  const openDB = () => new Promise((ok, fail) => {
    if (!window.indexedDB) return fail(new Error('no idb'));
    const rq = indexedDB.open(DB_NAME, 1);
    rq.onupgradeneeded = () => { const db = rq.result; if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: 'id' }); };
    rq.onsuccess = () => ok(rq.result); rq.onerror = () => fail(rq.error);
  });
  const dbAll = (db) => new Promise((ok, fail) => { const rq = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).getAll(); rq.onsuccess = () => ok(rq.result || []); rq.onerror = () => fail(rq.error); });
  let lastBackup = null;
  async function autoBackup(label) {
    if (fileStore) {
      try {
        const name = (index.list.find((p) => p.id === index.current) || {}).name || '';
        await post('/api/backup', { name, label: label || '', state: JSON.stringify(state) });
        lastBackup = Date.now(); listeners.forEach((f) => f());
      } catch (e) { /* 무시 */ }
      return;
    }
    try {
      const db = await openDB();
      const all = await dbAll(db);
      const mine = all.filter((b) => b.project === index.current).sort((a, b) => b.time - a.time);
      const tx = db.transaction(DB_STORE, 'readwrite'), os = tx.objectStore(DB_STORE);
      const rec = { id: `${index.current}:${Date.now()}`, project: index.current, name: (index.list.find((p) => p.id === index.current) || {}).name || '', time: Date.now(), label: label || '', state: JSON.stringify(state) };
      os.put(rec);
      mine.slice(4).forEach((b) => os.delete(b.id));
      await new Promise((ok, fail) => { tx.oncomplete = ok; tx.onerror = () => fail(tx.error); });
      lastBackup = rec.time; listeners.forEach((f) => f());
    } catch (e) { /* IndexedDB 를 못 쓰는 환경이면 조용히 건너뜀 */ }
  }
  async function loadLastBackupTime() {
    try { const db = await openDB(); const all = await dbAll(db); const mine = all.filter((b) => b.project === index.current); lastBackup = mine.length ? Math.max(...mine.map((b) => b.time)) : null; } catch (e) { lastBackup = null; }
  }
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  function load() {
    index = readJSON(INDEX_KEY) || { current: '', list: [] };
    if (!index.list.length) {
      // 이전 버전(단일 작업) 데이터 이전
      const legacy = readJSON(LEGACY_KEY);
      const id = newId();
      index = { current: id, list: [{ id, name: legacy ? gradeName(legacy.rows) || '작업 1' : '새 작업' }] };
      if (legacy) { writeJSON(pKey(id), legacy); try { storage.removeItem(LEGACY_KEY); } catch (e) { /* 무시 */ } }
      writeJSON(INDEX_KEY, index);
    }
    if (!index.list.find((p) => p.id === index.current)) index.current = index.list[0].id;
    state = normalize(readJSON(pKey(index.current)));
  }
  let saveTimer = null;
  function flush() { clearTimeout(saveTimer); writeJSON(pKey(index.current), state); writeJSON(INDEX_KEY, index); }
  function save() { clearTimeout(saveTimer); saveTimer = setTimeout(flush, 150); }
  function commit() {
    rev++; cache.clear();
    // 작업 공간 목록에 불러온 파일명을 함께 기록 (학년 카드에 표시)
    const p = index.list.find((x) => x.id === index.current);
    if (p) p.fileName = state.rows.length ? state.fileName || '' : '';
    save(); listeners.forEach((f) => f());
  }

  /** 편성 데이터의 학년으로 작업 이름 추천: '2학년' */
  function gradeName(rows) { const g = rows && rows[0] && C.val(rows[0].학년); return g ? `${g}학년` : ''; }
  /** 새 작업/기본 이름이면 데이터의 학년으로 이름을 바꾼다 */
  function autoName() {
    const p = index.list.find((x) => x.id === index.current);
    const g = gradeName(state.rows);
    if (!p || !g || !/^(새 작업|작업 \d+)$/.test(p.name)) return;
    let name = g, n = 2;
    while (index.list.some((x) => x !== p && x.name === name)) name = `${g} (${n++})`;
    p.name = name;
  }

  /** 파생 데이터 메모이제이션 (상태 변경 시 초기화) */
  function memo(name, fn) { if (!cache.has(name)) cache.set(name, fn()); return cache.get(name); }

  const S = {
    get state() { return state; },
    get rev() { return rev; },
    subscribe(f) { listeners.add(f); return () => listeners.delete(f); },
    /** 자동 백업: 마지막 시각, 목록, 복구 */
    lastBackup: () => lastBackup,
    autoBackup: (label) => autoBackup(label),
    /** 저장 위치 안내 (사이드바) */
    storageInfo: () => (fileStore ? { mode: 'file', dir: fileStore.dir } : { mode: 'browser' }),
    async backups() {
      if (fileStore) {
        try {
          const name = (index.list.find((p) => p.id === index.current) || {}).name || '';
          const r = await fetch('/api/backups'); const all = await r.json();
          return all.filter((b) => b.name === name).map((b) => ({ id: b.file, time: b.time, label: b.label, name }));
        } catch (e) { return []; }
      }
      try { const db = await openDB(); const all = await dbAll(db); return all.filter((b) => b.project === index.current).sort((a, b) => b.time - a.time).map(({ id, time, label, name }) => ({ id, time, label, name })); } catch (e) { return []; } },
    async restoreBackup(id) {
      if (fileStore) {
        const r = await post('/api/backup-read', { file: id });
        if (!r || !r.state) return false;
        state = normalize(JSON.parse(r.state)); undoStack = []; redoStack = []; commit();
        return true;
      }
      const db = await openDB(); const all = await dbAll(db); const b = all.find((x) => x.id === id);
      if (!b) return false;
      state = normalize(JSON.parse(b.state)); undoStack = []; redoStack = []; commit();
      return true;
    },
    commit,

    // ------------------------------------------------ 학년별 작업 공간
    projects: () => index.list.map((p) => ({ ...p, current: p.id === index.current })).sort((a, b) => C.cmp(a.name, b.name)),
    currentProject: () => index.list.find((p) => p.id === index.current),
    /** 학교 이름: 모든 학년 작업 공간에 공통 (출력물 머리에 인쇄) */
    school: () => index.school || '',
    setSchool(v) { index.school = String(v || '').trim(); writeJSON(INDEX_KEY, index); commit(); },
    /** 현재 작업의 학년(1~3): 편성 데이터 → 작업 이름 순으로 판단, 모르면 0 */
    currentGrade() {
      const g = C.val(state.rows[0] && state.rows[0].학년) || C.val(S.currentProject()?.name);
      return g >= 1 && g <= 3 ? g : 0;
    },
    /** 작업 공간 목록의 학년별 대표 작업 */
    /** 작업 공간에 불러온 파일명 (예전에 만든 작업은 저장된 데이터에서 한 번 읽어 목록에 기록) */
    projectFile(p) {
      if (!p) return '';
      if (p.fileName === undefined) {
        const saved = p.id === index.current ? state : readJSON(pKey(p.id));
        p.fileName = saved && saved.rows && saved.rows.length ? saved.fileName || '' : '';
        writeJSON(INDEX_KEY, index);
      }
      return p.fileName;
    },
    /** 다른 작업 공간에 학생 자료가 있는가 / 학생편성현황이 확정되었는가 (저장된 것을 읽어 봄) */
    projectHasRows(id) { const x = id === index.current ? state : readJSON(pKey(id)); return !!(x && x.rows && x.rows.length); },
    projectConfirmedRoster(id) { const x = id === index.current ? state : readJSON(pKey(id)); return !!(x && x.confirmed && x.confirmed.roster); },
    projectOfGrade(g) {
      return index.list.find((p) => p.name === `${g}학년`) || index.list.find((p) => C.val(p.name) === g && /학년/.test(p.name));
    },
    /** 학년 작업 공간을 연다. 없으면 'N학년' 이름으로 만든다(비어 있는 '새 작업'이 열려 있으면 그것을 사용) */
    openGrade(g) {
      const p = S.projectOfGrade(g);
      if (p) return S.switchProject(p.id);
      const cur = S.currentProject();
      if (!state.rows.length && cur && /^(새 작업|작업 \d+)$/.test(cur.name)) return S.renameProject(cur.id, `${g}학년`);
      S.newProject(`${g}학년`);
    },
    switchProject(id) {
      if (id === index.current || !index.list.find((p) => p.id === id)) return;
      flush();
      index.current = id;
      state = normalize(readJSON(pKey(id)));
      undoStack = []; redoStack = [];
      writeJSON(INDEX_KEY, index);
      commit();
    },
    newProject(name) {
      flush();
      const id = newId();
      index.list.push({ id, name: name || '새 작업' });
      index.current = id;
      state = blank();
      commit();
      return id;
    },
    renameProject(id, name) { const p = index.list.find((x) => x.id === id); if (p && name) { p.name = name; commit(); } },
    deleteProject(id) {
      index.list = index.list.filter((p) => p.id !== id);
      try { storage.removeItem(pKey(id)); } catch (e) { /* 무시 */ }
      if (!index.list.length) { const nid = newId(); index.list.push({ id: nid, name: '새 작업' }); }
      if (index.current === id) { index.current = index.list[0].id; state = normalize(readJSON(pKey(index.current))); }
      writeJSON(INDEX_KEY, index);
      commit();
    },
    setOption(k, v) { state.options[k] = v; commit(); },

    // ------------------------------------------------ 파생 데이터
    students: () => memo('students', () => C.buildStudents(state.rows, state.evalSubjects)),
    sets: () => memo('sets', () => C.subjectStudentSets(state.rows, state.evalSubjects)),
    sbMap: () => memo('sbMap', () => C.subjectBanMap(state.subjectClasses)),
    slots: () => memo('slots', () => C.placeSlots(state.timetable)),
    slotInfo: (slot) => memo('info:' + slot.key, () => C.slotInfo(slot, S.students(), state.subjectClasses)),
    /** 회차의 고사실별 학생 명단 (배치 확정 전 미리보기, 학생 이동 반영) */
    roster: (slot) => memo('roster:' + slot.key, () => C.slotRoster(
      { rooms: state.rooms, sbMap: S.sbMap(), students: S.students(), idx: memo('idx', () => C.studentIndex(state.rows)), waitMode: state.options.waitMode },
      slot, S.cells(slot.key), (state.moves || {})[slot.key])),
    /** 학생 이동을 적용하기 전 명단 (원래 자리 확인용) */
    rosterBase: (slot) => memo('rosterBase:' + slot.key, () => C.slotRoster(
      { rooms: state.rooms, sbMap: S.sbMap(), students: S.students(), idx: memo('idx', () => C.studentIndex(state.rows)), waitMode: state.options.waitMode },
      slot, S.cells(slot.key), {})),
    /** 학생 강제 이동 (to = 고사실 index, null 이면 원래 자리로) */
    moveStudent(slotKey, key, to) {
      if (S.isLocked(slotKey)) return U.toast('잠긴 교시입니다. 교시 이름 옆 🔒 을 눌러 잠금을 풀고 고치세요.', 'error');
      remember('pl', '학생 이동');
      const m = (state.moves[slotKey] = state.moves[slotKey] || {});
      if (to == null) delete m[key]; else m[key] = to;
      if (!Object.keys(m).length) delete state.moves[slotKey];
      commit();
    },
    rosterStudents: () => memo('roster', () => {
      const m = new Map();
      for (const x of state.rows) {
        const k = C.studentKey(x.반, x.번호);
        if (!m.has(k)) m.set(k, { key: k, ban: x.반, num: Number(x.번호) || 0, name: x.성명, grade: x.학년, count: 0, convenience: false });
        const s = m.get(k); s.count++;
        if (/편의/.test(x.강의실)) s.convenience = true;
      }
      return [...m.values()].sort((a, b) => C.cmp(a.ban, b.ban) || a.num - b.num);
    }),
    defaultTitle() {
      const r = state.rows[0];
      return r ? `${r.학년도}학년도 ${C.val(r.학년)}학년 ${r.학기}학기 정기고사` : '정기고사';
    },
    title() { return state.title || S.defaultTitle(); },

    // ------------------------------------------------ 1. 학생편성현황
    importRows(rows, fileName) {
      const keep = { dates: state.dates, times: state.times, title: state.title, seatCols: state.seatCols, rooms: state.rooms, classCap: state.classCap, examDays: state.examDays, periods: state.periods, extraHolidays: state.extraHolidays, roomGaps: state.roomGaps };
      state = Object.assign(blank(), keep, { rows, fileName });
      autoName();
      commit();
    },
    /**
     * 새 고사 시작: 지난 시험 자료(학생·과목·시간표·배치·명단·별도실 지정·날짜)를 지우고 빈 상태로.
     * 남기는 것: 고사실·정원·교시 시간·교시 수·시험 일수·띄워진 공간·좌석 열 수·출력 설정·별도실 이름,
     *           keepCodes 면 과목코드(중간→기말처럼 같은 과목은 코드가 같음)
     * allGrades 면 모든 학년 작업 공간에 같이 적용. 지우기 전에 자동 백업을 남긴다.
     */
    async newExam({ keepCodes = true, allGrades = false } = {}) {
      const wipe = (s) => {
        const keep = {
          rooms: s.rooms, classCap: s.classCap, times: s.times, periods: s.periods, examDays: s.examDays,
          roomGaps: s.roomGaps, seatCols: s.seatCols, out: s.out,
          special: { rooms: s.special.rooms, students: {} },
          subjectCodes: keepCodes ? s.subjectCodes : {},
        };
        const n = Object.assign(blank(), keep);
        n.rooms = (n.rooms || []).map((r) => ({ ...r, stuCount: 0 }));
        n.dates = Array.from({ length: 5 }, () => '');
        return n;
      };
      await autoBackup('새 고사 시작 전');
      const done = [];
      if (allGrades) {
        for (const p of index.list) {
          if (p.id === index.current) continue;
          const s = readJSON(pKey(p.id));
          if (!s || !s.rows || !s.rows.length) continue;
          writeJSON(pKey(p.id), wipe(normalize(s)));
          p.fileName = '';
          done.push(p.name);
        }
      }
      state = wipe(state);
      undoStack = []; redoStack = [];
      done.unshift((index.list.find((p) => p.id === index.current) || {}).name || '');
      commit();
      return done;
    },
    /** 기존 엑셀 프로그램(.xlsm) 작업 전체를 이어받는다 */
    loadProgram(program, fileName) {
      const { state: st, report } = C.stateFromProgram(program);
      if (!st) return report;
      state = normalize(Object.assign(st, { fileName }));
      autoName();
      commit();
      return report;
    },
    deleteStudent(key) {
      state.rows = state.rows.filter((x) => C.studentKey(x.반, x.번호) !== key);
      commit();
    },
    moveToConvenience(key) {
      state.rows.forEach((x) => { if (C.studentKey(x.반, x.번호) === key) x.강의실 = '편의반'; });
      commit();
    },
    restoreRoom(key) {
      state.rows.forEach((x) => { if (C.studentKey(x.반, x.번호) === key) x.강의실 = x.강의실2; });
      commit();
    },
    confirmRoster() {
      const base = C.buildBase(state.rows);
      state.subjects = base.subjects;
      state.subjectClasses = base.subjectClasses;
      state.rooms = C.mergeRooms(state.rows, state.rooms).rooms; // 고친 고사실명·수용인원, 별도실은 유지
      if (!state.dates.some(Boolean)) {
        const t = U.today();
        state.dates[0] = C.holidayReason(t, state.extraHolidays) ? C.nextSchoolDays(t, 1, state.extraHolidays)[0] : t;
        fillDates();
      }
      if (!Object.values(state.times).some(Boolean)) {
        Object.assign(state.times, defaultTimes());
      }
      state.confirmed.roster = true;
      autoBackup('학생편성현황 확정');
      commit();
    },
    /** 확정 취소 때 사라지는 것 (3: 취소 확인 창에 보여 줌) */
    unconfirmLoss(step) {
      const c = state.confirmed, out = [];
      const order = ['roster', 'subjects', 'timetable', 'placement', 'seats'];
      const from = order.indexOf(step);
      const has = (k) => order.indexOf(k) > from && c[k];
      if (step === 'roster') out.push('과목 현황·평가과목 선택 (다시 확정해야 함)');
      if (step === 'subjects' || (step === 'roster' && c.subjects)) out.push('동시 시험 가능 과목 조합');
      if (has('timetable') || step === 'timetable') out.push(`고사시간표 확정 상태 (편성한 시간표 ${Object.keys(state.timetable).length}칸은 남음)`);
      if (has('placement') || step === 'placement') out.push(`고사실별 학생 명단 ${state.seating.length}건과 좌석번호`);
      if (has('seats') || step === 'seats') out.push('응시현황 확정 상태 (출력물 사용 불가)');
      if ((has('placement') || step === 'placement') && Object.keys(state.special.students).length) out.push(`별도실 학생 지정 ${Object.keys(state.special.students).length}명 (지정 자체는 남지만 다시 확정해야 반영)`);
      return out;
    },
    unconfirmRoster() {
      S.unconfirmSubjects(true);
      state.subjects = []; state.subjectClasses = [];
      state.confirmed.roster = false;
      commit();
    },

    // ------------------------------------------------ 2. 기초정보
    /** 일차 날짜 지정. 1일차를 바꾸면 2일차부터 휴일을 건너뛰어 자동 지정 */
    setDate(i, v) {
      remember('bs', '시행 일자');
      state.dates[i] = v;
      if (i === 0) fillDates();
      commit();
    },
    refillDates() { fillDates(); commit(); },
    resetTimes() { state.times = defaultTimes(); clearExtraPeriods(); commit(); },
    /** 하루 교시 수(3~5) 변경. 줄어드는 교시에 편성된 과목이 있으면 거부 → 해당 교시 목록 반환 */
    setPeriods(n) {
      const used = [...new Set(Object.keys(state.timetable).filter((k) => state.timetable[k].length).map((k) => Number(k.split('_')[1])).filter((p) => p > n))].sort();
      if (used.length) return used;
      state.periods = n;
      clearExtraPeriods();
      commit();
      return [];
    },
    /** 시험 기간(3~5일) 변경. 줄어드는 일차에 편성된 과목이 있으면 거부 → 해당 일차 목록 반환 */
    setExamDays(n) {
      const used = [...new Set(Object.keys(state.timetable).filter((k) => state.timetable[k].length).map((k) => Number(k.split('_')[0])).filter((d) => d > n))];
      if (used.length) return used;
      state.examDays = n;
      fillDates();
      commit();
      return [];
    },
    addHoliday(iso) { if (iso && !state.extraHolidays.includes(iso)) { state.extraHolidays.push(iso); state.extraHolidays.sort(); fillDates(); commit(); } },
    removeHoliday(iso) { state.extraHolidays = state.extraHolidays.filter((x) => x !== iso); fillDates(); commit(); },
    setTime(k, v) { remember('bs', '교시 시간'); state.times[k] = v; commit(); },
    setRoom(i, field, v) { remember('bs', '고사실 정보'); state.rooms[i][field] = (field === 'cap' || field === 'maxClass' || field === 'stuCount') ? (v === '' ? 0 : Number(v)) : v; commit(); },
    /** 학반 교실(1반~마지막 반)의 최대수용인원을 기준인원으로 일괄 지정 → 바뀐 교실 수 */
    applyClassCap(n) {
      remember('bs', '기준인원 적용');
      state.classCap = n;
      let cnt = 0;
      state.rooms.forEach((r) => { if (C.isClassRoom(r)) { r.cap = n; cnt++; } });
      commit();
      return cnt;
    },
    /** 편성 데이터에서 학반 고사실을 다시 읽는다 (고친 값·별도실 유지) */
    resyncRooms() {
      const r = C.mergeRooms(state.rows, state.rooms);
      state.rooms = r.rooms; commit();
      return r;
    },
    /** 학반 고사실 한 줄 추가: 마지막 학반 다음 번호 */
    addClassRoom() {
      const grade = C.val(state.rows[0] && state.rows[0].학년) || S.currentGrade() || '';
      const classes = state.rooms.filter((r) => /^\s*\d+\s*반\s*$/.test(r.ban || ''));
      const n = Math.max(0, ...classes.map((r) => C.val(r.ban))) + 1;
      const pad = classes.some((r) => /^0\d/.test(r.ban)) && n < 10 ? '0' : '';
      const cap = Number(state.classCap) || 30;
      const room = { ban: `${pad}${n}반`, stuCount: 0, maxClass: cap, name: `${grade}-${n}`, cap, manual: true };
      const last = state.rooms.reduce((at, r, i) => (r.ban ? i : at), -1);
      state.rooms.splice(last + 1, 0, room);
      commit();
      return room;
    },
    /**
     * 다른 학년 작업에서 일정·고사실 설정 가져오기
     * 일정: 시행 일수·일자·교시 수·시간·추가 휴일 / 고사실: 학반 기준인원, 특별실(학반이 아닌 고사실)
     * withRooms=false 면 일정만 (시간표를 확정해 고사실을 바꿀 수 없을 때)
     */
    copyBasicFrom(id, withRooms) {
      const src = readJSON(pKey(id));
      if (!src) return null;
      remember('bs', '다른 학년 설정 가져오기');
      for (const k of ['examDays', 'periods', 'extraHolidays']) if (src[k] != null) state[k] = JSON.parse(JSON.stringify(src[k]));
      if (Array.isArray(src.dates)) state.dates = src.dates.slice();
      if (src.times) state.times = { ...src.times };
      let added = 0, capN = 0;
      if (withRooms) {
        if (Number(src.classCap) > 0) { state.classCap = Number(src.classCap); state.rooms.forEach((r) => { if (C.isClassRoom(r)) { r.cap = state.classCap; capN++; } }); }
        const have = new Set(state.rooms.map((r) => r.name));
        for (const r of src.rooms || []) {
          if (C.isClassRoom(r) || !r.name || have.has(r.name) || r.ban) continue;
          state.rooms.push({ ban: '', stuCount: 0, maxClass: 0, name: r.name, cap: Number(r.cap) || 30 }); added++;
        }
        if (src.seatCols) state.seatCols = src.seatCols;
      }
      commit();
      return { added, capN };
    },
    addRoom() {
      const n = state.rooms.filter((r) => /^별도실/.test(r.name)).length + 1;
      state.rooms.push({ ban: '', stuCount: 0, maxClass: 0, name: `별도실${n}`, cap: 30 });
      commit();
    },
    removeRoom(i) { remember('bs', '고사실 삭제'); state.rooms.splice(i, 1); commit(); },
    moveRoom(i, dir) {
      const j = i + dir; if (j < 0 || j >= state.rooms.length) return;
      [state.rooms[i], state.rooms[j]] = [state.rooms[j], state.rooms[i]]; commit();
    },

    // ------------------------------------------------ 4. 평가과목
    toggleEval(name, on) {
      const s = state.subjects.find((x) => x.name === name); if (s) s.evaluate = on ?? !s.evaluate; commit();
    },
    setAllEval(on) { state.subjects.forEach((s) => { s.evaluate = on; }); commit(); },
    /** 평가과목 일괄 선택: 'invert' 반전 | 'ban3' 3개 반 이상만 체크 추가 */
    evalBulk(kind) {
      if (kind === 'invert') state.subjects.forEach((s) => { s.evaluate = !s.evaluate; });
      if (kind === 'ban3') state.subjects.forEach((s) => { if (s.banCount >= 3) s.evaluate = true; });
      commit();
    },
    confirmSubjects() {
      state.evalSubjects = state.subjects.filter((s) => s.evaluate).map((s) => s.name);
      cache.clear();
      const evalList = state.subjects.filter((s) => s.evaluate);
      const r = C.findSameTimeCombos(evalList, S.sets(), S.rosterStudents().length);
      state.combos = r.combos; state.combosOverflow = r.overflow;
      // 평가과목이 아닌 과목은 시간표에서 제거
      const ev = new Set(state.evalSubjects);
      for (const k of Object.keys(state.timetable)) {
        state.timetable[k] = state.timetable[k].filter((s) => ev.has(s));
        if (!state.timetable[k].length) delete state.timetable[k];
      }
      state.confirmed.subjects = true;
      autoBackup('평가과목 확정');
      commit();
    },
    unconfirmSubjects(silent) {
      S.unconfirmTimetable(true);
      state.confirmed.subjects = false;
      state.combos = [];
      if (!silent) commit();
    },

    // ------------------------------------------------ 6. 시간표
    /** 두 교시 칸의 과목을 통째로 맞바꿈 */
    ttSwapCells(d1, p1, d2, p2) {
      remember('tt', '교시 맞교환');
      const a = C.slotKey(d1, p1), b = C.slotKey(d2, p2);
      const x = state.timetable[a] || [], y = state.timetable[b] || [];
      state.timetable[a] = y.slice(); state.timetable[b] = x.slice();
      cleanTT(); commit();
    },
    /** 두 일차의 시간표를 통째로 맞바꿈 (날짜·시간은 그대로) */
    ttSwapDays(d1, d2) {
      remember('tt', `${d1}·${d2}일차 바꾸기`);
      const tt = {};
      for (const [k, v] of Object.entries(state.timetable)) {
        const [d, p] = k.split('_').map(Number);
        const nd = d === d1 ? d2 : d === d2 ? d1 : d;
        tt[C.slotKey(nd, p)] = v;
      }
      state.timetable = tt; cleanTT(); commit();
    },
    ttAdd(d, p, subject) {
      remember('tt', `${subject} 편성`);
      const k = C.slotKey(d, p);
      const cur = (state.timetable[k] || []).filter(Boolean);
      if (cur.length >= C.SLOTS || cur.includes(subject)) return false;
      // 다른 칸에 있으면 이동
      for (const kk of Object.keys(state.timetable)) state.timetable[kk] = state.timetable[kk].filter((s) => s !== subject);
      state.timetable[k] = [...(state.timetable[k] || []), subject];
      cleanTT(); commit(); return true;
    },
    ttRemove(d, p, subject) {
      remember('tt', `${subject} 편성 해제`);
      const k = C.slotKey(d, p);
      state.timetable[k] = (state.timetable[k] || []).filter((s) => s !== subject);
      cleanTT(); commit();
    },
    /** 과목을 다른 칸으로 이동하거나(빈 자리) 대상 과목과 교환 (ChangeTwoSubject) */
    ttMove(subject, d, p, target) {
      remember('tt', target ? `${subject} ↔ ${target} 교환` : `${subject} 이동`);
      const from = Object.keys(state.timetable).find((k) => state.timetable[k].includes(subject));
      const k = C.slotKey(d, p);
      if (!from) return S.ttAdd(d, p, subject);
      if (target && target !== subject) {
        const a = state.timetable[from], b = state.timetable[k];
        if (from === k) { const i = a.indexOf(subject), j = a.indexOf(target); [a[i], a[j]] = [a[j], a[i]]; }
        else { a[a.indexOf(subject)] = target; b[b.indexOf(target)] = subject; }
      } else {
        if (from === k) return true;
        if ((state.timetable[k] || []).length >= C.SLOTS) { U.toast(`한 교시에는 최대 ${C.SLOTS}과목까지 편성할 수 있습니다.`, 'error'); return false; }
        state.timetable[from] = state.timetable[from].filter((s) => s !== subject);
        state.timetable[k] = [...(state.timetable[k] || []), subject];
      }
      cleanTT(); commit(); return true;
    },
    ttClear() { remember('tt', '시간표 모두 지우기'); state.timetable = {}; commit(); },
    /** 자동 편성. keep=true 이면 이미 편성한 과목은 그대로 두고 미편성 과목만 채운다 */
    ttAuto(keep) {
      remember('tt', '자동 편성');
      const avail = [];
      for (let d = 1; d <= state.examDays; d++) for (let p = 1; p <= state.periods; p++) {
        if (state.dates[d - 1] && String(state.times[C.slotKey(d, p)] || '').trim()) avail.push({ d, p });
      }
      if (!avail.length) return { error: '시험 일자·시간이 입력된 교시가 없습니다. [2. 기초정보]를 확인하세요.' };
      const subs = state.subjects.filter((s) => state.evalSubjects.includes(s.name));
      const r = C.autoTimetable(subs, S.students(), S.sets(), keep ? state.timetable : {}, avail);
      state.timetable = r.timetable;
      cleanTT(); commit();
      return r;
    },
    confirmTimetable() {
      const slots = C.placeSlots(state.timetable);
      const keys = new Set(slots.map((s) => s.key));
      for (const k of Object.keys(state.placement)) if (!keys.has(k)) delete state.placement[k];
      const sb = C.subjectBanMap(state.subjectClasses);
      for (const sl of slots) {
        const cells = state.placement[sl.key] || [];
        const bad = cells.some((v) => { const c = C.parseCell(v); return c.type === 'exam' && (!sb.get(c.key) || !sl.subjects.includes(sb.get(c.key).subject)); });
        state.placement[sl.key] = bad ? [] : cells;
      }
      state.confirmed.timetable = true;
      autoBackup('시간표 확정');
      commit();
    },
    unconfirmTimetable(silent) {
      S.unconfirmPlacement(true);
      state.confirmed.timetable = false;
      if (!silent) commit();
    },

    // ------------------------------------------------ 7. 학생배치
    cells(slotKey) {
      const n = state.rooms.length;
      const cur = state.placement[slotKey] || [];
      return Array.from({ length: n }, (_, i) => cur[i] || '');
    },
    setCell(slotKey, i, v) { if (S.isLocked(slotKey)) { U.toast('잠긴 교시입니다. 교시 이름 옆 🔒 을 눌러 잠금을 풀고 고치세요.', 'error'); return { moved: 0, unresolved: [] }; } remember('pl', '고사실 배치 변경'); const c = S.cells(slotKey); c[i] = v; state.placement[slotKey] = c; const b = rebalance(slotKey); commit(); return b; },
    /** 한 회차의 여러 칸을 한 번에 바꿈 (되돌리기 한 번) */
    setCells(slotKey, cells, label) { if (S.isLocked(slotKey)) { U.toast('잠긴 교시입니다. 교시 이름 옆 🔒 을 눌러 잠금을 풀고 고치세요.', 'error'); return { moved: 0, unresolved: [] }; } remember('pl', label || '고사실 배치 변경'); state.placement[slotKey] = cells.slice(); const b = rebalance(slotKey); commit(); return b; },
    swapCells(slotKey, i, j) { if (S.isLocked(slotKey)) { U.toast('잠긴 교시입니다. 교시 이름 옆 🔒 을 눌러 잠금을 풀고 고치세요.', 'error'); return { moved: 0, unresolved: [] }; } remember('pl', '고사실 맞바꾸기'); const c = S.cells(slotKey); [c[i], c[j]] = [c[j], c[i]]; state.placement[slotKey] = c; const b = rebalance(slotKey); commit(); return b; },
    /** 띄워진 공간 켜기/끄기 (i번째 고사실 오른쪽) */
    toggleRoomGap(i) { remember('pl', '띄워진 공간'); const g = new Set(state.roomGaps); if (g.has(i)) g.delete(i); else g.add(i); state.roomGaps = [...g].sort((a, b) => a - b); commit(); },
    clearSlot(slotKey) { if (S.isLocked(slotKey)) return U.toast('잠긴 교시입니다. 교시 이름 옆 🔒 을 눌러 잠금을 풀고 고치세요.', 'error'); remember('pl', '교시 배치 비우기'); delete state.moves[slotKey]; state.placement[slotKey] = []; commit(); },
    clearAllPlacement() {
      remember('pl', '배치 전체 삭제');
      for (const k of Object.keys(state.placement)) if (!S.isLocked(k)) { delete state.placement[k]; delete state.moves[k]; }
      commit();
    },
    /** 모든 교시 자동 배치 (되돌리기 한 번으로 전체 복원) */
    autoPlaceAll(fresh) {
      remember('pl', fresh ? '전체 다시 자동 배치' : '전체 자동 배치');
      for (const slot of S.slots()) {
        if (S.isLocked(slot.key)) continue; // 잠긴 교시는 그대로
        if (fresh) { state.placement[slot.key] = []; delete state.moves[slot.key]; }
        const info = S.slotInfo(slot);
        state.placement[slot.key] = C.autoPlaceSlot(slot, S.cells(slot.key), { rooms: state.rooms, sbMap: S.sbMap(), info, gaps: state.roomGaps }, false, state.options.autoMode);
        rebalance(slot.key);
      }
      commit();
    },
    autoPlace(slot, useExtra) {
      if (S.isLocked(slot.key)) return U.toast('잠긴 교시입니다. 교시 이름 옆 🔒 을 눌러 잠금을 풀고 고치세요.', 'error');
      remember('pl', `${slot.title} 자동 배치`);
      const info = S.slotInfo(slot);
      state.placement[slot.key] = C.autoPlaceSlot(slot, S.cells(slot.key), { rooms: state.rooms, sbMap: S.sbMap(), info, gaps: state.roomGaps }, useExtra, state.options.autoMode);
      rebalance(slot.key);
      commit();
    },
    // ------------------------------------------------ 9. 별도실 시험자
    SPECIAL_BASE: 1000, // 별도실의 고사실 번호 (일반 고사실과 겹치지 않게)
    specialRoom(k) { const r = state.special.rooms[k - 1] || {}; return { name: r.name || `별도${k}실`, special: k, ban: '', cap: 0 }; },
    specialCount: () => state.special.rooms.length,
    /** 별도실 추가 (별도 3실, 4실 …) */
    addSpecialRoom() { const k = state.special.rooms.length + 1; state.special.rooms.push({ name: `별도${k}실` }); commit(); return k; },
    /** 별도실 삭제 (3실부터). 그 실 학생은 지정 해제, 뒤쪽 실 번호는 하나씩 당김 */
    removeSpecialRoom(k) {
      if (k <= 2) return;
      state.special.rooms.splice(k - 1, 1);
      for (const [key, x] of Object.entries(state.special.students)) {
        if (x.room === k) delete state.special.students[key];
        else if (x.room > k) x.room--;
      }
      commit();
    },
    setSpecialRoom(k, field, v) { state.special.rooms[k - 1][field] = String(v || '').trim(); commit(); },
    setSpecialStudent(key, room) {
      if (!room) delete state.special.students[key];
      else state.special.students[key] = { reason: '', extra: 0, mode: 'all', slots: {}, ...(state.special.students[key] || {}), room };
      commit();
    },
    setSpecialReason(key, reason) { if (state.special.students[key]) { state.special.students[key].reason = String(reason || '').trim(); commit(); } },
    /** 학생 기본 추가 시간(분). 고른 교시 중 기본값을 따르던 교시도 함께 바꾼다 */
    setSpecialExtra(key, v) {
      const x = state.special.students[key]; if (!x) return;
      const old = x.extra, n = Math.max(0, Math.min(180, Math.round(Number(v) || 0)));
      for (const k of Object.keys(x.slots)) if (x.slots[k] === old) x.slots[k] = n;
      x.extra = n; commit();
    },
    /** 'all' 시험 전체 교시 | 'pick' 고른 교시만 (처음 고를 때는 모든 시험 교시를 기본 추가 시간으로 채워 둠) */
    setSpecialMode(key, mode) {
      const x = state.special.students[key]; if (!x) return;
      x.mode = mode === 'pick' ? 'pick' : 'all';
      if (x.mode === 'pick' && !Object.keys(x.slots).length) for (const sl of S.specialExamSlots(key)) x.slots[sl.slot] = x.extra;
      commit();
    },
    /** 고른 교시 켜기/끄기 (minutes 가 null 이면 끔) */
    setSpecialSlot(key, slotKey, minutes) {
      const x = state.special.students[key]; if (!x) return;
      if (minutes == null) delete x.slots[slotKey]; else x.slots[slotKey] = Math.max(0, Math.min(180, Math.round(Number(minutes) || 0)));
      commit();
    },
    /** 학생이 시험을 보는 교시 목록 [{slot, subject}] */
    specialExamSlots(key) { return state.seating.filter((r) => C.studentKey(r.ban, r.num) === key && r.subject !== '미응시').map((r) => ({ slot: r.slot, subject: r.subject })); },
    /** 이 교시에 별도실로 가는가 → { room, extra } 또는 null */
    specialPlan(key, slotKey) {
      const x = state.special.students[key];
      if (!x || !x.room) return null;
      if (x.mode === 'pick') return slotKey in x.slots ? { room: x.room, extra: Number(x.slots[slotKey]) || 0 } : null;
      return { room: x.room, extra: Number(x.extra) || 0 };
    },
    /**
     * 출력물용 최종 응시현황: 확정된 응시현황에 별도실 지정을 덮어씌운다.
     * 별도실 학생은 시험이 있는 교시에 원래 고사실 대신 별도실로 (좌석은 별도실 안에서 학번순)
     */
    finalSeating: () => memo('finalSeating', () => {
      const sp = state.special.students;
      if (!Object.keys(sp).length) return state.seating;
      const out = state.seating.map((r) => {
        const x = r.subject === '미응시' ? null : S.specialPlan(C.studentKey(r.ban, r.num), r.slot);
        if (!x) return r;
        const room = S.specialRoom(x.room);
        return { ...r, room: room.name, roomIndex: S.SPECIAL_BASE + x.room - 1, special: x.room, extra: x.extra, origRoom: r.room, origSeat: r.seat, seat: null };
      });
      const groups = new Map();
      out.forEach((r) => { if (r.special) { const k = r.slot + '|' + r.roomIndex; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); } });
      for (const list of groups.values()) list.sort((a, b) => C.cmp(a.ban, b.ban) || a.num - b.num).forEach((r, n) => { r.seat = n + 1; r.order = n + 1; });
      return out;
    }),
    /** 배치 확정 전 문제 목록 (학생 이동 반영) */
    placementIssues: () => memo('plIssues', () => C.placementIssues(state, S.students(), state.options.waitMode)),
    confirmPlacement() {
      // 조금이라도 문제가 있으면 확정하지 않는다
      const issues = S.placementIssues();
      if (issues.length) return { errors: issues.map((x) => `${x.title} ${x.msg}`), issues };
      const res = C.buildSeating(state, S.students(), state.options.waitMode);
      if (res.errors.length) return res;
      state.seating = res.seating;
      state.notices = res.notices;
      // 좌석번호 자동 지정 (학번순). 랜덤이 필요하면 8단계에서 [좌석 랜덤]
      C.assignSeatsInOrder(state.seating); state.seatMethod = 'order';
      state.confirmed.placement = true;
      autoBackup('배치 확정');
      commit();
      return res;
    },
    unconfirmPlacement(silent) {
      S.unconfirmSeats(true);
      state.seating = []; state.notices = [];
      state.confirmed.placement = false;
      if (!silent) commit();
    },

    // ------------------------------------------------ 8. 응시현황
    seatsInOrder() { C.assignSeatsInOrder(state.seating); state.seatMethod = 'order'; commit(); },
    seatsRandom() { C.assignSeatsRandom(state.seating); state.seatMethod = 'random'; commit(); },
    confirmSeats() {
      const errs = C.validateSeating(state.seating, S.students(), S.slots(), state.rooms);
      if (errs.length) return errs;
      state.confirmed.seats = true; commit(); return [];
    },
    unconfirmSeats(silent) { state.confirmed.seats = false; if (!silent) commit(); },

    // ------------------------------------------------ 기타
    set(field, v) { state[field] = v; commit(); },
    setOut(k, v) { state.out[k] = v; commit(); },
    defaultSlipNote: DEFAULT_SLIP_NOTE,
    /** 분반 이름 표기 (출력 설정 secLabel): 1반 | 편성현황 그대로 | 가나다 | ABC | 안 씀 */
    secName(x) {
      if (!x) return '';
      const m = state.out.secLabel, i = x.index || 1;
      if (m === 'none') return '';
      if (m === 'neis') return C.roomLabel(x.room);
      if (m === 'ganada') return ('가나다라마바사아자차카타파하'[i - 1] || i) + '반';
      if (m === 'abc') return (i <= 26 ? String.fromCharCode(64 + i) : i) + '반';
      return `${i}반`;
    },
    /** 학생 배치 교시 잠금 켜기/끄기 */
    toggleLock(slotKey) { const l = new Set(state.plLocks); if (l.has(slotKey)) l.delete(slotKey); else l.add(slotKey); state.plLocks = [...l]; commit(); },
    isLocked: (slotKey) => state.plLocks.includes(slotKey),
    setAllLocks(on) { state.plLocks = on ? S.slots().map((x) => x.key) : []; commit(); },
    /** 화면 색 테마 (모든 학년 공통): navy 남색 | green 초록 | plum 자주 */
    theme: () => index.theme || 'navy',
    setTheme(v) { index.theme = v; writeJSON(INDEX_KEY, index); commit(); },
    setSubjectCode(s, v) { state.subjectCodes[s] = v; commit(); },
    resetAll() { state = blank(); commit(); },
    /** 현재 작업 공간을 지우고 목록에서도 삭제 */
    deleteCurrentProject() { S.deleteProject(index.current); },
    exportJSON() { return JSON.stringify(state); },
    importJSON(text) {
      const obj = JSON.parse(text);
      if (!obj || obj.v !== 1 || !Array.isArray(obj.rows)) throw new Error('이 프로그램의 백업 파일이 아닙니다.');
      state = normalize(obj); autoName(); commit();
    },
  };

  /** 1일차 기준으로 2일차~마지막 일차를 휴일 제외하여 채우고, 기간 밖 날짜는 비운다 */
  function fillDates() {
    const n = state.examDays;
    if (state.dates[0]) C.nextSchoolDays(state.dates[0], n - 1, state.extraHolidays).forEach((d, k) => { state.dates[k + 1] = d; });
    for (let i = n; i < C.DAYS; i++) state.dates[i] = '';
  }

  /** 선택한 교시 수를 넘는 교시의 시간은 비운다 */
  function clearExtraPeriods() {
    for (const k of Object.keys(state.times)) if (Number(k.split('_')[1]) > state.periods) delete state.times[k];
  }

  // ------------------------------------------------ 실행 취소(Ctrl+Z) / 다시 실행(Ctrl+Y)
  // kind 'tt' = 고사시간표, 'pl' = 학생 배치. 확정되어 잠긴 단계는 되돌리지 않는다.
  let undoStack = [], redoStack = [];
  const BASIC_FIELDS = ['dates', 'times', 'examDays', 'periods', 'extraHolidays', 'rooms', 'classCap', 'title', 'seatCols', 'roomGaps'];
  const snap = (kind) => JSON.stringify(kind === 'tt' ? state.timetable : kind === 'bs' ? BASIC_FIELDS.map((k) => state[k]) : { p: state.placement, m: state.moves });
  const locked = (kind) => (kind === 'tt' ? state.confirmed.timetable : kind === 'bs' ? false : state.confirmed.placement);
  function remember(kind, label) {
    undoStack.push({ kind, label, data: snap(kind) });
    if (undoStack.length > 100) undoStack.shift();
    redoStack = [];
  }
  function restore(from, to) {
    // 바뀐 것이 없는 기록(같은 자리에 놓기 등)은 건너뜀
    while (from.length && from[from.length - 1].data === snap(from[from.length - 1].kind)) from.pop();
    const e = from.pop();
    if (!e) return { empty: true };
    if (locked(e.kind)) { from.push(e); return { locked: e }; }
    to.push({ kind: e.kind, label: e.label, data: snap(e.kind) });
    if (e.kind === 'tt') state.timetable = JSON.parse(e.data);
    else if (e.kind === 'bs') { const d = JSON.parse(e.data); BASIC_FIELDS.forEach((k, i) => { state[k] = d[i]; }); }
    else { const d = JSON.parse(e.data); state.placement = d.p; state.moves = d.m || {}; }
    commit();
    return { done: e };
  }
  S.undo = () => restore(undoStack, redoStack);
  S.redo = () => restore(redoStack, undoStack);
  S.canUndo = () => undoStack.length > 0;

  /**
   * 고사실 배치가 바뀐 회차의 정원 맞추기: 정원을 넘는 인원을 같은 과목 시험실(자습실끼리)의 빈자리로 자동 이동.
   * 그 회차의 학생 이동 내역은 새로 계산한 것으로 바꾼다. → { moved, unresolved }
   */
  function rebalance(slotKey) {
    const slot = C.placeSlots(state.timetable).find((x) => x.key === slotKey);
    if (!slot) return { moved: 0, unresolved: [] };
    cache.clear();
    const ctx = { rooms: state.rooms, sbMap: C.subjectBanMap(state.subjectClasses), students: S.students(), idx: C.studentIndex(state.rows), waitMode: state.options.waitMode };
    const r = C.balanceMoves(ctx, slot, S.cells(slotKey));
    if (r.moved) state.moves[slotKey] = r.moves; else delete state.moves[slotKey];
    return r;
  }
  /** [인원 맞추기] 자습 인원 합계를 먼저 맞추고(대기실 빈자리 채우기), 정원 초과 학생을 옮긴다 */
  S.rebalance = (slotKey) => {
    remember('pl', '정원 맞추기');
    const slot = C.placeSlots(state.timetable).find((x) => x.key === slotKey);
    let w = { added: 0, removed: 0, short: 0 };
    if (slot) { w = C.fitWaits(S.cells(slotKey), state.rooms, S.slotInfo(slot)); state.placement[slotKey] = w.cells; }
    const r = rebalance(slotKey);
    commit();
    return { ...r, waitAdded: w.added, waitRemoved: w.removed, waitShort: w.short };
  };

  function cleanTT() { for (const k of Object.keys(state.timetable)) if (!state.timetable[k].length) delete state.timetable[k]; }

  load();
  window.Store = S;
})();
