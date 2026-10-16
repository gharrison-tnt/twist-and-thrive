// Run with: node --test tests/quiz-api.test.js
// Exercises api/quiz.js with fetch mocked, so no real services are called.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');

const handler = require('../api/quiz.js');

const answers = {
  A1: 'wellness', A2: 'small', A3: 40,
  Q1: 2, Q2: 2, Q3: 2, Q4: 2, Q5: 1, Q6: 1, Q7: 2, Q8: 1, Q9: 2, Q10: 2,
  Q11: 'cautious', Q12: 'clients', R1: 12, R2: 1000
};

function call(body) {
  const req = Readable.from([JSON.stringify(body)]);
  req.method = 'POST';
  return new Promise((resolve) => {
    const res = {
      statusCode: 200, headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      end(s) { resolve({ status: this.statusCode, body: JSON.parse(s) }); }
    };
    handler(req, res);
  });
}

function withEnv(vars, fn) {
  const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'CLICKUP_API_TOKEN', 'CLICKUP_LIST_ID', 'RESEND_API_KEY', 'REPORT_FROM_EMAIL', 'MAILING_ADDRESS'];
  const old = {};
  keys.forEach((k) => { old[k] = process.env[k]; delete process.env[k]; });
  Object.assign(process.env, vars);
  return fn().finally(() => keys.forEach((k) => { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; }));
}

test('response without Supabase configured does not fail the quiz', () => withEnv({}, async () => {
  const r = await call({ action: 'response', answers });
  assert.equal(r.status, 200);
  assert.equal(r.body.stored, false);
}));

test('incomplete quiz is rejected', () => withEnv({}, async () => {
  const r = await call({ action: 'response', answers: { Q1: 2 } });
  assert.equal(r.status, 400);
}));

test('lead requires consent and a valid email', () => withEnv({}, async () => {
  let r = await call({ action: 'lead', answers, firstName: 'Ana', email: 'nope', consent: true });
  assert.equal(r.status, 400);
  r = await call({ action: 'lead', answers, firstName: 'Ana', email: 'ana@example.com', consent: false });
  assert.equal(r.status, 400);
}));

test('lead with nothing configured returns 503 so the page shows the fallback', () => withEnv({}, async () => {
  const r = await call({ action: 'lead', answers, firstName: 'Ana', email: 'ana@example.com', consent: true });
  assert.equal(r.status, 503);
}));

test('lead with all services configured saves, creates a task, and emails', () => withEnv({
  SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k',
  CLICKUP_API_TOKEN: 't', CLICKUP_LIST_ID: '123',
  RESEND_API_KEY: 'r', REPORT_FROM_EMAIL: 'gina@example.com', MAILING_ADDRESS: 'PO Box 1, Boulder, CO'
}, async () => {
  const calls = [];
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body) });
    const id = '11111111-1111-1111-1111-111111111111';
    return { ok: true, status: 200, json: async () => (url.includes('supabase') ? [{ id }] : { id: 'task1' }), text: async () => '' };
  };
  try {
    const r = await call({ action: 'lead', answers, firstName: 'Ana', email: 'Ana@Example.com', business: 'Calm Co', consent: true });
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.stored, r.body.task, r.body.emailed], [true, true, true]);
    const leadRow = calls.find((c) => c.url.endsWith('/quiz_leads')).body;
    assert.equal(leadRow.email, 'ana@example.com');
    const respRow = calls.find((c) => c.url.endsWith('/quiz_responses')).body;
    assert.equal(respRow.hours_per_week, 17.6);           // server re-scored, did not trust the browser
    assert.equal(respRow.tier, 'timeback');
    const task = calls.find((c) => c.url.includes('clickup')).body;
    assert.match(task.markdown_description, /Curious but cautious/);
    const email = calls.find((c) => c.url.includes('resend')).body;
    assert.match(email.html, /about 18 hours a week/);
    assert.match(email.html, /PO Box 1, Boulder, CO/);
  } finally { global.fetch = realFetch; }
}));

test('honeypot submissions are silently ignored', () => withEnv({}, async () => {
  const r = await call({ action: 'lead', answers, firstName: 'Bot', email: 'b@b.co', consent: true, website: 'spam' });
  assert.equal(r.status, 200);
  assert.equal(r.body.emailed, false);
}));
