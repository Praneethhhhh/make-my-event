# Local manual and end-to-end review — 16 November 2026

## Scope and method

Reviewed the current uncommitted working tree, including guest invitations, light/dark appearance, shared presentation, navigation, tasks/mentions/notifications, vendors, finance and Dashboard consumers. This is a local release-checkpoint review, not deployment approval or a claim that every possible input/browser combination has been exhausted.

The production Webpack build passed, including TypeScript. The complete existing Playwright suite ran with the installed Chrome channel against its isolated MongoDB replica set and mock email provider. The 10 unit cases and ESLint passed. The standard Turbopack build did not finish during the initial restricted-runner attempt; it was stopped and replaced with the successful Webpack build. That interruption alone does not establish an application build defect. Repository formatting fails on AGENTS.md.

Separately exercised the existing localhost:3000 development application in the user's Chrome profile. Used the existing Manual QA November test account and QA TEST — Final review wedding. Checked mobile at 390×960 and desktop at 1440×960, plus the initial normal desktop viewport. Screenshots are saved in the ignored playwright-report/manual-review directory. The development preview had slow first-route compilation/loading; production-suite timings are separate.

## Complete-suite results

The uninterrupted Chrome run completed all170 cases in19.4 minutes: **149 passed,21 failed**. These are case outcomes, not21 distinct application bugs. The10 unit checks are reported separately.

| Area | Passed | Failed |
| --- | ---: | ---: |
| Account/authentication |20|4|
| Appearance/presentation |12|4|
| Functions |16|2|
| Guests |17|2|
| Operations/finance/notifications |33|1|
| Team |25|1|
| Weddings/tenancy |26|7|

Passing coverage includes authentication/CSRF/rate limits, password/session races, exact tenant scope and membership revocation, both guest manager roles, guest lifecycle at390/1440px, deadlines/headcounts/expiry/concurrency/history, first-open/retry and correction-editor regressions, all-record search and summaries, task ownership/mentions, atomic recipient-private notifications, vendor access removal, paid/outstanding totals and no-overpayment races, legacy finance adapter/migration guards, pagination cancellation, Dashboard loading/layout, team invitations and final-admin protection, multi-wedding isolation and populated deletion. The four newer canonical route audits passed in light/dark at390/1440px, as did theme persistence, cross-tab sync, blocked-storage behavior and transparent-artwork cases. See the retained local full-e2e-run.log for individual cases.

### Test maintenance required —19 failing cases

| Cause | Cases | Required test change |
| --- | ---: | --- |
| Old exact Sign In capitalization; current link is Sign in |5|Update account/browser, desktop auth/navigation and wedding deletion selectors. Snapshots show the working current link. |
| Old celebration-pixels image path; current approved asset is celebration-transparent.png |4|Assert current artwork and its successful paint/composition, rather than the removed filename. |
| Old navigation assumptions |5|Open the mobile Wedding menu before locating Team/Wedding details/navigation; replace desktop Overview selector with Dashboard. Affects functions2, team1 and mobile multi-wedding2. |
| Old overview onboarding headings on the current Dashboard |3|Update workspace-loading cases to exercise the current Dashboard contract and relevant error/loading behavior. |
| Exact guest count error text matcher no longer matches wrapper containing Refresh guests |2|Locate the alert and assert its text/control separately. Failure snapshots show the expected error message and retry button actually present. |

These stopped cases leave downstream steps unverified by those specific tests. They should be repaired and rerun without weakening their behavioral assertions. No existing test expectations or application code were changed during this review.

### Notification refresh test synchronization —1 additional failing case

The idle-refresh case failed in the complete run, then **failed2/3 focused repetitions** at the same assertion: after an assumed settled count of2, advancing the simulated clock120 seconds produced request3. A temporary instrumented diagnostic also reproduced this2/3 times and traced the extra request to initial delayed choice-read wedding-activity events, rather than a repeating poll. After allowing those initial reads and their coalesced refresh to settle before setting the baseline, **3/3 diagnostic repetitions passed** with no extra request over the simulated120-second idle period. Thus the original test needs a reliable settling checkpoint; a recurring notification polling defect was not established. Ordinary manual read/unread/badge behavior also worked. Diagnostic source/logs are retained under ignored playwright-report/manual-review; the temporary source test was removed. The unchanged original suite still has this failure and must be repaired/rerun. Together with the19 stale cases above, this is20 test-maintenance failures and one application overflow failure in the full run.

### Formatting

pnpm format:check fails on AGENTS.md only. ESLint and production Webpack/TypeScript passed. Format the guidance file separately from application fixes.

## Confirmed application findings

### P2 — Signed-in mobile homepage scrolls horizontally

1. Sign in with an account that has a wedding.
2. Open the homepage at 390px wide.
3. Observe the header's Your weddings action crossing the right screen edge.

