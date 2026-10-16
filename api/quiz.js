/*
 * Time Leak Quiz API (Vercel serverless function)
 *
 * POST /api/quiz  { action: "response", answers }
 *   Saves the anonymous answers and result. No contact details.
 *
 * POST /api/quiz  { action: "lead", responseId, answers, firstName, email, business, consent }
 *   Only after the owner opts in. Saves contact details, creates a ClickUp task,
 *   and emails the full report.
 *
 * Every integration is optional and switched on by environment variables
 * (see QUIZ-SETUP.md). The server re-scores the answers itself and never
 * trusts numbers sent from the browser.
 */
const Quiz = require('../quiz-scoring.js');

const env = (k) => (process.env[k] || '').trim();
const BOOKING_URL = () => env('BOOKING_URL') || 'https://calendly.com/twistandthrivesystems';
const SITE = 'https://twistandthrive.com';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch (e) { return {}; }
}

// ---------- Supabase (REST, service role key stays on the server) ----------
function supabaseReady() { return !!(env('SUPABASE_URL') && env('SUPABASE_SERVICE_ROLE_KEY')); }

async function supabaseInsert(table, row) {
  const r = await fetch(env('SUPABASE_URL').replace(/\/$/, '') + '/rest/v1/' + table, {
    method: 'POST',
    headers: {
      apikey: env('SUPABASE_SERVICE_ROLE_KEY'),
      Authorization: 'Bearer ' + env('SUPABASE_SERVICE_ROLE_KEY'),
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(row)
  });
  if (!r.ok) throw new Error('Supabase ' + table + ' ' + r.status + ': ' + (await r.text()).slice(0, 200));
  const data = await r.json();
  return Array.isArray(data) ? data[0] : data;
}

function resultRow(answers, result) {
  return {
    answers: answers,
    business_type: answers.A1 || null,
    team_size: answers.A2 || null,
    hours_per_week: result.H,
    monthly_cost: Math.round(result.C),
    recoverable_low: result.R.low,
    recoverable_high: result.R.high,
    missed_revenue: result.M ? result.M.value : null,
    friction: result.F,
    tier: result.tier,
    top_leaks: result.topLeaks.map((l) => l.id),
    change_feeling: answers.Q11 || null
  };
}

// ---------- ClickUp ----------
function clickupReady() { return !!(env('CLICKUP_API_TOKEN') && env('CLICKUP_LIST_ID')); }

const FEELING = {
  ready: "Ready, let's go", cautious: 'Curious but cautious',
  team: "Worried my team won't use it", tried: "We've tried tools before and they didn't stick"
};

async function clickupTask(lead, answers, result) {
  const leaks = result.topLeaks.map((l, i) => `${i + 1}. ${l.name}: about ${l.hoursLost} hrs/week`).join('\n') || 'None';
  const description = [
    `**Tier:** ${result.tierInfo.name}`,
    `**Hours lost per week:** ${result.H}`,
    `**Realistically recoverable:** ${Quiz.money(result.R.low)} to ${Quiz.money(result.R.high)} a month`,
    `**Friction score:** ${result.F} / 30`,
    result.M ? `**Possible missed revenue:** about ${Quiz.money(result.M.value)} a month` : null,
    '',
    '**Top time leaks**',
    leaks,
    '',
    `**How they feel about change:** ${FEELING[answers.Q11] || 'Not answered'}`,
    `**Business type:** ${answers.A1 || '-'} · **Team size:** ${answers.A2 || '-'}`,
    '',
    result.callOpener ? `**Call opener:** "${result.callOpener}"` : null,
    '',
    `Email: ${lead.email}`
  ].filter((x) => x !== null).join('\n');

  const r = await fetch(`https://api.clickup.com/api/v2/list/${encodeURIComponent(env('CLICKUP_LIST_ID'))}/task`, {
    method: 'POST',
    headers: { Authorization: env('CLICKUP_API_TOKEN'), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `Quiz lead: ${lead.firstName}${lead.business ? ' (' + lead.business + ')' : ''}`,
      markdown_description: description,
      tags: ['quiz', result.tier]
    })
  });
  if (!r.ok) throw new Error('ClickUp ' + r.status + ': ' + (await r.text()).slice(0, 200));
  return (await r.json()).id;
}

