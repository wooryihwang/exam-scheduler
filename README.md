# 고사시간표 시스템 · Smart Scheduler

[examtable.web.app](https://examtable.web.app/)의 화면 구성(흰 사이드바 · 학년 토글 · 10단계 메뉴 · 인쇄 및 출력물 하위 메뉴 · 단계 머리)을 그대로 따르고,
계산 로직과 출력물은 [wooryihwang/exam-seating](https://github.com/wooryihwang/exam-seating)(exam-web)을 가져와 만든 정기고사 운영 도구입니다.
나이스 학생편성현황을 불러와 **평가과목 선택 → 고사시간표 작성 → 고사장·학생 배치 → 좌석번호 → 출력물 인쇄**까지 진행합니다.

- 서버·로그인 없이 브라우저만으로 동작합니다. 학생 자료는 **이 브라우저(localStorage)에만** 저장되고 외부로 전송되지 않습니다.
- 단계를 확정할 때마다 브라우저 안에 스냅샷(최근 5개)이 남고, 사이드바 **파일 저장 / 파일 열기**(JSON)로 다른 PC로 옮길 수 있습니다.

## examtable 형태와 다른 점

| 항목 | examtable.web.app | 이 프로그램 |
|---|---|---|
| 학년 | 2·3학년 | **1·2·3학년** (1 초록 · 2 파랑 · 3 빨강 테마) |
| 저장 | Firebase 서버 동기화 | 브라우저 자동 저장 + 스냅샷 + JSON 파일 저장/열기 |
| 오프라인 로컬 버전 | 별도 다운로드 | 정적 파일이라 그대로 오프라인 사용 가능 (`index.html` 더블클릭) |
| 샘플 데이터 | 2·3학년 | 1·2·3학년 가상 데이터 (`js/sample.js`, 실제 인물과 무관) |

단계 순서는 examtable과 같습니다.
1 학생편성현황 → 2 기초정보 → 3 과목현황 → 4 평가과목 → 5 학생과목 → 6 시간표작성 → 7 고사장·학생 배치 → **8 별도 고사실(선택)** → **9 응시현황** → 10 인쇄 및 출력물(10-1 전체 시간표 ~ 10-8 별도 수험생)

## 실행

```bash
python serve.py 8766
```

브라우저에서 `http://localhost:8766` 을 엽니다. (`index.html`을 바로 더블클릭해도 동작합니다.)
엑셀 읽기/쓰기에 SheetJS(cdnjs)와 Pretendard 글꼴(jsdelivr)을 CDN에서 불러오므로 인터넷 연결이 필요합니다.

GitHub Pages: 저장소 설정 → Pages → `main` 브랜치 `/ (root)` 를 켜면 `https://<계정>.github.io/exam-scheduler/` 에서 바로 실행됩니다.

## 파일 구성

```
index.html        앱 셸 (사이드바·상단 막대)
css/style.css     exam-seating 원본 화면·A4 인쇄 스타일
css/theme.css     Smart Scheduler 테마 (examtable 형태의 색·모양; style.css 뒤에 읽힘)
js/core.js        핵심 알고리즘 (DOM 비의존, Node 테스트 가능)
js/store.js       상태·단계 확정/취소·저장·스냅샷
js/views.js       1~7, 9단계 화면
js/special.js     8단계 별도 고사실
js/outputs.js     10단계 인쇄 및 출력물 (10-1~10-8)
js/sample.js      1·2·3학년 가상 체험 데이터
js/main.js        내비게이션·상단 막대·이벤트·끌어놓기·백업
tests/            node tests/core.test.js · node tests/store.test.js
```

## 단계와 원본 대응

| 단계 | 화면 | 원본 엑셀 시트 / VBA |
|---|---|---|
| 1 | 학생편성현황 가져오기, 학생 삭제, 편의반 이동, 확정 | `1.편성현황` |
| 2 | 고사명·시행일·교시 시간·고사실(수용인원, 별도실) | `2.기초정보` |
| 3 | 과목별·강의실별 학생수 | `3.과목` |
| 4 | 평가과목 선택, 동시 시험 가능 조합 | `4.평가과목` |
| 5 | 학생별 평가과목 | `5.학생과목` |
| 6 | 일차 × 교시 × 과목 시간표, 동시 시험 판정 | `6.시간표작성` |
| 7 | 고사실별 과목-분반/대기 배치, 자동 배치, 확정 | `7.학생배치` |
| 8 | 별도 고사실 시험자: 별도 1실·2실 지정, 추가 시간 | (웹 추가 기능) |
| 9 | 응시현황, 좌석 학번순/랜덤, 엑셀 저장 | `8.응시현황` |
| 10 | 출력물 8종 — 엑셀 저장 · PDF 저장 · 출력 | `9-1`~`9-7`, `라벨서식` |

알고리즘 설명과 원본 대비 검증 결과는 [exam-seating 저장소 README](https://github.com/wooryihwang/exam-seating/blob/main/exam-web/README.md)를 참고하세요.
