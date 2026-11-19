# Manual and end-to-end review — 20 November 2026

The current code needs follow-up on three guided-tour issues. The earlier mobile homepage overflow and Finance focus problems did not reproduce after their fixes. No new core guest, task, notification, finance or tenant-security failure was established in this pass.

## Scope and environment

- Reviewed commit `fca2a15` plus the current uncommitted contextual-tour, sign-in redirect, shared header and wedding-scope changes.
- Manually exercised the local development application in the existing Chrome profile, using the existing Manual QA November test account and QA TEST — Final review wedding.
- Completed the introduction, all three directory steps and all nine example workspace sections. Reviewed desktop Light, mobile Dark, exact 390 × 960 and 1440 × 960 checks, and the normal desktop window. Checked keyboard focus, Back, Next, Finish, Skip, Escape, replay entry points, route return, background inertness, sample content, wrapping and overflow.
- Ran the complete existing Chrome end-to-end suite against a fresh production Webpack build, isolated temporary MongoDB replica set and mock email delivery. Destructive/security tests affected only that temporary database.
- Ran separate focused diagnostics for the observed tour defects and unsaved-navigation behavior. Their source and results were saved under ignored `playwright-report/manual-review-2026-11-20`; the temporary source test was removed after testing.

## Confirmed problems

### F01 — P2: Mobile Team tour spotlight is hidden behind the guide

**Reproduce:** At 390 × 960, start Take a tour, advance to Step 6, Team. Also reproduce by advancing to Tasks and pressing Back.

**Expected:** The highlighted Invite a team member heading is visible above the fixed bottom instructions.

**Actual:** The settled highlighted heading is underneath the instructions. In the live Chrome pass its top was about 805 px and bottom 840 px, while the guide began at 792 px. A separate production-browser check reproduced it: target bottom 825 px versus guide top 792 px. The desktop 1440 × 960 comparison passed, with the target well above the guide. The user can scroll manually, but the tour does not bring its selected target into the unobstructed area.

Review target positioning after page content/layout settles and account for the actual guide height. The current tour marks a target and scrolls it once, then ignores further mutations when the same element remains selected.

Relevant source: `src/modules/experience/wedding-tour.tsx:116` and `src/modules/experience/wedding-tour.css`. Evidence: `tour-team-hidden-390.jpg` and `team-target-production-390.png` in the review capture directory.

### F02 — P3: Tour return drops the original task filter

**Reproduce:** Open Dashboard → My open tasks, giving `/weddings/{id}/tasks?scope=mine`. Open Take a tour, then Skip tour.

**Expected:** Return to the original My tasks/Open view.

**Actual:** Return goes to `/weddings/{id}/tasks`, with All team tasks selected. In the retained QA wedding this changed a zero-result personal view into the 16-task team view. The production diagnostic independently failed the expected original-URL assertion. The base wedding/task route remains correct; the query state is lost.

The header captures only `window.location.pathname`, so the query is already missing from `tourFrom`. Preserve validated supported view parameters when constructing and accepting the return destination. Do not broaden return handling into an unrestricted redirect.

Relevant source: `src/modules/weddings/wedding-shell.tsx:108` and the return allowlist in `src/modules/experience/wedding-tour.tsx:10`. Evidence: `tour-return-filter-lost.jpg` and the focused diagnostic log.

### F03 — P3: Guests example contradicts its own response summary

**Reproduce:** Advance to Step 9, Guests, and compare Responses by function with the recipient directory below it.

**Expected:** Fictional directory records and their aggregate counts agree.

**Actual:** The example says one invitation recipient, one accepted recipient and three people attending, but also Active recipients · 0 and Your guest list starts here. This was observed on desktop and mobile. This finding concerns fictional tour data, not the real guest summary calculations.

The preview provides a populated `guestResponses` summary but `guests: list([])`. Supply matching fictional recipient data or use consistently empty aggregates.

Relevant source: `src/modules/experience/tour-workspace.tsx:36` and `src/modules/experience/tour-workspace.tsx:98`. Evidence: `tour-guests-contradiction.jpg`.

### F04 — Formatting check fails

`pnpm format:check` reports `src/modules/weddings/wedding-scope.tsx`. This is a formatting issue, separate from the application findings. No formatting or application fix was applied during this testing request.

## Automated results

| Check                                          | Result                                       |
| ---------------------------------------------- | -------------------------------------------- |
| Production Webpack build, including TypeScript | Passed                                       |
| Unit checks                                    | 10 passed                                    |
| Full ESLint                                    | Passed                                       |
| Repository formatting                          | Failed on wedding-scope.tsx                  |
| Complete existing Chrome suite                 | 171 passed, 1 failed out of 172; 8.6 minutes |
| Focused follow-up                              | 3 passed, 2 failed out of 5                  |

