/*
 * Time Leak Quiz: questions and scoring.
 *
 * One file, used in two places:
 *   - the browser (quiz.html loads it with <script src="/quiz-scoring.js">)
 *   - the server (api/quiz.js requires it to rebuild the result for the report email)
 *
 * All math lives here. Same answers always give the same result.
 * Hour values are conservative v1 planning estimates from the PRD.
 * Recalibrate after the first 50 completions and the first 3 sprints.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TimeLeakQuiz = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- Constants (from the PRD) ----------
  var OVERLAP_FACTOR = 0.8;       // removes double counting between questions
  var WEEKS_PER_MONTH = 4.33;
  var RECOVER_LOW = 0.5;          // automation rarely removes all manual work
  var RECOVER_HIGH = 0.7;
  var LEAK_RECOVER = 0.6;         // per-leak "could give back"
  var CLOSE_RATE = 0.2;           // assumed close rate for missed revenue
  var MISSED_REVENUE_CAP = 10000;
  var DEFAULT_HOURLY = 40;        // used only if A3 is somehow missing
  var TEAM_CAPS = { solo: 15, small: 30, mid: 60, large: 100 };

  // ---------- Questions ----------
  // type: 'about' (not scored), 'scored', 'feel' (not scored), 'revenue' (optional)
  // Each scored option: h = hours lost per week (team-wide), f = friction points 0-3
  var QUESTIONS = [
    { id: 'A1', type: 'about', part: 'About you',
      text: 'What kind of business do you run?',
      options: [
        { v: 'service', label: 'Service practice' },
        { v: 'wellness', label: 'Wellness or health' },
        { v: 'retreats', label: 'Retreats or events' },
        { v: 'trades', label: 'Trades' },
        { v: 'retail', label: 'Retail' },
        { v: 'agency', label: 'Agency' },
        { v: 'nonprofit', label: 'Nonprofit' },
        { v: 'other', label: 'Something else' }
      ] },
    { id: 'A2', type: 'about', part: 'About you',
      text: 'How many people work in the business, including you?',
      options: [
        { v: 'solo', label: 'Just me' },
        { v: 'small', label: '2 to 5' },
        { v: 'mid', label: '6 to 15' },
        { v: 'large', label: '16 to 50' }
      ] },
    { id: 'A3', type: 'about', part: 'About you',
      text: "What's an hour of your team's time worth, roughly?",
      help: "A rough guess is fine. If it's mostly you, think about what an hour of your own time is worth.",
      options: [
        { v: 25, label: 'About $25' },
        { v: 40, label: 'About $40' },
        { v: 60, label: 'About $60' },
        { v: 100, label: '$100 or more (my own time)' }
      ] },

    { id: 'Q1', type: 'scored', part: 'Where the week goes',
      text: 'How often does someone re-type the same information into more than one place?',
      options: [
        { v: 0, label: 'Rarely', h: 0, f: 0 },
        { v: 1, label: '1 to 2 hours a week', h: 1.5, f: 1 },
        { v: 2, label: '3 to 5 hours a week', h: 4, f: 2 },
        { v: 3, label: '6 or more hours a week', h: 8, f: 3 }
      ] },
    { id: 'Q2', type: 'scored', part: 'Where the week goes',
      text: 'When a new inquiry comes in, what happens next?',
      options: [
        { v: 0, label: 'An automatic reply and follow-up', h: 0, f: 0 },
        { v: 1, label: "We have a process, but it's manual", h: 2, f: 1 },
        { v: 2, label: 'Depends on who remembers', h: 3, f: 2 },
        { v: 3, label: 'Some slip through the cracks', h: 4, f: 3 }
      ] },
    { id: 'Q3', type: 'scored', part: 'Where the week goes',
      text: 'How do appointments and reminders get scheduled?',
      notAlone: "Customers expect faster answers than ever. If you're juggling replies and scheduling by hand, you're doing what most small business owners are doing right now.",
      options: [
        { v: 0, label: 'Online booking with automatic reminders', h: 0, f: 0 },
        { v: 1, label: 'Online booking, manual reminders', h: 1, f: 1 },
        { v: 2, label: 'Back-and-forth emails or texts', h: 3, f: 2 },
        { v: 3, label: "It's a bit of chaos", h: 4, f: 3 }
      ] },
    { id: 'Q4', type: 'scored', part: 'Where the week goes',
      text: 'How does invoicing and getting paid work?',
      notAlone: 'Chasing payments is one of the tasks owners most wish they could hand off.',
      options: [
        { v: 0, label: 'Automatic invoices and payments', h: 0, f: 0 },
        { v: 1, label: 'I batch them by hand', h: 1.5, f: 1 },
        { v: 2, label: 'One by one, plus chasing late payers', h: 3, f: 2 },
        { v: 3, label: 'Often late, and it hurts cash flow', h: 5, f: 3 }
      ] },
    { id: 'Q5', type: 'scored', part: 'Where the week goes',
      text: 'When a new client starts, how do they get set up?',
      options: [
        { v: 0, label: 'Same welcome steps, sent automatically', h: 0, f: 0 },
        { v: 1, label: 'A checklist we follow by hand', h: 1, f: 1 },
        { v: 2, label: "It's a little different every time", h: 2.5, f: 2 },
        { v: 3, label: 'Things sometimes get missed', h: 4, f: 3 }
      ] },
    { id: 'Q6', type: 'scored', part: 'Where the week goes',
      text: 'How often do you answer the same questions from clients or staff?',
      options: [
        { v: 0, label: 'Rarely', h: 0, f: 0 },
        { v: 1, label: 'A few times a week', h: 1, f: 1 },
        { v: 2, label: 'Daily', h: 3, f: 2 },
        { v: 3, label: 'Constantly', h: 5, f: 3 }
      ] },
    { id: 'Q7', type: 'scored', part: 'Where the week goes',
      text: 'How do you know how the business is doing this month?',
      options: [
        { v: 0, label: 'A dashboard I trust', h: 0, f: 0 },
        { v: 1, label: 'A spreadsheet I update monthly', h: 1, f: 1 },
        { v: 2, label: 'I pull it together when I need it', h: 2, f: 2 },
        { v: 3, label: "Honestly, I'm not sure", h: 3, f: 3 }
      ] },
    { id: 'Q8', type: 'scored', part: 'Where the week goes',
      text: "How many apps or tools does your team use that don't talk to each other?",
      options: [
        { v: 0, label: '1 to 3', h: 0, f: 0 },
        { v: 1, label: '4 to 6', h: 0, f: 1 },
        { v: 2, label: '7 to 10', h: 0, f: 2 },
        { v: 3, label: "I've lost count", h: 0, f: 3 }
      ] },
    { id: 'Q9', type: 'scored', part: 'Where the week goes',
      text: 'If one key person were out for a week, what would happen?',
      notAlone: "When everything lives in one person's head, it's not a flaw. It's what happens when a business grows faster than its systems.",
      options: [
        { v: 0, label: 'It runs fine', h: 0, f: 0 },
        { v: 1, label: 'Some delays', h: 0, f: 1 },
        { v: 2, label: 'Things stall', h: 0, f: 2 },
        { v: 3, label: 'Only I know how things work', h: 0, f: 3 }
      ] },
    { id: 'Q10', type: 'scored', part: 'Where the week goes',
      text: 'How many evening or weekend hours do you spend on admin?',
      notAlone: 'Evenings and weekends spent on admin are the hidden cost of doing more with less.',
      options: [
        { v: 0, label: 'None', h: 0, f: 0 },
        { v: 1, label: '1 to 3 hours', h: 2, f: 1 },
        { v: 2, label: '4 to 7 hours', h: 5, f: 2 },
        { v: 3, label: '8 or more hours', h: 9, f: 3 }
      ] },

    { id: 'Q11', type: 'feel', part: 'How you feel about change',
      text: 'If something could give you back 5 hours a week, how would you feel?',
      options: [
        { v: 'ready', label: "Ready, let's go" },
        { v: 'cautious', label: 'Curious but cautious' },
        { v: 'team', label: "Worried my team won't use it" },
        { v: 'tried', label: "We've tried tools before and they didn't stick" }
      ] },
    { id: 'Q12', type: 'feel', part: 'How you feel about change',
      text: 'What would you do with 10 extra hours a week?',
      options: [
        { v: 'clients', label: 'More clients' },
        { v: 'experience', label: 'Better client experience' },
        { v: 'rest', label: 'Rest and family time' },
        { v: 'grow', label: 'Grow or launch something new' }
      ] },

    { id: 'R1', type: 'revenue', part: 'One more thing', optional: true,
      showIf: function (a) { return a.Q2 === 2 || a.Q2 === 3; },
      text: 'About how many new inquiries do you get a month?',
      options: [
        { v: 3, label: '0 to 5' },
        { v: 12, label: '6 to 20' },
        { v: 35, label: '21 to 50' },
        { v: 60, label: 'More than 50' }
      ] },
    { id: 'R2', type: 'revenue', part: 'One more thing', optional: true,
      showIf: function (a) { return a.Q2 === 2 || a.Q2 === 3; },
      text: "What's a typical new client worth to you?",
      options: [
        { v: 300, label: 'Under $500' },
        { v: 1000, label: '$500 to $2,000' },
        { v: 5000, label: '$2,000 to $10,000' },
        { v: 10000, label: 'More than $10,000' }
      ] }
  ];

  // Questions that carry hours and can appear as a "time leak"
  var HOUR_QUESTIONS = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q10'];
  var FRICTION_QUESTIONS = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8', 'Q9', 'Q10'];

  // ---------- Time leaks and fixes ----------
  var LEAKS = {
    Q1: { name: 'Copy-paste busywork',
      instead: 'Instead of typing the same details into three places, a client is entered once and everything else fills in.',
      fix: 'Connect your tools so information is entered once',
      diy: "List every place you type a client's name. Pick one to be the source.",
      level: 'Level 2: Dashboard',
      link: '/pricing#level-2' },
    Q2: { name: 'Leads slipping through',
      instead: 'Instead of hoping someone remembers, every new inquiry gets a reply right away and a nudge if it goes quiet.',
      fix: 'An instant auto-reply, follow-up reminders, and a simple pipeline',
      diy: 'Save a reply template, and block 10 minutes a day for follow-up.',
      level: 'Level 1: Intake',
      link: '/pricing#level-1',
      benchmark: { text: 'One booking platform found about 40% of bookings were made before 9am or after 7pm, when most businesses are closed.', source: 'MyTime booking data, 2014', url: 'https://wordpress.mytime.com/?p=3968' } },
    Q3: { name: 'Scheduling back-and-forth',
      instead: 'Instead of texting back and forth, clients pick a time online and get reminders automatically.',
      fix: 'Online booking with automatic confirmations and reminders',
      diy: 'Turn on reminders in the booking tool you already pay for.',
      level: 'Level 4: Automate',
      link: '/pricing#level-4',
      benchmark: { text: 'Across 21 clinic studies, people who got reminders were 25% less likely to miss an appointment.', source: 'BMJ Open, 2016', url: 'https://pubmed.ncbi.nlm.nih.gov/27798006/' } },
    Q4: { name: 'Chasing payments',
      instead: 'Instead of chasing late payers, invoices go out with a pay link and polite reminders send themselves.',
      fix: 'Automatic invoices, payment links, and polite reminders',
      diy: 'Add a payment link to every invoice.',
      level: 'Payments add-on',
      link: '/pricing#add-ons',
      benchmark: { text: 'One Intuit study found that small businesses taking payments online got paid about 15 days sooner.', source: 'Intuit, 2016', url: 'https://www.businesswire.com/news/home/20161017006548/en/Intuit-Offers-Apple-Pay-on-the-Invoice-to-Help-Small-Businesses-Increase-Cash-Flow' } },
    Q5: { name: 'Bumpy client onboarding',
      instead: 'Instead of starting from scratch each time, every new client gets the same forms, info, and next steps on day one.',
      fix: 'A welcome sequence that sends forms, info, and next steps automatically',
      diy: 'Write your welcome steps down once, as a checklist.',
      level: 'Level 4: Automate',
      link: '/pricing#level-4' },
    Q6: { name: 'Answering the same questions',
      instead: 'Instead of answering the same question again, people find the answer on your site or in a saved reply.',
      fix: 'An FAQ page and saved answers',
      diy: 'Keep a shared doc of your 10 most common answers.',
      level: 'Website add-on',
      link: '/pricing#add-ons' },
    Q7: { name: 'Flying blind on numbers',
      instead: 'Instead of pulling numbers together when you need them, the few that matter are on one page and update on their own.',
      fix: 'A simple dashboard that updates itself',
      diy: 'Pick 3 numbers and check them every Monday.',
      level: 'Level 5: Full system',
      link: '/pricing#level-5' },
    Q10: { name: 'Admin stealing your evenings',
      instead: 'Instead of catching up at night, the repeat tasks run during the day without you.',
      fix: 'Automating the repeat tasks above',
      diy: 'Batch admin into two set blocks a week.',
      level: 'Level 4: Automate',
      link: '/pricing#level-4' }
  };

  var TIERS = {
    smooth: {
      name: 'Running smoothly',
      verdict: 'Your systems are working for you. Here are a few small tweaks to keep it that way.',
      offerCall: false
    },
    tuneup: {
      name: 'Ready for a tune-up',
      verdict: "You've got a solid base, with a few leaks costing you real time.",
      offerCall: true
    },
    timeback: {
      name: 'Time to get your time back',
      verdict: "Your business has outgrown its duct tape. That's a sign of growth, and it's very fixable.",
      offerCall: true
    }
  };

  var Q12_PHRASE = {
    clients: 'more clients',
    experience: 'a better client experience',
    rest: 'rest and family',
    grow: 'growing or launching something new'
  };

  var Q11_MESSAGE = {
    ready: "You said you're ready. Start with the biggest leak below and work down.",
    cautious: 'Cautious makes sense. Pick the smallest fix on this list and see how it feels before changing anything else.',
    team: "That's a fair worry. The changes that stick are the ones your team barely has to think about, so start with one that happens behind the scenes.",
    tried: 'That happens a lot. A tool tends to stick when it is set up around how your week actually runs, one piece at a time.'
  };

  var CALL_OPENER = {
    Q1: 're-typing the same information',
    Q2: 'following up on new inquiries',
    Q3: 'scheduling and reminders',
    Q4: 'invoicing and chasing payments',
    Q5: 'getting new clients set up',
    Q6: 'answering the same questions',
    Q7: 'keeping track of your numbers',
    Q10: 'admin on evenings and weekends'
  };

  // ---------- Helpers ----------
  function byId(id) {
    for (var i = 0; i < QUESTIONS.length; i++) if (QUESTIONS[i].id === id) return QUESTIONS[i];
    return null;
  }
  function optionFor(id, value) {
    var q = byId(id);
    if (!q) return null;
    for (var i = 0; i < q.options.length; i++) if (q.options[i].v === value) return q.options[i];
    return null;
  }
  function round1(n) { return Math.round(n * 10) / 10; }
  function roundTo(n, step) { return Math.round(n / step) * step; }

  // Which questions should be shown, given the answers so far
  function visibleQuestions(answers) {
    answers = answers || {};
    return QUESTIONS.filter(function (q) { return !q.showIf || q.showIf(answers); });
  }

  // ---------- Scoring ----------
  function score(answers) {
    answers = answers || {};

    // 1. Hours lost per week
    var raw = 0;
    var leakList = [];
    HOUR_QUESTIONS.forEach(function (id) {
      var o = optionFor(id, answers[id]);
      var h = o ? o.h : 0;
      var f = o ? o.f : 0;
      raw += h;
      if (h > 0) leakList.push({ id: id, hours: h, friction: f });
    });
    var cap = TEAM_CAPS[answers.A2] || TEAM_CAPS.solo;
    var H = Math.min(OVERLAP_FACTOR * raw, cap);
    H = round1(H);

    // 2. Monthly cost
    var hourly = typeof answers.A3 === 'number' ? answers.A3 : DEFAULT_HOURLY;
    var C = H * hourly * WEEKS_PER_MONTH;

    // 3. Realistically recoverable (headline), rounded to nearest $100
    var R = { low: roundTo(RECOVER_LOW * C, 100), high: roundTo(RECOVER_HIGH * C, 100) };

    // Recoverable hours, for an honest headline
    var hoursBack = { low: Math.round(RECOVER_LOW * H), high: Math.round(RECOVER_HIGH * H) };

    // 4. Possible missed revenue (never added to the headline)
    var M = null;
    if (answers.Q2 === 2 || answers.Q2 === 3) {
      var slip = answers.Q2 === 2 ? 0.10 : 0.20;
      if (typeof answers.R1 === 'number' && typeof answers.R2 === 'number') {
        M = Math.min(answers.R1 * slip * CLOSE_RATE * answers.R2, MISSED_REVENUE_CAP);
        M = { value: roundTo(M, 10), capped: M >= MISSED_REVENUE_CAP, slipRate: slip };
      }
    }

    // 5. Friction score 0-30
    var F = 0;
    FRICTION_QUESTIONS.forEach(function (id) {
      var o = optionFor(id, answers[id]);
      F += o ? o.f : 0;
    });

    // Tier: highest matching tier wins
    var tier;
    if (F >= 20 || H >= 15) tier = 'timeback';
    else if (F >= 10 || H >= 6) tier = 'tuneup';
    else tier = 'smooth';

    // Top 3 leaks: most hours, ties broken by friction, then question order
    var order = HOUR_QUESTIONS;
    leakList.sort(function (a, b) {
      if (b.hours !== a.hours) return b.hours - a.hours;
      if (b.friction !== a.friction) return b.friction - a.friction;
      return order.indexOf(a.id) - order.indexOf(b.id);
    });
    var topLeaks = leakList.slice(0, 3).map(function (l) {
      var info = LEAKS[l.id];
      return {
        id: l.id,
        name: info.name,
        hoursLost: l.hours,
        hoursBack: round1(l.hours * LEAK_RECOVER),
        instead: info.instead,
        fix: info.fix,
        diy: info.diy,
        level: info.level,
        benchmark: info.benchmark || null,
        link: info.link
      };
    });

    return {
      rawHours: raw,
      cap: cap,
      H: H,
      hourly: hourly,
      hourlyDefaulted: typeof answers.A3 !== 'number',
      C: C,
      Cdisplay: roundTo(C, 50),
      R: R,
      hoursBack: hoursBack,
      M: M,
      F: F,
      tier: tier,
      tierInfo: TIERS[tier],
      topLeaks: topLeaks,
      timeFor: Q12_PHRASE[answers.Q12] || null,
      changeMessage: Q11_MESSAGE[answers.Q11] || null,
      callOpener: topLeaks.length
        ? 'Your quiz said ' + CALL_OPENER[topLeaks[0].id] + ' takes the most time. Is that how it feels to you?'
        : null
    };
  }

  function money(n) {
    return '$' + Math.round(n).toLocaleString('en-US');
  }

  // Validate answers coming from the browser before the server trusts them
  function sanitizeAnswers(input) {
    var clean = {};
    if (!input || typeof input !== 'object') return clean;
    QUESTIONS.forEach(function (q) {
      if (!(q.id in input)) return;
      var val = input[q.id];
      for (var i = 0; i < q.options.length; i++) {
        if (q.options[i].v === val) { clean[q.id] = val; return; }
      }
    });
    return clean;
  }

  function isComplete(answers) {
    return visibleQuestions(answers).every(function (q) {
      return q.optional || answers[q.id] !== undefined;
    });
  }

  return {
    QUESTIONS: QUESTIONS,
    LEAKS: LEAKS,
    TIERS: TIERS,
    constants: {
      OVERLAP_FACTOR: OVERLAP_FACTOR, WEEKS_PER_MONTH: WEEKS_PER_MONTH,
      RECOVER_LOW: RECOVER_LOW, RECOVER_HIGH: RECOVER_HIGH, LEAK_RECOVER: LEAK_RECOVER,
      CLOSE_RATE: CLOSE_RATE, MISSED_REVENUE_CAP: MISSED_REVENUE_CAP, TEAM_CAPS: TEAM_CAPS,
      DEFAULT_HOURLY: DEFAULT_HOURLY
    },
    byId: byId,
    optionFor: optionFor,
    visibleQuestions: visibleQuestions,
    score: score,
    money: money,
    sanitizeAnswers: sanitizeAnswers,
    isComplete: isComplete
  };
});
