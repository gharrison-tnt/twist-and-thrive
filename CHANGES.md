# Site update, October 16, 2026

## What changed

**A leaner menu.** The eight-item Quick Builds table and the four-package grid are replaced by:

- **Start here:** a free Discovery Call, Booking with reminders ($200), and the Clarity Audit ($450, included free with any offer or custom build started within 30 days)
- **Three ways I can help:**
  - Stop Losing Appointments, from $2,200. This was Get Organized. It now includes deposits and a rebooking email, and the welcome packet is dropped.
  - Get Paid What You're Worth, from $1,200
  - Get Found, from $2,000, now up to 3 pages instead of 5
- **Custom Builds,** from $6,500
- **Monthly Access,** one published tier at $750, described as "someone who keeps it running." The Partner tier is now "ask about a larger plan."
- Single small builds and outreach planning (the old Get In Front package) are still available, mentioned in one line as "on request." The go-to-market page stays live.

**Trust gaps on the pricing page:**

- A "What to expect" section covering timing (with the turnaround caveat), ownership, and running costs
- A "Why work with me" line about your enterprise background, plus Jill's quote
- One sourced number: reminders cut no-shows by 25% (Robotham et al., BMJ Open, 2016), shown as a guide rather than a promise
- The Clarity Audit is now explained once, plus a new FAQ entry on how the quiz differs from the audit
- The "See pricing" button on the pricing page itself is gone. The secondary button in every page's closing band now says "Take the 3-minute quiz."

**The Time Leak Quiz** at `/quiz`, built from the PRD and styled after the Memory Care assessment:

- 15 questions plus 2 optional ones, one per screen, with a progress bar, a back button, and the "you're not alone" lines
- Results show hours, monthly cost, and the realistic recoverable range, with "How we calculated this" one tap away. Possible missed revenue is shown separately, then the top 3 leaks (each with a DIY tip and what you'd set up), then the next step for their tier.
- No email is needed for results. The emailed report is opt-in, with an unchecked consent box.
- Each leak links to the matching offer page, which is how the quiz feeds the three offers.
- See `QUIZ-SETUP.md` to switch on saving, ClickUp leads, and email.

**Sitewide:** "Free quiz" added to the nav. The footer now lists the three offers. Home, Services, the service pages, FAQ, structured data, `llms.txt`, and the sitemap are updated to match.

## Choices to confirm

1. **Quiz name: "Time Leak Quiz,"** one of the options in your PRD. "Busywork Audit" would put a free audit and a paid $450 audit side by side.
2. **The headline shows recoverable hours** ("about 9 to 12 of them"), not total hours. The PRD example said "get back about 18 hours," which conflicts with its own never-inflate guardrail.
3. **Price and scope changes:** Get Found drops to 3 pages at $2,000. Stop Losing Appointments gains deposits and a rebooking email, and loses the welcome packet. Booking with reminders stays at $200.
4. **Booking with reminders copy** says you set up the services, prices, and availability, test it, and walk them through it. Keep only what you actually do.
5. **Turnaround:** the site uses the caveat only, with no time ranges.
6. **Privacy note:** 24-month retention is a placeholder. Have it reviewed for Colorado law before launch.

## Still open from the earlier review

- A domain email to replace the Gmail address everywhere (needed for Resend anyway)
- A named local client quote, when one is available
