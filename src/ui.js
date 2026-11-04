/**
 * 림버스 천장 계산기 - 화면 코드
 * 계산은 전부 calc.js(LimbusCalc)에 맡기고, 여기서는 입력·표시만 다룹니다.
 */
(function () {
  'use strict';
  const { DEFAULT_CONFIG: CONFIG, solve, pityCount, successProb, pullsToReach, simulateOnce } = window.LimbusCalc;
  const LP = CONFIG.lunacyPerPull, PC = CONFIG.pityCost;

  const DEFAULTS = { lunacy: 26000, tickets: 0, ideal: 0, miss: 5, N: 3, k: 3, EN: 1, ek: 1, allc: 0 };
  const STORE = 'limbus-pity-calc-v1';
  const LIMITS = { N: 8, EN: 6, M: 60 };
  const LET = 'ABCDEFGH', ELET = '가나다라마바';

  const $ = (id) => document.getElementById(id);
  const S = { N: 3, k: 3, EN: 1, ek: 1, allc: 0, idNames: [], egoNames: [] };

  const fmt = (x) => x.toLocaleString('ko-KR');
  const pct = (p, d = 1) => {
    const v = p * 100;
    if (v >= 99.995) return '100';
    if (v > 0 && v < 0.05) return '<0.1';
    return v.toFixed(d);
  };
  const trim = (v) => v.toFixed(4).replace(/\.?0+$/, '');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const idName = (j) => esc((S.idNames[j] || '').trim() || `인격 ${LET[j]}`);
  const egoName = (j) => esc((S.egoNames[j] || '').trim() || `E.G.O ${ELET[j]}`);

  function readInputs() {
    const L = Math.max(0, +$('lunacy').value || 0);
    const T = Math.max(0, Math.floor(+$('tickets').value || 0));
    const I = Math.max(0, Math.floor(+$('ideal').value || 0));
    const M = S.allc ? 0 : Math.max(1, Math.min(LIMITS.M, Math.floor(+$('miss').value || 1)));
    return { L, T, I, M, n: Math.floor(L / LP) + T };
  }

  /* ---------- 저장 ---------- */
  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        lunacy: $('lunacy').value, tickets: $('tickets').value, ideal: $('ideal').value, miss: $('miss').value, S,
      }));
    } catch (e) { /* 저장이 막힌 브라우저에서는 무시 */ }
  }
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (!d) return;
      for (const id of ['lunacy', 'tickets', 'ideal', 'miss']) if (d[id] != null) $(id).value = d[id];
      if (d.S) Object.assign(S, d.S, { idNames: d.S.idNames || [], egoNames: d.S.egoNames || [] });
    } catch (e) { /* 손상된 값은 무시하고 기본값 사용 */ }
  }

  /* ---------- 이름 ---------- */
  // 개수가 바뀔 때만 다시 그려서, 이름을 입력하는 중에 포커스를 잃지 않게 함
  function syncNames(boxId, count, arr, cls, letters, label, example) {
    const box = $(boxId);
    if (box.children.length === count) return;
    box.innerHTML = Array.from({ length: count }, (_, j) =>
      `<label class="nm"><span class="tag ${cls}">${letters[j]}</span>` +
      `<input type="text" id="${boxId}-${j}" data-j="${j}" maxlength="40" placeholder="${label} ${letters[j]} 이름 (예: ${example})" value="${esc(arr[j] || '')}"></label>`
    ).join('');
  }
  function renderTargets() {
    $('targets').innerHTML =
      Array.from({ length: S.k }, (_, j) => `<span class="chip t">${idName(j)}</span>`).join('') +
      Array.from({ length: S.ek }, (_, j) => `<span class="chip te">${egoName(j)}</span>`).join('');
  }

  /* ---------- 메인 렌더 ---------- */
  let model = null;
  function render() {
    const { L, T, I, M, n } = readInputs();
    const { N, k, EN, ek } = S;

    $('nOut').textContent = N; $('kOut').textContent = k;
    $('enOut').textContent = EN; $('ekOut').textContent = ek;
    $('missField').hidden = !!S.allc;
    for (const x of $('allc').querySelectorAll('button')) x.setAttribute('aria-pressed', String(+x.dataset.v === S.allc));
    syncNames('idNames', k, S.idNames, '', LET, '인격', '돈키호테');
    syncNames('egoNames', ek, S.egoNames, 'e', ELET, 'E.G.O', '절망의 기사');
    renderTargets();
    $('lunaHint').textContent = `${fmt(Math.floor(L / LP))}연 분량 · 1회 ${LP} 광기 · 10연 ${fmt(LP * 10)} 광기`;
    save();

    const egoShare = EN ? CONFIG.egoSlot * 100 * (M ? CONFIG.egoPickupShare : 1) / EN : 0;
    $('rateLine').innerHTML = `픽업 인격 1개당 <b>${trim(CONFIG.pickupIdTotal * 100 / N)}%</b>` +
      (EN ? ` · 픽업 E.G.O 1개당 <b>${trim(egoShare)}%</b>부터` : '');

    const total = k + ek;
    const maxN = Math.min(3000, Math.max(800, Math.ceil((n + 250) / 100) * 100));
    const dist = solve({ N, k, EN, ek, M, maxN });
    model = { dist, I, maxN };
    const c = pityCount(I, n);
    const p = total === 0 ? 1 : successProb(dist, n, I);

    // 요약
    $('bigPct').innerHTML = `${pct(p)}<small>%</small>`;
    const what = [k ? `인격 ${k}개` : '', ek ? `E.G.O ${ek}개` : ''].filter(Boolean).join(' + ');
    $('verdict').textContent = total === 0 ? '목표가 비어 있어요' : `${fmt(n)}연 안에 ${what}를 전부 얻을 확률`;
    const left = L % LP;
    $('chips').innerHTML = [
      `<span class="chip">총 ${fmt(n)}연</span>`,
      `<span class="chip">광기 ${fmt(Math.floor(L / LP))}연${T ? ` + 추출권 ${fmt(T)}` : ''}</span>`,
      `<span class="chip gold">천장 ${c}회 (이상성 ${fmt(I + n)})</span>`,
      left ? `<span class="chip">남는 광기 ${fmt(left)}</span>` : '',
    ].join('');
    const w = $('warn');
    w.hidden = !(c >= total && total > 0);
    if (!w.hidden) w.textContent = '천장 횟수가 목표 개수 이상이라 확정이에요.';

    // 남는 개수 분포
    $('distTitle').textContent = `${fmt(n)}연 후 직접 못 뽑고 남는 목표 개수`;
    $('dist').innerHTML = Array.from(dist[n]).map((v, j) =>
      `<div class="drow"><span class="lab">${j}개 남음</span>` +
      `<div class="track"><div class="bar ${j <= c ? 'ok' : 'no'}" style="width:${(v * 100).toFixed(2)}%"></div></div>` +
      `<span class="pct">${pct(v)}%</span></div>`
    ).join('');

    drawCurve(n);

    // 확률별 필요 연차
    const rows = [0.5, 0.8, 0.95].map((goal) => {
      const hit = total === 0 ? 0 : pullsToReach(dist, goal, I);
      if (hit < 0) return `<tr><td>${goal * 100}%</td><td class="num" colspan="3">${fmt(maxN)}연 넘게 필요</td></tr>`;
      const lun = Math.max(0, hit - T) * LP, more = Math.max(0, hit - n);
      return `<tr class="${n >= hit ? 'hit' : ''}"><td>${goal * 100}%</td><td class="num">${fmt(hit)}연</td>` +
        `<td class="num">${fmt(lun)}</td><td class="num">${more ? '+' + fmt(more) + '연' : '도달'}</td></tr>`;
    });
    $('reach').innerHTML = `<thead><tr><th>목표 확률</th><th>필요 연차</th><th>필요 광기</th><th>지금 대비</th></tr></thead><tbody>${rows.join('')}</tbody>`;
    $('sim').innerHTML = '<p class="empty">버튼을 누르면 지금 조건으로 한 번 뽑아 보고, 목표를 채우는 순간 멈춰서 남은 광기를 보여줘요.</p>';
  }

  /* ---------- 곡선 그래프 ---------- */
  const VW = 640, VH = 300, ML = 40, MR = 14, MT = 14, MB = 34;
  function drawCurve(n) {
    const { dist, I, maxN } = model;
    const curveMax = Math.min(maxN, Math.max(600, Math.ceil((n + 100) / 100) * 100));
    const X = (v) => ML + (VW - ML - MR) * v / curveMax;
    const Y = (p) => MT + (VH - MT - MB) * (1 - p);

    let g = '';
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      g += `<line x1="${ML}" x2="${VW - MR}" y1="${Y(t)}" y2="${Y(t)}" stroke="var(--line)" stroke-width="1"/>` +
        `<text x="${ML - 6}" y="${Y(t) + 4}" text-anchor="end">${t * 100}%</text>`;
    }
    const step = curveMax <= 800 ? 100 : 200;
    for (let v = 0; v <= curveMax; v += step) g += `<text x="${X(v)}" y="${VH - 12}" text-anchor="middle">${v}</text>`;
    // 천장이 하나 늘어나는 시점
    for (let v = PC - (I % PC); v <= curveMax; v += PC) {
      if (v > 0) g += `<line x1="${X(v)}" x2="${X(v)}" y1="${MT}" y2="${VH - MB}" stroke="var(--gold)" stroke-width="1" stroke-dasharray="3 4" opacity=".7"/>`;
    }
    let path = '';
    for (let m = 0; m <= curveMax; m++) path += (m ? 'L' : 'M') + `${X(m).toFixed(1)},${Y(successProb(dist, m, I)).toFixed(1)}`;
    const area = path + `L${X(curveMax)},${Y(0)}L${X(0)},${Y(0)}Z`;
    const pn = successProb(dist, Math.min(n, maxN), I);
    const mark = n <= curveMax
      ? `<line x1="${X(n)}" x2="${X(n)}" y1="${MT}" y2="${VH - MB}" stroke="var(--fg)" stroke-width="1" opacity=".35"/>` +
        `<circle cx="${X(n)}" cy="${Y(pn)}" r="5" fill="var(--accent)" stroke="var(--panel)" stroke-width="2"/>` +
        `<text x="${Math.min(X(n) + 8, VW - MR - 70)}" y="${Math.max(Y(pn) - 10, MT + 12)}" style="fill:var(--fg)">지금 ${pct(pn)}%</text>`
      : '';
    $('curve').innerHTML = `${g}<path d="${area}" fill="var(--accent-soft)"/>` +
      `<path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>${mark}` +
      `<g id="hov" visibility="hidden"><line id="hl" y1="${MT}" y2="${VH - MB}" stroke="var(--muted)" stroke-width="1"/>` +
      `<circle id="hc" r="4" fill="var(--accent)" stroke="var(--panel)" stroke-width="2"/></g>` +
      `<rect x="${ML}" y="${MT}" width="${VW - ML - MR}" height="${VH - MT - MB}" fill="transparent" id="hit"/>`;

    const svg = $('curve'), tip = $('tip');
    const move = (ev) => {
      const r = svg.getBoundingClientRect();
      const sx = (ev.clientX - r.left) * VW / r.width;
      const m = Math.max(0, Math.min(curveMax, Math.round((sx - ML) / (VW - ML - MR) * curveMax)));
      const p = successProb(dist, m, I);
      $('hl').setAttribute('x1', X(m)); $('hl').setAttribute('x2', X(m));
      $('hc').setAttribute('cx', X(m)); $('hc').setAttribute('cy', Y(p));
      $('hov').setAttribute('visibility', 'visible');
      tip.hidden = false;
      tip.textContent = `${fmt(m)}연 · 천장 ${pityCount(I, m)}회 · ${pct(p)}%`;
      tip.style.left = Math.max(70, Math.min(r.width - 70, X(m) * r.width / VW)) + 'px';
      tip.style.top = (Y(p) * r.height / VH) + 'px';
    };
    const out = () => { tip.hidden = true; $('hov').setAttribute('visibility', 'hidden'); };
    $('hit').addEventListener('pointermove', move);
    $('hit').addEventListener('pointerdown', move);
    $('hit').addEventListener('pointerleave', out);
  }

  /* ---------- 한 번 돌려보기 ---------- */
  function runSimulation() {
    const { L, T, I, M, n } = readInputs();
    const { N, k, EN, ek } = S;
    const r = simulateOnce({ N, k, EN, ek, M, ideality: I, maxPulls: n });

    const label = (e) => {
      if (e.type === 'id') return { cls: e.dup ? 'dup' : (e.index < k ? 'id' : 'old'), txt: (e.index < k ? idName(e.index) : `다른 픽업 인격 ${LET[e.index]}`) + (e.dup ? ' (중복)' : '') };
      if (e.type === 'ego') return { cls: e.index < ek ? 'ego' : 'old', txt: e.index < ek ? egoName(e.index) : `다른 픽업 E.G.O ${ELET[e.index]}` };
      return { cls: 'old', txt: `기존 E.G.O (${e.index}개 남음)` };
    };
    const missing = [...r.missingIds.map(idName), ...r.missingEgos.map(egoName)];
    const used = missing.slice(0, r.pity), still = missing.slice(r.pity);

    // 추출권을 먼저 쓰고, 나머지를 광기로 뽑았다고 가정
    const usedT = Math.min(T, r.pulls);
    const leftT = T - usedT, leftL = L - (r.pulls - usedT) * LP, leftIdeal = I + r.pulls - used.length * PC;

    const log = r.events.map((e) => { const x = label(e); return `<span class="ev ${x.cls}"><b>${e.t}</b> ${x.txt}</span>`; }).join('') +
      used.map((x) => `<span class="ev pity">천장 → ${x}</span>`).join('');
    const head = r.success ? `성공 · ${fmt(r.pulls)}연째에 달성하고 멈춤` : `실패 · ${fmt(r.pulls)}연을 전부 씀`;
    const detail = `직접 ${k + ek - missing.length}개, 천장 ${used.length}개 사용` + (still.length ? ` · 부족: ${still.join(', ')}` : '');

    $('sim').innerHTML =
      `<div class="simverdict" style="color:${r.success ? 'var(--good)' : 'var(--accent)'}">${head}</div>` +
      `<div class="hint">${detail}</div>` +
      `<div class="chips"><span class="chip gold">남은 광기 ${fmt(leftL)}</span>` +
      (T ? `<span class="chip">남은 추출권 ${fmt(leftT)}</span>` : '') +
      `<span class="chip">남은 이상성 ${fmt(leftIdeal)}</span>` +
      (r.success && n > r.pulls ? `<span class="chip">아낀 연차 ${fmt(n - r.pulls)}연</span>` : '') + `</div>` +
      `<div class="log">${log || '<span class="empty">픽업이 하나도 안 나왔어요.</span>'}</div>`;
  }

  /* ---------- 이벤트 연결 ---------- */
  $('allc').addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    S.allc = +b.dataset.v;
    render();
  });

  // 목표를 픽업 수보다 크게 올리면 픽업 수도 같이 올라감
  const steppers = {
    nUp: () => { S.N = Math.min(LIMITS.N, S.N + 1); },
    nDown: () => { S.N = Math.max(1, S.N - 1); S.k = Math.min(S.k, S.N); },
    kUp: () => { if (S.k < LIMITS.N) { S.k++; S.N = Math.max(S.N, S.k); } },
    kDown: () => { S.k = Math.max(0, S.k - 1); },
    enUp: () => { S.EN = Math.min(LIMITS.EN, S.EN + 1); },
    enDown: () => { S.EN = Math.max(0, S.EN - 1); S.ek = Math.min(S.ek, S.EN); },
    ekUp: () => { if (S.ek < LIMITS.EN) { S.ek++; S.EN = Math.max(S.EN, S.ek); } },
    ekDown: () => { S.ek = Math.max(0, S.ek - 1); },
  };
  for (const [id, fn] of Object.entries(steppers)) $(id).addEventListener('click', () => { fn(); render(); });

  for (const id of ['lunacy', 'tickets', 'ideal', 'miss']) $(id).addEventListener('input', render);
  $('form').addEventListener('submit', (e) => e.preventDefault());
  $('simBtn').addEventListener('click', runSimulation);

  // 광기 빠른 버튼
  $('form').querySelector('.quick').addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    const L = +$('lunacy').value || 0;
    $('lunacy').value = b.dataset.set != null ? +b.dataset.set : Math.max(0, L + (+b.dataset.add));
    render();
  });

  // 이름 입력: 계산은 그대로라 이름 표시만 갱신
  for (const key of ['idNames', 'egoNames']) {
    $(key).addEventListener('input', (ev) => {
      const j = +ev.target.dataset.j;
      if (Number.isNaN(j)) return;
      S[key][j] = ev.target.value;
      renderTargets();
      save();
    });
  }

  $('resetBtn').addEventListener('click', () => {
    for (const id of ['lunacy', 'tickets', 'ideal', 'miss']) $(id).value = DEFAULTS[id];
    Object.assign(S, { N: DEFAULTS.N, k: DEFAULTS.k, EN: DEFAULTS.EN, ek: DEFAULTS.ek, allc: DEFAULTS.allc, idNames: [], egoNames: [] });
    $('idNames').innerHTML = '';
    $('egoNames').innerHTML = '';
    render();
  });

  load();
  render();
})();
