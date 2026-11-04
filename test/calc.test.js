// 실행: node --test   (Node 18 이상, 추가 설치 없음)
const test = require('node:test');
const assert = require('node:assert/strict');
const { rates, solve, successProb, simulateOnce, DEFAULT_CONFIG: C } = require('../src/calc.js');

const close = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b} (허용 ${eps})`);

// 시드를 고정한 난수 (테스트 결과가 매번 같게)
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('E.G.O 칸 확률 규칙', () => {
  // 기존 E.G.O가 남아 있으면 픽업 0.65% + 기존 0.65%
  let r = rates(1, 5, 3);
  close(r.pe, 0.0065, 1e-12, '픽업 E.G.O'); close(r.po, 0.0065, 1e-12, '기존 E.G.O');
  // 기존 올컬렉이면 픽업 1.3%
  r = rates(1, 0, 3);
  close(r.pe, 0.013, 1e-12, '올컬렉 픽업'); assert.equal(r.po, 0);
  // 픽업 E.G.O를 얻고 기존만 남으면 기존 1.3%
  r = rates(0, 3, 3);
  assert.equal(r.pe, 0); close(r.po, 0.013, 1e-12, '남은 기존');
  // 전부 가지면 E.G.O 칸이 사라지고 픽업 인격 합계 1.5%
  r = rates(0, 0, 4);
  close(r.pid * 4, 0.015, 1e-12, '픽업 인격 합계'); assert.equal(r.pe + r.po, 0);
});

test('검증값과 일치 (인격 4 + E.G.O 1)', () => {
  const notAll = solve({ N: 4, k: 4, EN: 1, ek: 1, M: 5, maxN: 600 });
  close(successProb(notAll, 200, 0), 0.264, 0.0005, '기존 5개 남음, 200연');
  close(successProb(notAll, 400, 0), 0.946, 0.0005, '기존 5개 남음, 400연');
  close(successProb(notAll, 600, 0), 0.9998, 0.00005, '기존 5개 남음, 600연');
  const all = solve({ N: 4, k: 4, EN: 1, ek: 1, M: 0, maxN: 600 });
  close(successProb(all, 200, 0), 0.329, 0.0005, '올컬렉, 200연');
  close(successProb(all, 400, 0), 0.962, 0.0005, '올컬렉, 400연');
  close(successProb(all, 600, 0), 0.9999, 0.00005, '올컬렉, 600연');
});

test('닫힌 식과 일치 (E.G.O 올컬렉, 천장 전)', () => {
  // 인격 1개: 1 - (1 - 1.5%)^n
  const one = solve({ N: 1, k: 1, EN: 0, ek: 0, M: 0, maxN: 199 });
  for (const n of [1, 50, 199]) close(successProb(one, n, 0), 1 - (1 - C.pickupIdTotalAllEgo) ** n, 1e-12, `인격 1개 ${n}연`);
  // 인격 2개 둘 다: 포함배제 1 - 2(1-p)^n + (1-2p)^n
  const p = C.pickupIdTotalAllEgo / 2;
  const two = solve({ N: 2, k: 2, EN: 0, ek: 0, M: 0, maxN: 150 });
  close(successProb(two, 150, 0), 1 - 2 * (1 - p) ** 150 + (1 - 2 * p) ** 150, 1e-12, '인격 2개 150연');
});

test('천장: 이상성 200이 쌓이면 1개를 메움', () => {
  const d = solve({ N: 1, k: 1, EN: 0, ek: 0, M: 0, maxN: 200 });
  assert.ok(successProb(d, 199, 0) < 1);
  close(successProb(d, 200, 0), 1, 1e-12, '200연');
  close(successProb(d, 1, 199), 1, 1e-12, '이상성 199 + 1연');
});

test('확률 분포의 합은 항상 1', () => {
  const d = solve({ N: 5, k: 3, EN: 3, ek: 2, M: 4, maxN: 500 });
  for (const n of [0, 1, 137, 500]) close(d[n].reduce((a, b) => a + b, 0), 1, 1e-9, `${n}연`);
});

test('몬테카를로 시뮬레이션과 정확 계산이 일치', () => {
  const cases = [
    { N: 4, k: 4, EN: 1, ek: 1, M: 5, n: 200 },
    { N: 3, k: 3, EN: 1, ek: 1, M: 0, n: 200 },
    { N: 4, k: 2, EN: 2, ek: 2, M: 3, n: 300, ideality: 50 },
  ];
  const trials = 20000;
  cases.forEach((c, ci) => {
    const exact = successProb(solve({ ...c, maxN: c.n }), c.n, c.ideality || 0);
    const rng = mulberry32(1234 + ci);
    let ok = 0;
    for (let i = 0; i < trials; i++) {
      if (simulateOnce({ ...c, ideality: c.ideality || 0, maxPulls: c.n, stopWhenDone: false, rng }).success) ok++;
    }
    const mc = ok / trials;
    const sd = Math.sqrt(exact * (1 - exact) / trials);
    close(mc, exact, 4 * sd, `사례 ${ci + 1}`); // 4 표준편차 안
  });
});

test('한 번 돌려보기: 목표를 채우면 멈춤', () => {
  // 이상성 199에서 시작하면 1연째에 천장이 생겨 바로 달성
  const r = simulateOnce({ N: 1, k: 1, EN: 0, ek: 0, M: 0, ideality: 199, maxPulls: 500, rng: mulberry32(7) });
  assert.equal(r.pulls, 1);
  assert.equal(r.success, true);
});