// ---------- Email (Resend) ----------
function emailReady() { return !!(env('RESEND_API_KEY') && env('REPORT_FROM_EMAIL') && env('MAILING_ADDRESS')); }

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function reportEmail(lead, answers, result) {
  const leaks = result.topLeaks;
  const leakHtml = leaks.map((l) => `
    <tr><td style="padding:14px 0;border-bottom:1px solid #e6dfd3">
      <strong style="font-size:16px;color:#2E2318">${esc(l.name)}</strong>
      <span style="color:#6B5C4E"> · could give back about ${l.hoursBack} hrs a week</span>
      <p style="margin:6px 0 0;color:#5C4A3A">${esc(l.instead)}</p>
      <p style="margin:6px 0 0;color:#2E2318"><strong>Try this yourself:</strong> ${esc(l.diy)}</p>
    </td></tr>`).join('');

  const headline = result.H > 0
    ? `Busywork takes about ${Math.round(result.H)} hours a week. You could realistically get back about ${result.hoursBack.low} to ${result.hoursBack.high} of them.`
    : 'Your week is in good shape.';

  const call = result.tierInfo.offerCall
    ? `<p style="margin:24px 0 0;color:#2E2318">If you want to talk it through, I keep 20-minute calls open for exactly this. It's about your business and where your time goes, not a pitch.</p>
       <p style="margin:16px 0 0"><a href="${esc(BOOKING_URL())}" style="display:inline-block;background:#3E8676;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px">Pick a time</a></p>`
    : '';

  const html = `<!doctype html><html><body style="margin:0;background:#FAF7F2;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <p style="margin:0 0 16px;color:#2E2318">Hi ${esc(lead.firstName)},</p>
    <p style="margin:0 0 16px;color:#2E2318">Here's your full Time Leak Quiz report.</p>
    <h1 style="font-family:Georgia,serif;font-weight:500;font-size:24px;line-height:1.3;color:#2E2318;margin:0 0 12px">${esc(headline)}</h1>
    <p style="margin:0;color:#5C4A3A">Busywork is costing roughly ${Quiz.money(result.Cdisplay)} a month. Realistically, about ${Quiz.money(result.R.low)} to ${Quiz.money(result.R.high)} of that is recoverable.</p>
    ${result.M ? `<p style="margin:12px 0 0;color:#5C4A3A">Separately, inquiries that slip through could be worth about ${Quiz.money(result.M.value)} a month in possible missed revenue. That number is not part of the estimate above.</p>` : ''}
    <p style="margin:16px 0 0;color:#2E2318"><strong>${esc(result.tierInfo.name)}.</strong> ${esc(result.tierInfo.verdict)}</p>
    ${leaks.length ? `<h2 style="font-family:Georgia,serif;font-weight:500;font-size:20px;color:#2E2318;margin:28px 0 4px">Your top time leaks</h2><table role="presentation" style="width:100%;border-collapse:collapse">${leakHtml}</table>` : ''}
    ${call}
    <p style="margin:28px 0 0;color:#6B5C4E;font-size:13px">How we calculated this: we added the weekly hours from your answers (${result.rawHours} hrs), took off 20% for overlap between questions, capped it for your team size, then multiplied by your hourly value ($${result.hourly}) and 4.33 weeks a month. The recoverable range is 50% to 70% of that cost, because automation rarely removes all manual work. These are estimates, not guarantees.</p>
    <p style="margin:24px 0 0;color:#2E2318">Gina Harrison<br>Twist &amp; Thrive Systems</p>
    <p style="margin:28px 0 0;color:#6B5C4E;font-size:12px">You're getting this because you asked for your quiz report. To stop hearing from me, reply with "unsubscribe" or use the unsubscribe link in your email app.<br>${esc(env('MAILING_ADDRESS'))}</p>
  </div></body></html>`;

  const text = [
    `Hi ${lead.firstName},`, '', "Here's your full Time Leak Quiz report.", '', headline,
    `Busywork is costing roughly ${Quiz.money(result.Cdisplay)} a month. Realistically, about ${Quiz.money(result.R.low)} to ${Quiz.money(result.R.high)} of that is recoverable.`,
    '', `${result.tierInfo.name}. ${result.tierInfo.verdict}`, '',
    ...leaks.map((l) => `- ${l.name} (could give back about ${l.hoursBack} hrs a week)\n  ${l.instead}\n  Try this yourself: ${l.diy}`),
    result.tierInfo.offerCall ? `\nWant to talk it through? Pick a time: ${BOOKING_URL()}` : '',
    '', 'Gina Harrison', 'Twist & Thrive Systems', '',
    'To stop hearing from me, reply with "unsubscribe".', env('MAILING_ADDRESS')
  ].join('\n');

  return { html, text };
}

