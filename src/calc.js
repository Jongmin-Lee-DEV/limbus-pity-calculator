/**
 * 림버스 천장 계산기 - 확률 계산 모듈
 *
 * 브라우저(window.LimbusCalc)와 Node(require)에서 같이 씁니다.
 * 화면 코드와 분리해 두어서 테스트로 따로 검증할 수 있습니다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LimbusCalc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** 확률·재화 설정. 인게임 확률이 바뀌면 여기만 고치면 됩니다. (단위: 1회 추출당 확률) */
  const DEFAULT_CONFIG = Object.freeze({
    pickupIdTotal: 0.0145,      // 픽업 3성 인격 합계 (픽업 인격 수로 나눔)
    pickupIdTotalAllEgo: 0.015, // 모든 E.G.O를 가졌을 때 픽업 3성 인격 합계
    egoSlot: 0.013,             // E.G.O 칸 전체
    egoPickupShare: 0.5,        // 기존 E.G.O가 남아 있을 때 E.G.O 칸 중 픽업 몫
    lunacyPerPull: 130,         // 1회 추출 광기
    pityCost: 200,              // 이상성 교환 1회
  });

  /**
   * 한 번 추출할 때의 확률.
   * @param {number} u 아직 없는 픽업 E.G.O 수
   * @param {number} m 아직 없는 기존 E.G.O 수
   * @param {number} N 픽업 인격 수
   * @returns {{pid:number, pe:number, po:number}}
   *   pid: 픽업 인격 1개당 확률
   *   pe : 픽업 E.G.O 몫 전체 (없는 픽업 E.G.O끼리 균등 분배)
   *   po : 기존 E.G.O 몫 전체
   */
  function rates(u, m, N, config = DEFAULT_CONFIG) {
    const C = config;
    const allOwn = u === 0 && m === 0; // E.G.O를 전부 가졌으면 E.G.O 칸이 사라짐
    const pid = (allOwn ? C.pickupIdTotalAllEgo : C.pickupIdTotal) / N;
    let pe = 0, po = 0;
    if (!allOwn) {
      if (u && m) { pe = C.egoSlot * C.egoPickupShare; po = C.egoSlot - pe; } // 0.65% + 0.65%
      else if (u) pe = C.egoSlot;  // 기존 E.G.O 올컬렉 → 픽업 1.3%
      else po = C.egoSlot;         // 픽업 E.G.O는 다 얻음 → 남은 기존 E.G.O 1.3%
    }
    return { pid, pe, po };
  }

  /**
   * 정확 계산 (동적 계획법).
   * 상태 = (못 뽑은 목표 인격 i, 못 뽑은 목표 E.G.O t, 못 뽑은 비목표 픽업 E.G.O o, 못 가진 기존 E.G.O m)
   * 매 추출마다 각 상태의 확률을 다음 상태로 옮깁니다.
   *
   * @returns {Float64Array[]} dist[n][j] = n회 추출 후 남은 목표 수(i + t)가 j일 확률
   */
  function solve({ N, k, EN, ek, M, maxN, config = DEFAULT_CONFIG }) {
    if (k > N || ek > EN) throw new RangeError('목표 수는 픽업 수보다 클 수 없습니다');
    const eo = EN - ek, T1 = ek + 1, O1 = eo + 1, M1 = M + 1;
    const size = (k + 1) * T1 * O1 * M1;
    const idx = (i, t, o, m) => ((i * T1 + t) * O1 + o) * M1 + m;

    // 상태별 전이 확률은 추출 횟수와 무관하므로 미리 계산
    const R = [];
    for (let u = 0; u <= EN; u++) { R[u] = []; for (let m = 0; m <= M; m++) R[u][m] = rates(u, m, N, config); }

    let cur = new Float64Array(size);
    cur[idx(k, ek, eo, M)] = 1;
    const J = k + ek + 1;
    const snapshot = (a) => {
      const d = new Float64Array(J);
      for (let i = 0; i <= k; i++) for (let t = 0; t <= ek; t++) for (let o = 0; o <= eo; o++) for (let m = 0; m <= M; m++) {
        const p = a[idx(i, t, o, m)];
        if (p) d[i + t] += p;
      }
      return d;
    };

    const dist = new Array(maxN + 1);
    dist[0] = snapshot(cur);
    for (let n = 1; n <= maxN; n++) {
      const nx = new Float64Array(size);
      for (let i = 0; i <= k; i++) for (let t = 0; t <= ek; t++) for (let o = 0; o <= eo; o++) for (let m = 0; m <= M; m++) {
        const p = cur[idx(i, t, o, m)];
        if (!p) continue;
        const u = t + o, r = R[u][m];
        const a = i * r.pid;                    // 아직 없는 목표 인격 중 하나
        const pt = u ? r.pe * t / u : 0;        // 목표 픽업 E.G.O 중 하나
        const pn = u ? r.pe * o / u : 0;        // 비목표 픽업 E.G.O 중 하나
        if (a) nx[idx(i - 1, t, o, m)] += p * a;
        if (pt) nx[idx(i, t - 1, o, m)] += p * pt;
        if (pn) nx[idx(i, t, o - 1, m)] += p * pn;
        if (r.po) nx[idx(i, t, o, m - 1)] += p * r.po;
        nx[idx(i, t, o, m)] += p * (1 - a - pt - pn - r.po); // 그 외 (중복, 2성 등)
      }
      cur = nx;
      dist[n] = snapshot(cur);
    }
    return dist;
  }

  /** 천장 횟수: (현재 이상성 + 추출 수) / 200 */
  function pityCount(ideality, pulls, config = DEFAULT_CONFIG) {
    return Math.floor((ideality + pulls) / config.pityCost);
  }

  /** n회 추출 후 성공 확률: 남은 목표 수가 천장 횟수 이하일 확률 */
  function successProb(dist, n, ideality, config = DEFAULT_CONFIG) {
    const c = pityCount(ideality, n, config);
    let s = 0;
    for (let j = 0; j < dist[n].length && j <= c; j++) s += dist[n][j];
    return s;
  }

  /** 성공 확률이 target 이상이 되는 가장 작은 추출 수. 없으면 -1 */
  function pullsToReach(dist, target, ideality, config = DEFAULT_CONFIG) {
    for (let n = 0; n < dist.length; n++) if (successProb(dist, n, ideality, config) >= target) return n;
    return -1;
  }

  /**
   * 한 번 직접 뽑아 보기 (몬테카를로 1회).
   * stopWhenDone이면 남은 목표를 천장으로 메울 수 있게 되는 순간 멈춥니다.
   * @returns {{pulls:number, success:boolean, events:object[], missingIds:number[], missingEgos:number[], pity:number}}
   */
  function simulateOnce({ N, k, EN, ek, M, ideality = 0, maxPulls, stopWhenDone = true, rng = Math.random, config = DEFAULT_CONFIG }) {
    const have = new Array(N).fill(false), haveE = new Array(EN).fill(false);
    let m = M;
    const events = [];
    const missing = () => {
      let c = 0;
      for (let j = 0; j < k; j++) if (!have[j]) c++;
      for (let j = 0; j < ek; j++) if (!haveE[j]) c++;
      return c;
    };
    let t = 0;
    while (t < maxPulls && !(stopWhenDone && missing() <= pityCount(ideality, t, config))) {
      t++;
      const un = [];
      for (let j = 0; j < EN; j++) if (!haveE[j]) un.push(j);
      const r = rates(un.length, m, N, config);
      let x = rng();
      if (x < r.pid * N) {
        const j = Math.min(N - 1, Math.floor(x / r.pid));
        events.push({ t, type: 'id', index: j, dup: have[j] });
        have[j] = true;
        continue;
      }
      x -= r.pid * N;
      if (x < r.pe) {
        const j = un[Math.min(un.length - 1, Math.floor(x / r.pe * un.length))];
        events.push({ t, type: 'ego', index: j, dup: false });
        haveE[j] = true;
        continue;
      }
      x -= r.pe;
      if (x < r.po) { m--; events.push({ t, type: 'old', index: m, dup: false }); }
    }
    const missingIds = [], missingEgos = [];
    for (let j = 0; j < k; j++) if (!have[j]) missingIds.push(j);
    for (let j = 0; j < ek; j++) if (!haveE[j]) missingEgos.push(j);
    const pity = pityCount(ideality, t, config);
    return { pulls: t, success: missingIds.length + missingEgos.length <= pity, events, missingIds, missingEgos, pity };
  }

  return { DEFAULT_CONFIG, rates, solve, pityCount, successProb, pullsToReach, simulateOnce };
});
