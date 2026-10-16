// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const Q = require('../quiz-scoring.js');

// Worked example from the PRD: a 4-person wellness practice
const worked = {
  A1: 'wellness', A2: 'small', A3: 40,
  Q1: 2,  // 3-5 hrs -> 4h, 2
  Q2: 2,  // depends on who remembers -> 3h, 2
  Q3: 2,  // texts -> 3h, 2
  Q4: 2,  // one by one -> 3h, 2
  Q5: 1,  // checklist -> 1h, 1
  Q6: 1,  // few times a week -> 1h, 1
  Q7: 2,  // pull it together -> 2h, 2
  Q8: 1,  // 4-6 tools -> 1
  Q9: 2,  // things stall -> 2
  Q10: 2, // 4-7 evening hrs -> 5h, 2
  Q11: 'cautious', Q12: 'clients',
  R1: 12, R2: 1000
};

test('PRD worked example matches', () => {
  const r = Q.score(worked);
  assert.equal(r.rawHours, 22);
  assert.equal(r.H, 17.6);
  assert.equal(r.Cdisplay, 3050);          // "about $3,050 a month"
  assert.deepEqual(r.R, { low: 1500, high: 2100 });
  assert.equal(r.M.value, 240);            // "about $240 a month"
  assert.equal(r.F, 17);
  assert.equal(r.tier, 'timeback');
});

test('top leaks sorted by hours, ties broken by friction', () => {
  const r = Q.score(worked);
  assert.deepEqual(r.topLeaks.map(l => l.id), ['Q10', 'Q1', 'Q2']);
  assert.equal(r.topLeaks[0].hoursBack, 3); // 5 x 0.6
});

test('missed revenue is never part of the headline range', () => {
  const r = Q.score(worked);
  const withoutM = Q.score(Object.assign({}, worked, { R1: undefined, R2: undefined }));
  assert.deepEqual(r.R, withoutM.R);
  assert.equal(withoutM.M, null);
});

test('missed revenue is capped at $10,000', () => {
  const r = Q.score(Object.assign({}, worked, { Q2: 3, R1: 60, R2: 10000 }));
  assert.equal(r.M.value, 10000);
  assert.equal(r.M.capped, true);
});

test('team size caps hours', () => {
  const all3 = { A2: 'solo', A3: 40 };
  ['Q1','Q2','Q3','Q4','Q5','Q6','Q7','Q8','Q9','Q10'].forEach(id => { all3[id] = 3; });
  const r = Q.score(all3);
  assert.equal(r.rawHours, 42);
  assert.equal(r.H, 15); // 33.6 capped at 15 for "just me"
  assert.equal(r.F, 30);
});

test('everything in good shape gets the running smoothly tier', () => {
  const good = { A2: 'small', A3: 60 };
  ['Q1','Q2','Q3','Q4','Q5','Q6','Q7','Q8','Q9','Q10'].forEach(id => { good[id] = 0; });
  const r = Q.score(good);
  assert.equal(r.H, 0);
  assert.equal(r.tier, 'smooth');
  assert.equal(r.topLeaks.length, 0);
  assert.equal(r.tierInfo.offerCall, false);
});

test('tune-up tier by hours alone', () => {
  const a = { A2: 'small', A3: 40, Q1: 2, Q3: 2, Q8: 0, Q9: 0 }; // 7h raw -> 5.6h; F=4
  assert.equal(Q.score(a).tier, 'smooth');
  const b = Object.assign({}, a, { Q6: 1 }); // 8h raw -> 6.4h
  assert.equal(Q.score(b).tier, 'tuneup');
});

test('revenue questions only appear when inquiries slip', () => {
  const ids = a => Q.visibleQuestions(a).map(q => q.id);
  assert.ok(!ids({ Q2: 0 }).includes('R1'));
  assert.ok(!ids({ Q2: 1 }).includes('R1'));
  assert.ok(ids({ Q2: 2 }).includes('R1'));
  assert.ok(ids({ Q2: 3 }).includes('R2'));
});

test('fifteen core questions plus two optional', () => {
  const core = Q.QUESTIONS.filter(q => q.type !== 'revenue');
  const optional = Q.QUESTIONS.filter(q => q.type === 'revenue');
  assert.equal(core.length, 15);
  assert.equal(optional.length, 2);
});

test('sanitizeAnswers drops unknown keys and values', () => {
  const clean = Q.sanitizeAnswers({ Q1: 2, Q2: 99, evil: 'x', A3: '40', A1: 'wellness' });
  assert.deepEqual(clean, { Q1: 2, A1: 'wellness' });
});

test('same answers always give the same result', () => {
  assert.deepEqual(Q.score(worked), Q.score(JSON.parse(JSON.stringify(worked))));
});
