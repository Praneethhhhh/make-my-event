# Phase 2 — organizer operations

**Superseded composition and finance/task ownership:** The 14 November organizer redesign in [OPERATIONS_REDESIGN_PLAN.md](OPERATIONS_REDESIGN_PLAN.md) replaces vendor ownership/function assignment, the old finance tab split and dashboard content. Keep this earlier plan as historical scope/evidence; current PRD/API/database amendments take precedence.

**14 November 2026 product decision:** Vendors have no application access: no portal, private URLs, capability sessions, self-service task completion or vendor/photographer uploads. Administrators and organizers maintain vendor contacts, responsibilities, task status, charges and payments internally. Guest invitation access is unchanged. Google Places discovery remains deferred. Any earlier design exports or historical test notes describing vendor access are superseded.


Approved scope, 13 November 2026. Google Places / nearby vendor discovery is deferred indefinitely at the user's request. Do not provision a key, billing, discovery UI or external search calls. Revisit only with new authorization. Manual vendor records remain fully usable.

## Delivery plan

1. Generate matching desktop Stitch compositions for tasks/List/Kanban/task comments, notifications, manual vendors, finance and dashboard. Reuse ivory/forest/copper, Manrope/Newsreader and existing account-menu navigation. Include empty, loading, recoverable error and mobile adaptation.
2. Implement tenant-scoped task CRUD with revision checks, function/assignee validation, priorities, deadlines, shared List/Kanban data and comments. Member selection provides explicit mentions; posting a comment creates recipient-bound in-app notifications atomically. Self-mentions do not notify. Preserve history when members leave; mark unavailable assignees clearly.
3. Add a wedding-scoped bell and notifications page: unread by default, All/history option, author, timestamp, context link, mark read/unread and mark all read. Only the intended active member can retrieve/update a notification. Recheck access at navigation time; deleted tasks display an unavailable state. No email/push notification integration.
4. Maintain manual vendors, contacts, internal notes, tasks, function responsibilities, charges and payments through manager-only screens. No vendor portal, private link, capability, completion endpoint or vendor upload. Vendors never sign in or access the application.
5. Implement paid standalone expenses, vendor agreed charges and partial payments. INR integer paise, transactionally reject overpayment; actual spent equals posted standalone expenses plus posted payments, never charges. Corrections void records with reasons instead of silently rewriting payment history. Idempotency keys prevent duplicate financial submissions.
6. Add operational dashboard based on real functions/tasks/finance records; do not invent guest RSVP or photo metrics before those modules exist.
7. Run focused service/API and desktop/mobile browser checks. Include tenant boundaries, revoked members, assignees/mentions, notifications isolation, stale edits, money arithmetic/concurrent payment limits, deletion cascade and accessibility/navigation. Record actual results and deferred work in PROJECT_STATUS.

## Security and consistency

Both ADMIN and ORGANIZER operate shared tasks/vendors/finance. All tenant-owned requests use validated X-Wedding-Id. Writes lock the wedding and revalidate active membership in the transaction, serializing with removal/deletion. Referenced functions/vendors/users must belong to that wedding. New notifications join the permanent-deletion inventory. Task deletion is soft and comments/history remain tenant-scoped. Deadlines are instants displayed in wedding time zone; they need not fall within wedding dates because preparation happens beforehand. No live customer data or real emails are needed for verification.

## Review boundary

User requested design then implementation together; this plan records sequence, not an additional approval gate. No billing, external messages or deployment is authorized by this feature work.
