/* 8. 별도 고사실: 학생마다 별도실·추가 시간·적용 교시(시험 전체 또는 고른 교시만)를 정한다 */
(function () {
  'use strict';
  const C = window.Core, S = window.Store, h = U.esc;
  const st = () => S.state;
  const { stepHead, needFirst, banner } = Views.helpers;
  const ui = { ban: '', q: '' };

  const ROOM_INFO = {
    1: { title: '별도 1실', who: '개별반 학생', desc: '다른 학생 시험에 방해되지 않게 따로 보는 학생 (특수·개별반)' },
    2: { title: '별도 2실', who: '추가 시간 학생', desc: '장애·부상 등으로 시험 시간을 더 주어야 하는 학생' },
  };
  const slotTitle = (key) => { const sl = S.slots().find((x) => x.key === key); return sl ? sl.title : key; };
  /** 별도실 카드 안의 학생 한 명 설정: 추가 시간 · 적용 범위(+ 고른 교시) */
  const studentSetting = (x) => {
    const sp = st().special.students[x.key];
    const exams = S.specialExamSlots(x.key);
    const pick = sp.mode === 'pick';
    const nSp = pick ? exams.filter((e) => e.slot in sp.slots).length : exams.length;
    const slotsHtml = pick ? `<div class="sp-slots">${exams.length ? exams.map((e) => {
      const on = e.slot in sp.slots;
      return `<label class="sp-slot ${on ? 'on' : ''}"><input type="checkbox" data-change="sp-slot-on" data-key="${h(x.key)}" data-slot="${e.slot}" ${on ? 'checked' : ''}>
        <span><b>${h(slotTitle(e.slot))}</b> ${h(C.onlySubject(e.subject))}</span>
        <span class="sp-min">+<input type="number" min="0" max="180" class="input xs num" data-change="sp-slot-min" data-key="${h(x.key)}" data-slot="${e.slot}" value="${on ? sp.slots[e.slot] : sp.extra}" ${on ? '' : 'disabled'}>분</span></label>`;
    }).join('') : '<span class="muted">시험 보는 교시가 없습니다.</span>'}</div>` : '';
    return `<div class="sp-stu ${pick ? 'picking' : ''}">
      <div class="sp-stu-row">
        <span class="sp-who"><b>${h(x.ban)} ${x.num}번 ${h(x.name)}</b></span>
        <label class="sp-ext">추가 시간 <input type="number" min="0" max="180" class="input xs num" data-change="sp-extra" data-key="${h(x.key)}" value="${sp.extra}">분</label>
        <span class="seg sm">
          <label class="${pick ? '' : 'on'}"><input type="radio" name="spm-${h(x.key)}" data-change="sp-mode" data-key="${h(x.key)}" value="all" ${pick ? '' : 'checked'}>시험 전체 교시</label>
          <label class="${pick ? 'on' : ''}"><input type="radio" name="spm-${h(x.key)}" data-change="sp-mode" data-key="${h(x.key)}" value="pick" ${pick ? 'checked' : ''}>고른 교시만</label>
        </span>
        <span class="muted sm">별도실 ${nSp}교시${exams.length - nSp ? ` · 일반 고사실 ${exams.length - nSp}교시` : ''}</span>
        <button class="icon-btn danger-text" data-act="sp-set" data-key="${h(x.key)}" data-room="0" title="지정 해제">✕</button>
      </div>${slotsHtml}</div>`;
  };
  const infoOf = (k) => ROOM_INFO[k] || { title: `별도 ${k}실`, who: '추가 별도실', desc: '필요에 따라 추가한 별도 시험실' };


  const special = {
    id: 'special', no: 8, title: '별도 고사실',
    status: () => st().confirmed.seats,
    render() {
      const s = st();
      if (!s.confirmed.placement) return stepHead(8, '별도 고사실') + needFirst('먼저 학생 배치를 확정하세요.', 'placement', '7. 학생 배치');
      const sp = s.special.students;
      const studs = S.students();
      const list = studs;
      const roomCard = (k) => {
        const r = S.specialRoom(k), info = infoOf(k);
        const mine = studs.filter((x) => sp[x.key] && sp[x.key].room === k);
        const perSlot = S.slots().map((sl) => ({ sl, n: S.finalSeating().filter((x) => x.slot === sl.key && x.special === k).length })).filter((x) => x.n);
        return `<div class="card sp-card sp${k}">
          <div class="card-head"><h3>${info.title}</h3>${k > 2 ? `<button class="btn ghost xs danger-text" data-act="sp-del-room" data-k="${k}">삭제</button>` : ''}</div>
          <p class="hint">${info.desc}</p>
          <div class="sp-row">
            <label>실 이름</label><input class="input sp-name" data-change="sp-room" data-k="${k}" data-f="name" value="${h(r.name)}" maxlength="20" placeholder="${k === 1 ? '예) 상담실' : '예) 보건실'}">
            <span class="sp-count"><b>${mine.length}</b>명</span>
          </div>
          ${mine.length ? mine.map(studentSetting).join('') : `<p class="muted sm">아래 학생 목록에서 [${info.title}]를 눌러 지정하세요.</p>`}
          ${perSlot.length ? `<p class="hint">교시별 인원: ${perSlot.map((x) => `${x.sl.title} ${x.n}명`).join(' · ')}</p>` : ''}
        </div>`;
      };
      const ks = Array.from({ length: S.specialCount() }, (_, j) => j + 1);
      const nOf = (k) => studs.filter((x) => sp[x.key] && sp[x.key].room === k).length;
      const nAll = ks.reduce((t, k) => t + nOf(k), 0);
      return stepHead(8, '별도 고사실', '따로 시험을 보아야 하는 학생을 별도실로 지정합니다. 지정한 학생은 <b>시험이 있는 교시마다</b> 원래 고사실 대신 별도실에서 시험을 보고, 출력물(고사실 명단·좌석표·학급별·학생별·라벨)에 바로 반영됩니다.') +
        banner(nAll ? 'ok' : 'info', nAll ? `${ks.filter(nOf).map((k) => `${h(S.specialRoom(k).name)} ${nOf(k)}명`).join(', ')}을 지정하였습니다. <b>10. 인쇄 및 출력물</b>에서 확인하세요. (원래 고사실 명단에서는 빠집니다)` : '별도실 시험자가 없으면 이 단계는 건너뛰어도 됩니다.') +
        `<div class="sp-layout">
        <div class="card sp-left">
          <div class="card-head"><h3>학생 지정</h3>
            <div class="toolbar" style="margin:0">
              <input class="input sm search" type="search" placeholder="이름 또는 '3반' 처럼 검색" data-change="sp-q" data-filter="sp-tbody" value="${h(ui.q)}">
              <span class="muted sm" data-filter-count="sp-tbody" data-fmt="{n}명 표시">${list.length}명</span>
            </div>
          </div>
          <div class="table-wrap sp-list"><table class="tbl compact"><thead><tr><th>반</th><th>번호</th><th>성명</th><th class="right">별도실로 보내기</th></tr></thead>
          <tbody id="sp-tbody">${list.map((x) => {
            const cur = sp[x.key] ? sp[x.key].room : 0;
            const b = (k) => `<button class="btn xs ${cur === k ? 'primary' : 'outline'}" data-act="sp-set" data-key="${h(x.key)}" data-room="${cur === k ? 0 : k}" title="${cur === k ? '지정 해제' : `${h(S.specialRoom(k).name)}(으)로`}">${cur === k ? '✓ ' : ''}${k}실</button>`;
            return `<tr class="${cur ? 'on' : ''}" data-q="${h(`${x.ban} ${x.num}번 ${x.name}`)}"><td>${h(x.ban)}</td><td>${x.num}</td><td>${h(x.name)}</td>
              <td class="right sp-btns">${ks.map(b).join(' ')}</td></tr>`;
          }).join('')}</tbody></table></div>
          <p class="hint">[1실]·[2실]을 누르면 오른쪽 별도실에 들어갑니다. 한 번 더 누르면 지정이 풀립니다. 자습(미응시) 교시에는 원래 대기실에서 자습합니다.</p>
        </div>
        <div class="sp-right">
          ${ks.map(roomCard).join('')}
          <button class="btn outline sm sp-add-btn" data-act="sp-add-room">＋ 별도실 추가</button>
          ${nAll ? `<p class="hint sp-help">추가 시간은 학생마다 정합니다. <b>시험 전체 교시</b>: 시험 보는 모든 교시를 별도실에서 · <b>고른 교시만</b>: 체크한 교시만 별도실에서 보고 나머지는 원래 고사실에서 봅니다. (예: 손목 골절 → 서술형이 있는 과목만 체크하고 +10분)</p>` : ''}
        </div>
        </div>`;
    },
    actions: {
      'sp-add-room'() { const k = S.addSpecialRoom(); U.toast(`별도 ${k}실을 추가하였습니다. 실 이름을 정하고 학생을 지정하세요.`, 'ok'); },
      async 'sp-del-room'(el) {
        const k = +el.dataset.k, name = S.specialRoom(k).name;
        if (!(await U.confirm(`'${name}'(별도 ${k}실)을 삭제할까요?

이 실에 지정한 학생은 지정이 풀려 원래 고사실에서 시험을 봅니다.`))) return;
        S.removeSpecialRoom(k); U.toast(`${name}을(를) 삭제하였습니다.`, 'ok');
      },
      'sp-set'(el) {
        const room = +el.dataset.room, key = el.dataset.key;
        S.setSpecialStudent(key, room || null);
        const x = S.students().find((y) => y.key === key);
        U.toast(room ? `${x.ban} ${x.num}번 ${x.name} → ${S.specialRoom(room).name}` : `${x.ban} ${x.num}번 ${x.name} 별도실 지정 해제`, 'ok');
      },
    },
    change: {
      'sp-room'(el) { S.setSpecialRoom(+el.dataset.k, el.dataset.f, el.value); },
      'sp-reason'(el) { S.setSpecialReason(el.dataset.key, el.value); },
      'sp-move'(el) { S.setSpecialStudent(el.dataset.key, +el.value); },
      'sp-extra'(el) { S.setSpecialExtra(el.dataset.key, el.value); },
      'sp-mode'(el) { if (el.checked) S.setSpecialMode(el.dataset.key, el.value); },
      'sp-slot-on'(el) { const x = st().special.students[el.dataset.key]; S.setSpecialSlot(el.dataset.key, el.dataset.slot, el.checked ? x.extra : null); },
      'sp-slot-min'(el) { S.setSpecialSlot(el.dataset.key, el.dataset.slot, el.value); },
      'sp-q'(el) { ui.q = el.value; },
    },
  };
  let rerender = () => {};
  // 8단계: 응시현황(9) 앞에 끼운다
  Views.list.splice(Views.list.findIndex((v) => v.id === 'seats'), 0, special);
  Views.setSpecialRerender = (f) => { rerender = f; };
})();
