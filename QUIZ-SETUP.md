# Time Leak Quiz: setup

The quiz works as soon as you deploy. People can take it, see their results, and save or print them, with nothing else configured. Saving answers, creating ClickUp leads, and emailing the report each switch on when you add the environment variables below in Vercel (Project → Settings → Environment Variables). Redeploy after you add them.

## Files

| File | What it does |
|---|---|
| `quiz.html` | The quiz page at `/quiz`: intro, one question per screen, results, report form, privacy note |
| `quiz-scoring.js` | Questions and all the math. Used by the page and the server, so results always match |
| `api/quiz.js` | Vercel function at `/api/quiz`. Saves answers, creates the ClickUp task, sends the report email |
| `supabase/quiz.sql` | Creates the two tables (anonymous answers, and contact details kept separately) |
| `tests/` | Checks the PRD worked example and the API. Run `node --test tests/quiz-scoring.test.js tests/quiz-api.test.js` |

## 1. Save answers (Supabase)

1. Create a Supabase project just for Twist & Thrive. Keep it separate from client projects.
2. Open the SQL editor and run `supabase/quiz.sql`.
3. Add these to Vercel:
   - `SUPABASE_URL`: Project Settings → API → Project URL
   - `SUPABASE_SERVICE_ROLE_KEY`: Project Settings → API → service_role key. This key stays on the server and never reaches the browser.

## 2. Lead card in ClickUp

- `CLICKUP_API_TOKEN`: ClickUp → Settings → Apps → API Token
- `CLICKUP_LIST_ID`: the list where leads should land (it's the number in the list's URL)

Each opt-in creates a task named "Quiz lead: First name (Business)". It's tagged with the tier and includes hours, the recoverable range, top 3 leaks, how they feel about change (Q11), and a suggested call opener.

## 3. Report email (Resend)

- `RESEND_API_KEY`: from resend.com, after you verify your sending domain
- `REPORT_FROM_EMAIL`: an address on that domain, such as `gina@twistandthrive.com`
- `REPLY_TO_EMAIL`: optional. Where replies and unsubscribe requests go
- `MAILING_ADDRESS`: required. CAN-SPAM needs a physical mailing address in every email. A PO box works.
- `BOOKING_URL`: optional. Defaults to your Calendly link

Until email is configured, a successful opt-in tells the person "I'll email your full report within one business day." That's a promise you'd keep by hand from the ClickUp task, so set up Resend before you promote the quiz.

## Not built yet (the rest of PRD v1)

- **The day 3, 7, and 14 follow-up emails** and one-click unsubscribe. These belong in an email tool with automations, such as Kit or MailerLite, rather than in this code. Pick one, and I can wire the opt-in to add contacts there.
- **Drop-off analytics.** The page already sends events (`quiz_start`, `quiz_question`, `quiz_complete`, `quiz_optin`, `quiz_book_click`) if Vercel Web Analytics is turned on. To turn it on, enable Web Analytics in Vercel and add `<script defer src="/_vercel/insights/script.js"></script>` to `quiz.html`. Custom events need a Vercel Pro plan.
- **Colorado privacy review** of the privacy note before launch, as the PRD asks. The 24-month retention period is a placeholder for you to confirm.

## Calibration

Hour values, the 0.8 overlap factor, and the 50 to 70% recovery range are all in `quiz-scoring.js`, under Constants and QUESTIONS. After the first 50 completions and 3 sprints, change them there. The tests will flag anything that breaks the worked example.