Expected: the header fits the viewport without clipping or horizontal scrolling. Actual: document width401px at viewport390px; masthead-account-actions and its primary link end at401px. The settled1440px view fits. The full-suite390px navigation overflow assertion also fails. Review the shared wordmark sizing and mobile signed-in masthead action sizing together; hiding overflow alone would conceal the clipped action.

Evidence: playwright-report/manual-review/home-overflow-390.jpg. Relevant styles: src/styles/interface.css and src/app/(marketing)/landing.css.

### P3 — Closing Finance editor loses keyboard focus

1. Open Finance, choose Add entry, then Close editor without editing.
2. Repeat with an invalid amount draft, Cancel, Keep editing, Cancel, Discard draft.

Expected: focus returns to Add entry. Actual: document.activeElement is BODY in both close paths. Keep editing correctly preserves input. This makes keyboard users restart their navigation. The shared OperationsPanel cleanup attempts to focus the original trigger; review restoration timing around closing/unmounting the modal. Also observed BODY focus after discarding a task edit, so check other consumers of the shared panel.

## Manual checks that worked

| Area | Actual checks and results |
| --- | --- |
| Sign-in | Empty submission gives email/password feedback; password visibility toggles without losing the draft. |
| Appearance | Dark sign-in renders legibly and preserves the draft; appearance menu opens/closes. |
| Wedding selection | Existing account lists its three independent memberships and opens the selected QA wedding. |
| Tasks | Required title rejected; new owner defaults to current user; Unicode/emoji title, multiline description and committed mention saved; status changed to Completed; clearing owner was rejected; discarding invalid edit preserved saved owner/status. |
| Discussion | Keyboard mention selection followed by text and newline works; saved comment/description wrap legibly at390px, including Kannada and emoji. No tiny/overlapping mention text reproduced. |
| Notifications | Assignment and inline mention combined into one event; self-comment mention added no duplicate; sender, date/time and task destination correct; Mark read clears unread list/badge; All history retains entry; Mark unread restores badge. Mobile view has no horizontal overflow. |
| Guest editor | Required name, at least one function and minimum headcount1 enforced; Select all works; private limits remain manager-only; saving disables duplicate submission. |
| Public invitation | Fresh copied link exchanges into clean guest URL; no account required; over-cap3 against cap2 rejected with input retained; valid acceptance2 and independent decline saved; organizer accepted people total matched. |
| Host correction | Reason required; switching functions resets draft reason/count/response; correction2→1 saved and feedback states retained history. |
| Guest access | Link replacement preserved corrected responses and invalidated existing guest session; revocation reports success, disables copy and shows correct replacement guidance; revoked recipient excluded from current function attendance totals. |
| Finance forms | Exponent input1e3 and excess precision0.001 rejected; Keep editing preserves values; Discard leaves finance records unchanged. |
| Navigation | Mobile wedding menu opens and reaches Guests/Finance; Dashboard and task detail routes work. |

One rapid automated character-typing attempt through the Chrome extension timed out and left a partial/reordered draft. Repeating with ordinary browser text entry produced the complete correct text, which was saved and inspected. This was not established as a repeatable application defect; the malformed draft was replaced before saving.

## Data left by this review

- QA task: QA Nov16 manual task — ಅತಿಥಿ 🎉, id6afb43302a621640ba9065a5, Completed, with one test comment.
- QA recipient: QA Nov16 Family — ಕನ್ನಡ 🎉, id6afb44142a621640ba9065a9, link revoked, retained responses/correction history. No active guest capability remains from that test.
- One notification from the QA task remains unread after the read/unread checks.
- No retained finance entries were created, no existing non-QA records edited, no real emails sent, no retained wedding deleted, no migration applied to retained data, and no commit/deployment performed.

## Coverage limits

Live Vercel, real Resend inbox delivery, native mobile share sheets, other browsers, screen-reader use, sustained load and retained-database migration execution were not tested. Permanent deletion was exercised by automated tests only in the temporary database. Tests that fail on obsolete selectors do not verify the steps after their failure point; successful newer route/lifecycle and API coverage must be read separately.


## Resolution follow-up — 17 November 2026

The original findings above describe the reviewed snapshot. Subsequent implementation fixed signed-in mobile header overflow and shared editor focus restoration, formatted AGENTS.md and repaired the20 stale/synchronization test cases. All28 targeted follow-up scenarios now have passing results, including new Finance focus coverage and affected shared consumers; notification idle/activity testing passed3 consecutive repetitions. Final Webpack/TypeScript, lint and formatting passed. This was a focused follow-up, not a rerun of the entire170-case suite or live deployment. See PROJECT_STATUS.md for the exact coverage and remaining limits.
