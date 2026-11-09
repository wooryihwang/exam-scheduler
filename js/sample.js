/* 체험용 가상 학생편성현황 생성 (실제 인물과 무관한 무작위 이름)
 * 1학년: 공통과목 위주 (학반 교실에서 수업) · 2·3학년: 선택과목 위주 (학년 전체가 섞여 이동 수업)
 * 나이스 「학생편성현황」 엑셀과 같은 열 순서로 만든다. */
(function () {
  'use strict';
  const SUR = '김이박최정강조윤장임한오서신권황안송류홍'.split('');
  const GIV = '민서준도윤하지우현수예은성연재건태유아진호주원채린시영규담솔'.split('');

  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
  const HEAD = () => [
    ['학생편성현황(가상 체험 데이터)'],
    [],
    ['', '학년도', '학기', '학년', '편제명', '개설과목(단위수)', '개설강의실', '계열/학년/학과', '반', '번호', '성명'],
  ];

  /** 학급 목록과 반별 인원 범위로 학생을 만든다 */
  function makeStudents(r, classes, min, max) {
    const pick = (a) => a[Math.floor(r() * a.length)];
    const students = [];
    for (const c of classes) {
      const n = min + Math.floor(r() * (max - min + 1));
      for (let i = 1; i <= n; i++) students.push({ c, i, name: pick(SUR) + pick(GIV) + pick(GIV) });
    }
    return students;
  }
  /** 이동 수업 분반: 수강생을 반 순서대로 size명씩 끊어 「과목A, 과목B…」 강의실을 붙인다 */
  function sectionRooms(list, name, size = 30) {
    const out = new Map();
    list.forEach((s, i) => out.set(s, `${name}${'ABCDEFGH'[Math.floor(i / size)]}`));
    return out;
  }
  const short = (subj) => subj.replace(/\(\d+\)$/, '').replace(/\s+/g, '');

  /** 1학년: 공통과목 + 반을 섞어 수강하는 제2외국어 */
  function grade1(r, year) {
    const aoa = HEAD();
    const students = makeStudents(r, [1, 2, 3, 4, 5, 6], 28, 31);
    students.forEach((s) => { s.lang = r() < 0.55 ? '일본어' : '중국어'; });
    const add = (grp, subj, room, s) => aoa.push(['', String(year), '1', '1', grp, subj, room, '1학년', `${s.c}반`, s.i, s.name]);
    const home = (s) => `${s.c}(1학년 ${s.c}반)`;
    const common = [['국어', '공통국어1(4)'], ['수학', '공통수학1(4)'], ['영어', '공통영어1(4)'], ['사회', '통합사회1(4)'], ['사회', '한국사1(3)'], ['과학', '통합과학1(4)'], ['과학', '과학탐구실험1(1)'], ['체육', '체육1(2)']];
    for (const [g, subj] of common) for (const s of students) add(g, subj, home(s), s);
    for (const s of students) add('예술', s.c <= 3 ? '음악(2)' : '미술(2)', home(s), s);
    for (const s of students) add('기술·가정', s.c <= 3 ? '정보(3)' : '기술·가정(3)', home(s), s);
    for (const s of students) add('제2외국어', `${s.lang}(2)`, `${s.lang}${'ABC'[Math.floor((s.c - 1) / 2)]}`, s);
    // 미재학 학생 예시 (가져올 때 자동 삭제됨)
    aoa.push(['', String(year), '1', '1', '국어', '공통국어1(4)', '6(1학년 6반)', '1학년', '6반', 40, '(미재학) 홍길동']);
    return aoa;
  }

  /** 2·3학년 공통 틀: 학급 공통과목(학반 교실) + 선택 묶음(이동 수업 분반) */
  function upper(r, year, grade, classes, nRange, common, choiceSets, homeExtra) {
    const aoa = HEAD();
    const students = makeStudents(r, classes, nRange[0], nRange[1]);
    const add = (grp, subj, room, s) => aoa.push(['', String(year), '1', String(grade), grp, subj, room, `${grade}학년`, `${s.c}반`, s.i, s.name]);
    const home = (s) => `${s.c}(${grade}학년 ${s.c}반)`;
    for (const [g, subj] of common) for (const s of students) add(g, subj, home(s), s);
    for (const [g, subj] of homeExtra) for (const s of students) add(g, subj, home(s), s);
    // 선택 묶음: 학생마다 하나씩 고르고(반마다 선호가 조금 다르게), 과목별로 30명씩 분반
    for (const set of choiceSets) {
      const chosen = new Map(set.map((x) => [x[1], []]));
      for (const s of students) {
        const bias = (s.c + set.length) % set.length;          // 반마다 잘 고르는 과목이 다름
        const idx = r() < 0.45 ? bias : Math.floor(r() * set.length);
        chosen.get(set[idx][1]).push(s);
      }
      for (const [g, subj] of set) {
        const list = chosen.get(subj);
        if (!list.length) continue;
        const rooms = sectionRooms(list, short(subj));
        for (const s of list) add(g, subj, rooms.get(s), s);
      }
    }
    return aoa;
  }

  function grade2(r, year) {
    return upper(r, year, 2, [1, 2, 3, 4, 5, 6, 7, 8], [25, 27],
      [['국어', '독서와 작문(4)'], ['수학', '미적분I(4)'], ['영어', '영어II(4)'], ['사회', '한국사2(3)']],
      [
        [['수학', '기하(3)'], ['사회', '세계사(3)'], ['사회', '법과 사회(3)'], ['사회', '세계시민과 지리(3)'], ['과학', '생명과학(3)'], ['과학', '역학과 에너지(3)']],
        [['과학', '물질과 에너지(3)'], ['과학', '지구시스템과학(3)'], ['사회', '현대사회와 윤리(3)'], ['사회', '동아시아 역사 기행(3)'], ['국어', '언어생활 탐구(3)'], ['국어', '문학과 영상(3)']],
        [['예술', '미술 감상과 비평(2)'], ['예술', '음악 연주와 창작(2)']],
        [['제2외국어', '일본어 회화(3)'], ['제2외국어', '중국어 회화(3)'], ['제2외국어', '독일어 회화(3)']],
      ],
      [['체육', '스포츠 생활2(2)']]);
  }
  function grade3(r, year) {
    return upper(r, year, 3, [1, 2, 3, 4, 5, 6, 7], [26, 28],
      [['국어', '화법과 언어(4)'], ['수학', '확률과 통계(4)'], ['영어', '영어 독해와 작문(4)']],
      [
        [['사회', '경제(3)'], ['사회', '정치(3)'], ['사회', '사회와 문화(3)'], ['과학', '물리학(3)'], ['과학', '화학(3)']],
        [['사회', '윤리와 사상(3)'], ['사회', '한국지리 탐구(3)'], ['과학', '생명과학(3)'], ['과학', '지구과학(3)'], ['사회', '국제 관계의 이해(3)']],
        [['정보', '인공지능 기초(3)'], ['정보', '프로그래밍(3)'], ['정보', '데이터 과학(3)']],
        [['예술', '미술 창작(2)'], ['예술', '음악 감상과 비평(2)']],
      ],
      [['체육', '체육 탐구(2)'], ['교양', '진로와 직업(2)']]);
  }

  /** grade: 1·2·3 (기본 1). 예전 호출 sampleAoa(년도)도 그대로 받는다 */
  function sampleAoa(grade = 1, year = new Date().getFullYear()) {
    if (grade > 3) { year = grade; grade = 1; }
    const r = rng(grade === 1 ? 20260701 : 20260701 + grade);
    if (grade === 2) return grade2(r, year);
    if (grade === 3) return grade3(r, year);
    return grade1(r, year);
  }

  window.Sample = { sampleAoa };
})();
