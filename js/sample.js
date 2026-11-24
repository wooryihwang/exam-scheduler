/* 체험용 가상 학생편성현황 생성 (학생 이름은 한국 위인·옛이야기 인물 이름을 빌려 씀 — 실제 학생과 무관)
 * 1학년: 공통과목 위주 (학반 교실에서 수업) · 2·3학년: 선택과목 위주 (학년 전체가 섞여 이동 수업)
 * 나이스 「학생편성현황」 엑셀과 같은 열 순서로 만든다. */
(function () {
  'use strict';
  // 예시 학생 이름: 오래전 역사 인물과 소설·전래동화 인물 (지금 살아 있는 사람은 넣지 않음)
  const NAMES = [...new Set(`
    세종대왕 이순신 김유신 신사임당 홍길동 성춘향 변사또 이몽룡 방자 향단 월매 심청 심봉사 뺑덕어멈 흥부 놀부 콩쥐 팥쥐
    전우치 박씨부인 임꺽정 장화 홍련 견우 직녀 바리공주 옹고집 김삿갓 김선달 허생 양소유 숙향 유충렬 조웅 박문수
    단군왕검 박혁거세 주몽 소서노 온조 김수로 허황옥 석탈해 광개토대왕 장수왕 근초고왕 진흥왕 무령왕 의자왕 선덕여왕
    진덕여왕 문무왕 김춘추 대조영 왕건 궁예 견훤 공민왕 노국공주 정조 영조 단종 성종 효종 소현세자 사도세자 혜경궁
    인현왕후 명성황후 덕혜옹주 온달 평강공주 호동왕자 낙랑공주 을지문덕 강감찬 양만춘 계백 관창 연개소문 최영 서희
    윤관 김종서 권율 곽재우 정기룡 김시민 신립 임경업 김덕령 논개 사명대사 서산대사 이성계 정몽주 정도전 황희 맹사성
    조광조 이황 이이 송시열 정약용 정약전 박지원 박제가 홍대용 이익 유형원 김정희 김정호 허준 장영실 이천 최무선
    문익점 김홍도 신윤복 정선 안견 장승업 한석봉 허난설헌 황진이 김만덕 김시습 허균 성삼문 박팽년 하위지 유응부
    최치원 원효 의상 혜초 설총 김대성 아사달 아사녀 왕인 담징 우륵 박연 왕산악 이차돈 이사부 거칠부 사다함 장보고
    김부식 일연 이규보 이제현 안향 정인지 신숙주 서거정 김육 이항복 이덕형 유성룡 이원익 채제공 김만중 박세당
    김홍집 김옥균 서재필 전봉준 최제우 최시형 손병희 김구 안중근 윤봉길 이봉창 유관순 안창호 신채호 김좌진 홍범도
    이회영 이상설 이준 민영환 최익현 주시경 지석영 방정환 윤동주 이육사 한용운 김소월 이상 나혜석 김유정 현진건
    이효석 남자현 김마리아 권기옥 나석주 양기탁 이승훈 조만식 이중섭 박수근 우장춘 석주명 을파소 명림답부 강수
    김후직 정지상 최충 최승로  세조 태종 이방원 양녕대군 효령대군 안평대군 수양대군 금성대군 영창대군
    광해군 인목대비 정순왕후 혜원 단원 겸재 추사 다산 연암 율곡 퇴계 우암 화담 서경덕 조식 기대승 이언적 김굉필
    정여창 김종직 송익필 이지함 토정 유몽인 이수광 홍만선 서유구 빙허각 이옥 유득공 이덕무 백동수 이서구 안정복
    이긍익 이중환 신경준 박규수 오경석 유홍기 어재연 양헌수 한성근  이종무 김윤후 배중손 김통정 
    정중부 이의방 경대승 최충헌 최우 만적 망이 망소이 김사미  이의민  이성림 변계량 하륜 조준 
  `.trim().split(/\s+/))];
  /** 이름 섞기 (학년마다 다른 순서) */
  function shuffledNames(seed) {
    const r = rng(seed), a = NAMES.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
  const HEAD = () => [
    ['학생편성현황(가상 체험 데이터 · 이름은 위인·옛이야기 인물)'],
    [],
    ['', '학년도', '학기', '학년', '편제명', '개설과목(단위수)', '개설강의실', '계열/학년/학과', '반', '번호', '성명'],
  ];

  /** 학급 목록과 반별 인원 범위로 학생을 만든다 */
  function makeStudents(r, classes, min, max) {
    const names = shuffledNames(7919 * classes.length + min * 131 + max);
    const students = [];
    for (const c of classes) {
      const n = min + Math.floor(r() * (max - min + 1));
      for (let i = 1; i <= n; i++) {
        r(); r(); r(); // 예전 무작위 이름이 쓰던 난수를 그대로 써서, 반·과목 등 나머지 예시 자료는 예전과 같게 둔다
        const k = students.length;
        students.push({ c, i, name: names[k % names.length] + (k >= names.length ? String(Math.floor(k / names.length) + 1) : '') });
      }
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
