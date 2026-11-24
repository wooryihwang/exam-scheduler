/* 8. 별도 고사실: 학생마다 별도실·추가 시간·적용 교시(시험 전체 또는 고른 교시만)를 정한다 */
(function () {
  'use strict';
  const C = window.Core, S = window.Store, h = U.esc;
  const st = () => S.state;
  const { stepHead, needFirst, banner } = Views.helpers;
  const ui = { ban: '', q: '', only: false };

  const ROOM_INFO = {
    1: { title: '별도 1실', who: '개별반 학생', desc: '다른 학생 시험에 방해되지 않게 따로 보는 학생 (특수·개별반)' },
    2: { title: '별도 2실', who: '추가 시간 학생', desc: '장애·부상 등으로 시험 시간을 더 주어야 하는 학생' },
  };
  const slotShort = (key) => { const [d, p] = C.parseSlotKey(key); return `${d}-${p}교시`; };
  const infoOf = (k) => ROOM_INFO[k] || { title: `별도 ${k}실`, who: '추가 별도실', desc: '필요에 따라 추가한 별도 시험실' };

  /** 별도실에서 보는 교시와 원래 고사실(답안지를 돌려보낼 곳) — 배치를 확정한 뒤에 알 수 있음 */
  const plan = (key) => S.finalSeating().filter((r) => r.special && C.studentKey(r.ban, r.num) === key).map((r) => ({ title: slotTitle(r.slot), room: r.origRoom }));
  const slotTitle = (key) => { const sl = S.slots().find((y) => y.key === key); return sl ? sl.title : key; };
  /** 한 줄 요약: '별도 1실 에서 응시 · 답안지는 3-1, 3-4 으로 (6교시)' + [자세히 보기] (examtable과 같은 문구) */
  function summary(x, sp, mode) {
    const p = plan(x.key);
    if (!p.length) return `<span class="sp-sum muted">${mode === 'pick' ? '교시를 골라 주세요.' : '배치가 아직 없습니다.'}</span>`;
    const rooms = [...new Set(p.map((y) => y.room).filter(Boolean))];
    const short = rooms.length <= 3 ? rooms.join(', ') : `${rooms.slice(0, 3).join(', ')} 외 ${rooms.length - 3}실`;
    return `<span class="sp-sum"><b class="sp-roomname">별도 ${sp.room}실</b><span class="muted"> 에서 응시 </span><span class="sub">· 답안지는 </span><b>${h(short)}</b><span class="sub"> 으로</span>${p.length > 1 ? `<span class="muted"> (${p.length}교시)</span>` : ''}${sp.extra ? `<span class="sp-extra-tag">+${sp.extra}분</span>` : ''}</span><button class="btn xs sp-detail-btn" data-act="sp-detail" data-key="${h(x.key)}" title="${h(p.map((y) => `${y.title} → ${y.room}`).join('\n'))}">자세히 보기</button>`;
  }

  /** 한 학생 줄: 별도 응시(해당없음·모든 시험·교시 지정) · 별도실 · 교시 지정/응시 장소 */
  function row(x, ks) {
    const sp = st().special.students[x.key];
    const mode = !sp || !sp.room ? 'none' : sp.mode === 'pick' ? 'pick' : 'all';
    const seg = [['none', '해당없음'], ['all', '모든 시험'], ['pick', '교시 지정']].map(([m, l]) => `<button class="sp-seg-btn ${mode === m ? 'on' : ''}" data-act="sp-mode-set" data-key="${h(x.key)}" data-mode="${m}">${l}</button>`).join('');
    const roomSel = mode === 'none' ? '<span class="muted">—</span>' : `<select class="input sm sp-room-sel" data-change="sp-move" data-key="${h(x.key)}">${ks.map((k) => `<option value="${k}" ${sp.room === k ? 'selected' : ''}>${k}실</option>`).join('')}</select>`;
    let where = '';
    if (mode === 'pick') {
      const exams = S.specialExamSlots(x.key);
      const mine = new Set(exams.map((e) => e.slot));
      const all = S.slots().filter((sl) => sl.subjects.length);
      const chips = all.length ? all.map((sl) => {
        const has = mine.has(sl.key), on = has && sl.key in sp.slots;
        const subj = (exams.find((e) => e.slot === sl.key) || {}).subject;
        return `<button class="sp-chip ${on ? 'on' : ''}" ${has ? `data-act="sp-chip" data-key="${h(x.key)}" data-slot="${sl.key}"` : 'disabled'} title="${has ? h(`${sl.title} ${C.onlySubject(subj)}`) : '이 교시에는 시험이 없습니다'}">${slotShort(sl.key)}</button>`;
      }).join('') : '<span class="muted sm">시간표를 만든 뒤 교시를 고를 수 있습니다.</span>';
      where = `<div class="sp-chips">${chips}</div>`;
    }
    if (mode !== 'none') where += summary(x, sp, mode);
    const ext = '';
    return `<tr class="${mode === 'none' ? '' : 'on'}" data-q="${h(`${x.ban} ${x.num}번 ${x.name}`)}">
      <td class="sp-who"><b class="ban">${h(x.ban)}</b> ${x.num}번 ${h(x.name)}</td>
      <td><span class="sp-seg">${seg}</span></td>
      <td>${roomSel}</td>
      <td class="sp-place">${where}${ext}</td></tr>`;
  }

  const special = {
    id: 'special', no: 8, title: '별도 고사실',
    status: () => st().confirmed.seats,
    render() {
      const s = st();
      if (!s.confirmed.subjects) return stepHead(8, '별도 고사실') + needFirst('먼저 평가과목을 확정하세요.', 'eval', '4. 평가과목');
      const sp = s.special.students;
      const studs = S.students();
      const ks = Array.from({ length: S.specialCount() }, (_, j) => j + 1);
      const nOf = (k) => studs.filter((x) => sp[x.key] && sp[x.key].room === k).length;
      const nAll = ks.reduce((t, k) => t + nOf(k), 0);
      const list = ui.only ? studs.filter((x) => sp[x.key] && sp[x.key].room) : studs;
      const rooms = ks.map((k) => `<span class="sp-roomchip">${k}실 <input class="input xs sp-name" data-change="sp-room" data-k="${k}" data-f="name" value="${h(S.specialRoom(k).name)}" maxlength="20" title="${h(infoOf(k).desc)}"> <b>${nOf(k)}</b>명${k > 2 ? ` <button class="icon-btn danger-text" data-act="sp-del-room" data-k="${k}" title="이 별도실 삭제">✕</button>` : ''}</span>`).join('');
      return stepHead(8, '별도 고사실', '별도 고사실에서 시험을 보는 학생을 지정합니다. 지정한 학생은 <b>고사실 명단에는 그대로 남고 비고에 \'별도\'로 표시되며, 좌석배치도에서는 빠집니다.</b> 해당하는 학생이 없으면 이 단계는 건너뛰고 <b>9. 응시현황</b>으로 가시면 됩니다.') +
        banner(nAll ? 'ok' : 'info', nAll ? `${ks.filter(nOf).map((k) => `${h(S.specialRoom(k).name)} ${nOf(k)}명`).join(', ')}을 지정하였습니다.${s.confirmed.placement ? ' <b>10. 인쇄 및 출력물</b>에서 확인하세요.' : ' 학생 배치를 확정하면 출력물에 반영됩니다.'}` : '별도실 시험자가 없으면 이 단계는 건너뛰어도 됩니다. 1. 학생편성현황 명단에서도 [별도 1실]·[별도 2실]로 미리 정할 수 있습니다.') +
        `<div class="card sp-board">
          <div class="sp-top">
            <input class="input sp-search" type="search" placeholder="반, 번호, 이름으로 찾기" data-change="sp-q" data-filter="sp-tbody" value="${h(ui.q)}">
            <label class="inline chk"><input type="checkbox" data-change="sp-only" ${ui.only ? 'checked' : ''}> 지정된 학생만</label>
            <span class="spacer"></span>
            <span class="sp-rooms">${rooms}<button class="btn outline xs" data-act="sp-add-room">＋ 별도실 추가</button></span>
          </div>
          <p class="hint">별도 응시자는 <b>원래 고사실 명단에 그대로 남고</b> 비고에 '별도고사실 응시중'으로 적힙니다. 좌석배치도에서는 <b>빠집니다</b>. 한 과목만 따로 보는 학생은 <b>교시 지정</b>으로 그 교시만 고르세요.</p>
          <div class="table-wrap sp-wrap"><table class="tbl sp-tbl"><colgroup><col style="width:18%"><col style="width:24%"><col style="width:9%"><col></colgroup>
            <thead><tr><th>학생</th><th>별도 응시</th><th>별도실</th><th>교시 지정 / 응시 장소</th></tr></thead>
            <tbody id="sp-tbody">${list.length ? list.map((x) => row(x, ks)).join('') : '<tr><td colspan="4" class="muted">지정된 학생이 없습니다.</td></tr>'}</tbody></table></div>
        </div>`;
    },
    actions: {
      'sp-add-room'() { const k = S.addSpecialRoom(); U.toast(`별도 ${k}실을 추가하였습니다. 실 이름을 정하고 학생을 지정하세요.`, 'ok'); },
      async 'sp-del-room'(el) {
        const k = +el.dataset.k, name = S.specialRoom(k).name;
        if (!(await U.confirm(`'${name}'(별도 ${k}실)을 삭제할까요?\n\n이 실에 지정한 학생은 지정이 풀려 원래 고사실에서 시험을 봅니다.`))) return;
        S.removeSpecialRoom(k); U.toast(`${name}을(를) 삭제하였습니다.`, 'ok');
      },
      'sp-mode-set'(el) {
        const key = el.dataset.key, mode = el.dataset.mode;
        const cur = st().special.students[key];
        if (mode === 'none') return S.setSpecialStudent(key, null);
        if (!cur || !cur.room) S.setSpecialStudent(key, 1);
        S.setSpecialMode(key, mode);
      },
      'sp-chip'(el) {
        const x = st().special.students[el.dataset.key]; if (!x) return;
        S.setSpecialSlot(el.dataset.key, el.dataset.slot, el.dataset.slot in x.slots ? null : x.extra);
      },
      /** 자세히 보기: 추가 시간 + 그 학생의 별도 고사실 안내(10-8과 같은 내용) */
      'sp-detail'(el) {
        const key = el.dataset.key, x = S.students().find((y) => y.key === key), sp = st().special.students[key];
        if (!x || !sp) return;
        U.modal({
          title: `${h(x.ban)} ${x.num}번 ${h(x.name)} · 별도 고사실`, wide: true,
          body: `<div class="sp-detail-top"><label class="sp-ext">추가 시간 <input type="number" min="0" max="180" class="input xs num" data-change="sp-extra" data-key="${h(key)}" value="${sp.extra}">분</label><span class="muted sm">시험 시간이 늘어나는 학생만 적습니다. 바꾸면 바로 저장되고, 아래 안내에는 창을 다시 열면 반영됩니다.</span></div>
            <div class="sp-detail-preview">${Views.spGuideFor ? Views.spGuideFor(key) : ''}</div>`,
          buttons: [{ label: '닫기', value: null }],
        });
      },
      'sp-set'(el) {
        const room = +el.dataset.room, key = el.dataset.key;
        S.setSpecialStudent(key, room || null);
      },
    },
    change: {
      'sp-room'(el) { S.setSpecialRoom(+el.dataset.k, el.dataset.f, el.value); },
      'sp-reason'(el) { S.setSpecialReason(el.dataset.key, el.value); },
      'sp-move'(el) { S.setSpecialStudent(el.dataset.key, +el.value); },
      'sp-extra'(el) { S.setSpecialExtra(el.dataset.key, el.value); },
      'sp-q'(el) { ui.q = el.value; },
      'sp-only'(el) { ui.only = el.checked; rerender(); },
    },
  };
  let rerender = () => {};
  // 8단계: 응시현황(9) 앞에 끼운다
  Views.list.splice(Views.list.findIndex((v) => v.id === 'seats'), 0, special);
  Views.setSpecialRerender = (f) => { rerender = f; };
})();