async function sendReport(lead, answers, result) {
  const { html, text } = reportEmail(lead, answers, result);
  const from = env('REPORT_FROM_EMAIL');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env('RESEND_API_KEY'), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `Gina Harrison <${from}>`,
      to: [lead.email],
      reply_to: env('REPLY_TO_EMAIL') || from,
      subject: 'Your Time Leak Quiz report',
      html, text,
      headers: { 'List-Unsubscribe': `<mailto:${env('REPLY_TO_EMAIL') || from}?subject=unsubscribe>` }
    })
  });
  if (!r.ok) throw new Error('Resend ' + r.status + ': ' + (await r.text()).slice(0, 200));
  return true;
}

// ---------- Handler ----------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const body = await readBody(req);
  const answers = Quiz.sanitizeAnswers(body.answers);
  if (!Quiz.isComplete(answers)) return json(res, 400, { error: 'Quiz is not complete' });
  const result = Quiz.score(answers);

  if (body.action === 'response') {
    if (!supabaseReady()) return json(res, 200, { id: null, stored: false });
    try {
      const row = await supabaseInsert('quiz_responses', resultRow(answers, result));
      return json(res, 200, { id: row && row.id, stored: true });
    } catch (e) {
      console.error(e.message);
      return json(res, 200, { id: null, stored: false });
    }
  }

  if (body.action === 'lead') {
    if (body.website) return json(res, 200, { ok: true, emailed: false }); // honeypot: bots fill hidden fields
    const lead = {
      firstName: String(body.firstName || '').trim().slice(0, 60),
      email: String(body.email || '').trim().toLowerCase().slice(0, 200),
      business: String(body.business || '').trim().slice(0, 120)
    };
    if (!lead.firstName) return json(res, 400, { error: 'Please add your first name.' });
    if (!EMAIL_RE.test(lead.email)) return json(res, 400, { error: 'Please check your email address.' });
    if (body.consent !== true) return json(res, 400, { error: 'Please tick the box so I can send your report.' });

    const outcome = { stored: false, task: false, emailed: false };
    let responseId = typeof body.responseId === 'string' && /^[0-9a-f-]{36}$/i.test(body.responseId) ? body.responseId : null;

    if (supabaseReady()) {
      try {
        if (!responseId) responseId = (await supabaseInsert('quiz_responses', resultRow(answers, result))).id;
        await supabaseInsert('quiz_leads', {
          response_id: responseId,
          first_name: lead.firstName,
          email: lead.email,
          business_name: lead.business || null,
          consent: true,
          consent_text: 'Send me my report and occasional tips. Unsubscribe anytime.'
        });
        outcome.stored = true;
      } catch (e) { console.error(e.message); }
    }
    if (clickupReady()) {
      try { await clickupTask(lead, answers, result); outcome.task = true; } catch (e) { console.error(e.message); }
    }
    if (emailReady()) {
      try { outcome.emailed = await sendReport(lead, answers, result); } catch (e) { console.error(e.message); }
    }

    if (!outcome.stored && !outcome.task && !outcome.emailed) {
      return json(res, 503, { error: "That didn't go through. You can save or print your results instead." });
    }
    return json(res, 200, Object.assign({ ok: true }, outcome));
  }

  return json(res, 400, { error: 'Unknown action' });
};

// Exported for tests
module.exports.reportEmail = reportEmail;