The complete run's single failure was guest review editor regressions at 1440 px: browser-context teardown exceeded the 60-second timeout. It did not report a failed application assertion. That same case passed in the focused rerun in 4.9 seconds. This establishes a passing rerun, not an uninterrupted 172/172 run.

The five focused cases were:

1. Unsaved comment: declining the browser navigation warning preserves the original page and draft — passed.
2. Tour return retains the original task scope — failed, confirming F02.
3. Team spotlight remains above the guide at 390 px — failed, confirming F01.
4. Team spotlight remains above the guide at 1440 px — passed.
5. The guest editor case that timed out in the complete run — passed.

The original suite's passing cases cover:

| Feature                    | Exercised coverage                                                                                                                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Accounts and tour entry    | Signup, sign-in/out, automatic first welcome, seen-state behavior, replay, full tour progression, no wedding creation from the example, password visibility/validation, session and password races                                                     |
| Multiple weddings and team | Exact selected tenant, independent tabs/roles, code creation/reveal/redemption, member removal, final-admin protection, revoked access, invitation and delivery failure handling                                                                       |
| Functions                  | Create/edit/remove, colors, wedding date bounds, time zones/DST, stale revisions and concurrent schedule changes                                                                                                                                       |
| Guest invitations          | Both manager roles, private link exchange/replacement/revocation, multi-device/session isolation, accept/decline, integer/private caps, deadlines/expiry, corrections/history, eligibility changes, pagination/summary totals and concurrency          |
| Tasks and notifications    | Required human owner, optional vendor context, assignments and committed mentions, comment permissions/edit/removal, unique atomic notification events, recipient privacy, read/unread/history, activity/focus refresh without idle polling            |
| Vendors and finance        | Internal-only access, retired vendor endpoints, paid/unpaid entries, partial payments, exact paise, duplicate-request safety, overpayment races, reasoned correction/removal history, legacy adapters and guarded migration checks                     |
| Shared experience          | Light/Dark persistence and defaults, blocked storage, transparent artwork, canonical routes and redirects, mobile/tablet/desktop organizer lifecycle, Dashboard totals/loading/recovery, editor focus, pagination races, deletion isolation and guards |

The old stale-selector failures recorded on 16 November are superseded by this run's current outcomes. The three newly found tour issues were outside the assertions in the existing tour tests; progressing through all steps alone did not detect them.

## Manual outcomes

| Scenario                                    | Observed result                                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Desktop directory tour and complete example | All 12 numbered steps plus welcome worked; background controls were inert; actual memberships returned after finishing          |
| Mobile Dark replay                          | Entry available in the account menu; all sections navigable, with F01 on Team; no horizontal overflow observed                  |
| Desktop Light replay from Finance           | All sections navigable at 1440 × 960; Finish returned to the same Finance route                                                 |
| Focus and exit                              | Tour heading receives focus; directory Finish returns to the desktop tour button; mobile Escape returns to Account menu         |
| Back/Next                                   | Directory Back and repeated Team/Tasks transitions worked; Team obstruction persisted on return                                 |
| Filtered route return                       | F02 reproduced from My open tasks                                                                                               |
| Guests sample                               | F03 reproduced in both themes/layouts                                                                                           |
| Saved discussion                            | Existing multiline description and comment, committed name mention, Kannada text and emoji remained readable at 390 px          |
| Finance focus regression                    | Open Add entry → Close editor returned focus to Add entry in the live profile; focused full-suite cases also passed both widths |
| Signed-in homepage regression               | At 390 px, Your weddings was fully visible and document width did not exceed the viewport; earlier overflow did not reproduce   |

An initial live browser-control navigation left an unsaved test comment draft while opening the tour. A separate production test explicitly listened for and declined the beforeunload dialog, verifying the original draft remains. The initial browser-control observation is therefore not counted as an application draft-loss defect. No comment was submitted.

## Data, artifacts and limits

No new retained wedding, team invitation, guest, vendor, task, comment or finance record was saved in this pass. Existing QA data was read only. Appearance was restored to Light after Dark checks. The tour's browser-local seen preference was exercised. No real emails, retained-record deletion, retained-data migration, commit, push or deployment occurred.

Local evidence is under `playwright-report/manual-review-2026-11-20`, including full/focused logs, diagnostic source, failure contexts and screenshots. Existing feature-suite screenshots are also retained in their configured ignored report locations.

This was local Chrome verification. Live Vercel, real inbox delivery, native share sheets, other browsers, full screen-reader use, sustained load and executing migrations against retained data were not tested. The new tour findings need fixes and focused regression checks before declaring the tour ready.
