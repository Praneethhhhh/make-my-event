# MAKE MY EVENT

**14 November 2026 approved redesign:** Task writes require assigneeUserId, optional vendorId, bounded mentions and creationKey; vendor ownership is rejected. Lists accept validated server-side q/mine/assignee/function/status/priority filters with cursors and accurate counts. GET /operations?view=context and /operations?view=choices provide lightweight scoped context and searched choices. GET /finance/expenses, /finance/payments, /finance/summary and explicit /finance/vendor-balances; POST /finance/expenses and /finance/payments; POST /finance/{expenses|payments}/{id}/correct preserve history with reason/revision. Source-aware legacy rows are readable; new expense obligations/payment events do not double count existing records. Vendor function-assignment endpoints return 404. Notifications distinguish assignment, task mention and comment mention, combine same-save recipients and preserve unread/history behavior. See [implementation plan](OPERATIONS_REDESIGN_PLAN.md).

**14 November 2026 product decision:** Vendors have no application access: no portal, private URLs, capability sessions, self-service task completion or vendor/photographer uploads. Administrators and organizers maintain vendor contacts, responsibilities, task status, charges and payments internally. Guest invitation access is unchanged. Google Places discovery remains deferred. Any earlier design exports or historical test notes describing vendor access are superseded.


**Phase 2 amendment — 13 November 2026:** Vendor discovery endpoints below are deferred and must not be enabled. In-app mention notifications are selected-wedding management resources: `GET /notifications?view=unread|all`, `PATCH /notifications/{id}` with `{read:boolean}`, `POST /notifications/read-all`. Return recipient-only rows with actor, timestamp, task/comment context and unread count; paginate bounded history. Only active selected-wedding members can access their own notifications. Mutations require CSRF. Comments atomically notify unique active mentioned members except the author. See [delivery plan](PHASE_2_OPERATIONS_PLAN.md).

### Organizer redesign contracts — 14 November 2026

These contracts supersede older operations tables below. All paths use `/api/v1`, no-store, exact selected X-Wedding-Id and active membership. Mutations also require CSRF and the persisted management quota. Implementation is verified locally and awaiting user review; see PROJECT_STATUS.md for actual evidence and coverage limits.

| Route | Contract |
| --- | --- |
| `GET /operations` or `?view=dashboard` | `{title,displayName,timeZone,summary:{open,overdue,mine,activeVendors,actualPaid,outstanding}}`; count/aggregate reads, no directory/choice/ledger arrays. Wedding root is Dashboard; `/weddings/{id}/dashboard` redirects to it. |
| `GET /operations?view=context` | Only userId, role, title, timeZone and displayName. |
| `GET /operations?view=choices&type=people\|vendors\|functions&q=&cursor=` | Searched active choices, items `{id,name}`, 50 rows and nextCursor. Cursor for people is the membership row; value ID is the user. Escaped literal search, not caller-supplied regex. |
| `GET /tasks?q=&owner=&function=&priority=&status=&mine=true&scope=open\|overdue\|mine&cursor=` | Filters run before 50-row `_id` pagination and full-result total/statusCounts. Scope mine means my open tasks; mine=true and owner filters can include completed, and combined filters intersect. Lists resolve bounded owner/function/vendor labels and ownerActive. |
| `POST /tasks`; `PATCH /tasks/{id}` | title, description, weddingTimeZone, functionId or null, assigneeType USER, required assigneeUserId, assigneeVendorId null, optional vendorId, status, priority, dueAt/null, bounded mentions `{userId,field,start,end}` and UUID creationKey. PATCH additionally revision. Active human owner; vendor is context. Same-save assignment/new mentions combine per recipient; replay does not duplicate task/notifications. |
| `POST /tasks/{id}/comments`; `PATCH /tasks/{id}/comments/{commentId}` | Existing body/mentionedUserIds plus bounded mentionRanges `{userId,start,end}` for inline editing. Create uses creationKey; edit uses revision. Legacy comments/mentions remain readable. |
| `POST /vendors`; `PATCH /vendors/{id}` | name, category, phones (1..5), internalNotes, status and required controlled color; revision on edit. No email or function assignments. `POST /vendors/{id}/assignments` returns 404. Missing legacy color reads neutral. |
| `GET /finance/expenses`, `/finance/payments` | Source-aware ledger items, source/id key cursor, total, q search; expenses `open=true` limits to active remaining balances for payment selection; expenseId/expenseSource filters provide an exact scoped balance refresh. DTOs include amounts, payment/remaining balance where relevant, vendor label and correction history. Legacy paid expenses produce one virtual payment each. |
| `GET /finance/summary` | `{actualPaid,outstanding}` in integer INR paise across both compatible legacy and new records. |
| `GET /finance/vendor-balances?cursor=` | Explicit on-demand only, 50 vendor groups `{id,name,paidPaise,outstandingPaise}` and nextCursor. |
| `POST /finance/expenses` | description/category, positive integer amountPaise (maximum 10,000,000,000), currency INR, optional vendorId/null, notes, creationKey. Creates modelVersion 2 obligation. |
| `POST /finance/payments` | expenseId, expenseSource expenses/vendorCharges, amountPaise, currency INR, paidAt ISO, paymentMethod, notes, weddingTimeZone and creationKey. Server derives vendor from same-wedding expense and checks combined old/new posted payments under lock. |
| `POST /finance/{expenses\|payments}/{id}/correct` | source, revision, reason and creationKey. Keeps original/correction metadata; payments must be corrected before the cost. Source must match resource type. |

Notification rows distinguish task assignment/new mentions and existing comment mentions. A task event returns commentId null and links to the task; comment events link to their comment. Recipient-only read/unread/history contracts remain. Removed targets expose no body preview. Errors include 409 STALE_REVISION, STALE_WEDDING_SCHEDULE, IDEMPOTENCY_CONFLICT, OVERPAYMENT and EXPENSE_HAS_PAYMENTS; malformed inputs are 422, invalid list parameters 400. Legacy finance POST/void routes remain compatible but count new payments in their balance checks and reject migrated source rows.

### Earlier Phase 2 compatibility routes (superseded UI)

All paths below are under `/api/v1`, no-store. Management requests require X-Wedding-Id; mutations also require CSRF and the existing persisted management quota. Collection lists use `data.items`, `nextCursor` and 50-row `_id` cursors. Unknown/foreign records fail safely. The older route tables below remain the wider baseline; the 14 November redesign contracts above take precedence.

| Route | Delivered behavior |
| --- | --- |
| `GET /operations` | Compact Dashboard counts and real paid/outstanding totals; context/choices use the explicit view parameters above. |
| `GET, POST /tasks`; `GET, PATCH, DELETE /tasks/{id}` | Shared tasks, full allowlisted edits with revision, soft deletion returning 200 `{deleted:true}`. Task mutations include `weddingTimeZone` precondition, ISO deadline or null, matching assignee reference and optional function. An unchanged existing archived-function link is preserved; new/changed function links must be active and same-wedding. Preparation deadlines may precede wedding dates. |
| `GET /tasks/{id}?cursor=&commentId=` | Task and paged newest comments; optional highlighted comment is resolved within that task even outside the first page. |
| `POST /tasks/{id}/comments` | Plain text, explicit mentionedUserIds and UUID creationKey; atomic deduplicated in-app notifications, no self-alert. |
| `PATCH, DELETE /tasks/{id}/comments/{commentId}` | Revision required. Author can edit own body/mentions; author or wedding admin may soft-delete. Existing recipient/comment notification pairs never duplicate on edits. Deleted comments are not exposed through task responses. |
| `GET, POST /vendors`; `GET, PATCH /vendors/{id}` | Manual contacts/notes/category and ACTIVE/INACTIVE status with revision. Inactive vendors keep history but cannot be newly assigned be assigned new responsibilities. |
| `POST /vendors/{id}/assignments` | Function, bounded responsibility lines and ACTIVE/COMPLETED/CANCELLED status; replaces the vendor/function responsibility list. |
| `GET, POST /expenses`, `/vendor-charges`, `/vendor-payments` | Posted expense, active agreed charge, posted partial payment respectively. Create requires UUID creationKey and integer amountPaise/currency INR; financial retry returns the same DTO, changed payload with same key is 409. |
| `POST /expenses/{id}/void`, `/vendor-charges/{id}/void`, `/vendor-payments/{id}/void` | Revision and reason; retain original record, audit correction. Charges with posted payments cannot be voided. No direct payment rewriting or gateway. |
| `GET /notifications?view=unread\|all&cursor=` | Intended recipient only; unread default; unreadCount, actorName, date/time and task/comment IDs. Deleted targets are unavailable. |
| `PATCH /notifications/{id}`, `POST /notifications/read-all` | Mark read/unread or mark currently unread as read; recipient checked transactionally. |

Errors include 409 STALE_REVISION, STALE_WEDDING_SCHEDULE, IDEMPOTENCY_CONFLICT, PAYMENT_EXCEEDS_CHARGE and CHARGE_HAS_PAYMENTS; invalid references/mentions are 422. Bell refresh is triggered by coalesced selected-wedding API activity and focus; full inbox has manual refresh, without recurring polling. No sockets, push/email notification delivery or discovery endpoints are added.

## REST API Design & Contract Specification — Version 1.0

**Status:** Reconciled implementation baseline; operational defaults still require phase-specific decisions
**Date:** 9 November 2026  
**Sources:** Final PRD v1.0; System Design & Architecture v1.0; Database Design v1.0  
**Architecture:** TypeScript, single Next.js App Router / Node.js modular monolith, MongoDB Atlas + Mongoose, Zod  
**Infrastructure:** Vercel, Resend, Vercel daily Cron, private Cloudflare R2, Google Places API (New)  
**Intended initial load:** ~200 guest recipients per wedding; multiple isolated wedding tenants  
**API base:** `/api/v1` (HTTPS; same-origin browser clients)

> **Contract principle:** A client may identify its desired wedding, but an ID alone never authorizes access. The server validates the exact active management membership or scoped guest capability before deriving `weddingId`, role and permitted resources. One wedding remains one isolated tenant, even when an account belongs to several weddings.

**12 November 2026 implementation amendment:** Multiple wedding memberships, explicit per-tab wedding context and admin-revealed/manual invitation codes supersede the former one-wedding/email-only contracts. These account, wedding-context and management-invitation contracts are implemented; other feature sections retain their future-phase scope. See [the full migration/delivery plan](MULTI_WEDDING_AND_INVITATION_CODES_PLAN.md).

## Account profile contracts — 13 November 2026

- `GET /api/v1/account`: authenticated account, context-free; safe `{data:{user:{id,displayName,email,revision}}}`, no-store.
- `PATCH /api/v1/account`: CSRF and active session; strict `{displayName,revision}`, existing normalized 1–120 character name validation. Persisted limit 20/account/15 minutes. Email, userId and role are not writable.
- `POST /api/v1/account/password`: CSRF and active session; strict `{currentPassword,newPassword,confirmPassword,revision}`. Existing 15–128 character/strength policy, matching confirmation and a different password. Persisted limit 5/account/15 minutes before password verification; 429 includes Retry-After. Wrong current password is 422 CURRENT_PASSWORD_INVALID with field feedback, stale version 409 STALE_REVISION and missing/revoked session 401.
- Both mutations revalidate/lock the current session and compare profile revision transactionally. Password replacement revokes all previous sessions and sets a newly rotated host-prefixed production cookie for the current browser. Tokens/hashes/passwords are excluded from ordinary responses and logs. An old-password login racing the change cannot mint surviving access.

## 13 November 2026 — permanent wedding deletion

`DELETE /api/v1/wedding` requires an authenticated active ADMIN in the exact X-Wedding-Id context, CSRF, mutation throttling and JSON `{revision, confirmationTitle}`. Exact current title and revision are checked under the wedding transaction lock, with administrator membership revalidated there. Success is no-store 204; organizer is 403, inaccessible tenant 404, malformed input 422, stale revision/title 409 STALE_REVISION. Existing photo records produce 409 MEDIA_CLEANUP_REQUIRED until object cleanup is implemented. The cascade removes only rows belonging to that wedding in the canonical tenant collections, then the wedding itself. Users, account sessions, other tenants and platform anonymous quota counters are retained. No code-bearing response or deletion payload is logged. UI returns to `/weddings` after confirmed success.

## 1. Verification against the three source documents

### 1.1 Alignment matrix

| Dimension        | PRD v1.0                                                                      | System design v1.0                                                   | Database design v1.0                                                 | API decision                                                                            |
| ---------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Multi-tenancy    | Multiple wedding memberships with independent roles                           | Explicit wedding candidate validated against exact active membership | Unique wedding/user pair; non-unique account membership listing      | Tenant-owned management requests require X-Wedding-Id; no first-membership fallback     |
| Management       | Multiple admins/organizers share the same wedding data; admin-only membership | Custom password/session auth                                         | `users`, `authSessions`, `weddingMemberships`, `membershipInvites`   | Cookie management session; admin-only membership mutations                              |
| Guests | No accounts; individually revocable private URLs                              | Token exchange to cookie-scoped portal session                       | `accessLinks`, `portalSessions`                                      | Token entry via web pages; guest REST endpoints require their portal cookies     |
| RSVP             | One status/count per guest/function, limits and deadlines                     | Authorized conditional mutation                                      | Unique `functionInvitations`, `revision`                             | Versioned RSVP update with server deadline/limit checks                                 |
| Finance          | Expense tracker, not budgets; paid and agreed amounts separate                | Avoid double counting and race conditions                            | `expenses`, `vendorCharges`, `vendorPayments`                        | Immutable posted-payment history via void/correction; derived totals                    |
| Vendors          | Manual directory and Places discovery, no booking                             | Server-side Places proxy, cost controls                              | Persistent `googlePlaceId` only for Google-derived listing reference | Search endpoints with cost caps; manual vendor save independent of Google listing cache |
| Email            | Resend invitations, manual/daily pending-only reminders                       | Mongo outbox + bounded immediate send + daily cron                   | `emailOutbox`, `serviceUsage`, optional `emailWebhookEvents`         | API accepts jobs, reports real delivery states, retries safely                          |
| Photos           | Valid photo appears without human approval                                    | Private R2 presigned PUT/GET, finalize verification                  | `photos` technical `uploadState`, no approval field                  | Upload intent → direct PUT → finalize → READY; authorized gallery and short read URLs   |
| Hosting & ops    | Cost-aware, logs, backup/recovery                                             | Vercel Hobby daily Cron, basic JSON logs                             | Audit, TTL, quota counters                                           | One protected cron endpoint; management operations expose operational summaries         |

### 1.2 Reconciled decisions and remaining defaults

1. **Collections and schedules:** Database Design's 25 collection names are canonical across all documents. `functions.scheduleItems[]` is bounded and embedded; there is no separate schedule collection.
2. **Email states:** Persist only `QUEUED`, `PROCESSING`, `SENT`, `DELIVERED`, `FAILED`, `BOUNCED`, `CANCELLED`. `SENT` means accepted by provider, not delivered; `DELIVERED` requires provider confirmation. `FAILED` may be retryable with a future `sendAfter`; suppression uses `CANCELLED`.
3. **Reusable private links:** Keep a one-way lookup hash and a separate AES-256-GCM-encrypted active secret in `accessLinks` where existing-URL reuse is needed. Store nonce, authentication tag and key version; key material stays outside MongoDB. Decrypt only for an authorized management copy action or email dispatch. Never put plaintext token or URL in an outbox payload, webhook, access log, or audit event.
4. **RSVP deadlines and eligibility:** Effective deadline = invitation override if set, else function default. Authorized organizer correction after a deadline is audited. Function eligibility is `ACTIVE` or `REVOKED` independently of `PENDING`, `ACCEPTED`, or `DECLINED` RSVP; revocation preserves history but removes portal access and reminder eligibility.
5. **Concurrent admin/finance changes.** DB design requires a transaction/guard for the last-admin rule and payment balance correctness. **Resolution:** APIs return `409 CONFLICT` on stale revisions or conflicting edits; serializable business mutations occur in transactions/guarded atomic writes.
6. **Guest photo uploads have no human review.** All three documents agree; only technical validation precedes `READY`. The existing PRD screen label 'gallery management' is not an approval queue.
7. **External signed GET URLs are not immediately revocable.** All three agree on short-lived URLs and the residual exposure window. **Resolution:** issue short expiry (proposed 30–60 seconds), never public bucket URLs, and reauthorize each signing request.
8. **Open operational policies remain.** Retention lengths, photo size/storage caps, signed URL lifetimes, rate thresholds and email daily limits are not approved exact numbers. Keep them configurable and finalize before production.

**Audit result:** Product and architecture contracts are aligned. The operational values in item 8 remain phase-specific decisions and are not scaffold defaults.

## 2. API conventions

### 2.1 Envelope, dates, monetary values and IDs

- JSON requests/responses over HTTPS with `Content-Type: application/json`; R2 bytes are sent directly to a presigned URL, not through the Next.js API.
- Resource IDs are opaque 24-hex MongoDB ObjectId strings. Never use a guessed ID as authorization evidence.
- Dates/times: ISO 8601 UTC timestamps (`2026-12-10T09:30:00.000Z`); wedding settings contain an IANA time zone for display and reminder computation.
- Currency in v1: `INR`. All amounts are **positive safe integers in paise** (`amountPaise`); totals are computed from POSTED records, not client-supplied aggregations.
- Enumerations use uppercase values, e.g., `ADMIN`, `ORGANIZER`, `TODO`, `PENDING`, `ACCEPTED`, `DECLINED`, `READY`.
- Stored authority fields (`weddingId`, `createdByUserId`, payment totals, session/token digests, provider IDs) are server-derived. X-Wedding-Id is a context candidate, never an authority field to persist without validation.
- Internal database documents are mapped to explicit DTOs, excluding password hashes, token verifiers, raw secrets, audit-only details, private organizer notes from portals, and R2 storage credentials.

**Success response:** Standard single-result payload `{ "data": { ... }, "meta": { "requestId": "..." } }`. List results use `{ "data": [ ... ], "page": { "nextCursor": null, "limit": 20 }, "meta": { "requestId": "..." } }`. Empty success uses `204 No Content`.

**Error response:** `{ "error": { "code": "VALIDATION_ERROR", "message": "A safe message", "details": { ... } }, "meta": { "requestId": "..." } }`. `details` is optional and excludes secrets and other tenants' data.

### 2.2 Status codes and protected-resource concealment

| HTTP                  | Meaning / examples                                                                        |
| --------------------- | ----------------------------------------------------------------------------------------- |
| `200` / `201` / `204` | Read/update success; created resource; successful empty action                            |
| `202`                 | Email request queued; does **not** claim email delivery                                   |
| `400`                 | Malformed JSON, invalid ObjectId/shape, missing required CSRF header                      |
| `401`                 | Management/portal session absent or expired                                               |
| `403`                 | Known session lacks required role/permission (e.g. organizer tries member role change)    |
| `404`                 | Missing record **or resource outside the caller's authorized wedding/function**           |
| `409`                 | Stale revision, duplicate membership/invitation, referenced function, financial conflict  |
| `410`                 | Expired/revoked token entry (avoid token enumeration); RSVP deadline uses `409` in API v1 |
| `413` / `415`         | Upload too large / unsupported format                                                     |
| `422`                 | Well-formed request violates domain rule (e.g. attendee count above limit)                |
| `429`                 | Rate/quota limit with `Retry-After` when meaningful                                       |
| `500` / `503`         | Unexpected error / temporary provider or database outage; do not falsely report success   |

### 2.3 Pagination and filtering

- Cursor pagination for guests, tasks, payments, photos, audit and email lists: `?limit=20&cursor=<opaque>&sort=...`; default 20, maximum 100. Opaque cursors encode a stable sort key and `_id` and must be signed or integrity-checked.
- Date/status/function filters are allowlisted and Zod-validated. Never allow arbitrary Mongo filter JSON or client-chosen projection operators.
- Summary endpoints compute grouped counts and use bounded aggregations. Avoid returning hundreds of private image URLs or emails in an unpaginated response.

### 2.4 Mutation safety

- Use `Idempotency-Key` (UUID or 16–128 ASCII chars) for all **creation of payments**, bulk email requests, first-admin wedding setup, and other critical non-idempotent operations. Keys are scoped to the principal + operation + wedding, persisted in `idempotencyRecords`, and a reused key with different request body returns `409`.
- For optimistic edits use `revision`/`If-Match` where the domain supports it, notably RSVPs; return current safe state on a legitimate conflict to support UI refresh.
- Soft-deletion and finance corrections are explicit operations; no arbitrary client `$set` into Mongoose models.
- Every unsafe cookie-authenticated request requires an allowed `Origin` and a CSRF protection mechanism (including guest capability sessions). `SameSite` alone is not enough.

## 3. Identity boundaries and security classes

| Identity class         | Evidence                                                             | Permitted scope                                                                                   | Important restriction                            |
| ---------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Public anonymous       | None                                                                 | Signup/login, public static pages, token-exchange entry, carefully limited password-reset request | Heavily rate limited; no tenant data             |
| Management `ADMIN`     | Valid `__Host-mme_session` + ACTIVE membership                       | Same-wedding operations plus membership management                                                | Cannot remove final ACTIVE admin                 |
| Management `ORGANIZER` | Same session + ACTIVE membership                                     | Same-wedding operational data and settings                                                        | Cannot create/remove/promote members             |
| Guest capability       | Valid `__Host-mme_guest` scoped cookie linked to ACTIVE guest link   | That guest's invited functions, RSVPs, photos and livestream                                      | Cannot see uninvited functions or admin data     |
| Cron/internal service  | Bearer `CRON_SECRET`                                                 | Daily work exclusively                                                                            | No direct user-management APIs                   |
| Resend webhook         | Verified provider signature, if enabled                              | Delivery event updates only                                                                       | Never trusts event without signature/idempotency |

**Management registration without email verification:** An account's email never independently authorizes joining. A recipient-bound admin-issued code delivered manually or by email proves invitation possession; manual delivery is not mailbox verification. Safe password recovery still requires mailbox control or a documented controlled recovery process.

**Private-link entry:** `/invite/{rawToken}` is **web entry routes**, not JSON API resources. Validate lookup hash and link state, set limited `HttpOnly`, `Secure`, `SameSite=Lax` cookie, and redirect to a secret-free guest URL. Initial GET must not RSVP, consume a one-time invitation, or trigger email sending. Revoke/rotate invalidates all existing portal sessions through per-request link-state verification. Use `Referrer-Policy: no-referrer`; disable analytics/prefetch on entry pages. Do not return bearer tokens in guest JSON.

### 3.1 Route authorization checks (mandatory sequence)

1. Validate HTTP method, body size, request origin/CSRF, and coarse rate limit.
2. Authenticate management session or portal capability, or authenticate `CRON_SECRET` for the internal job.
3. Resolve tenant server-side: for management, validate the explicit X-Wedding-Id candidate against that exact active wedding/membership; for guest, derive it from the capability record. Resolve only that membership's role and subject; never choose the first membership.
4. Parse/validate user input via Zod and check fine-grained quotas.
5. Fetch target resource by `{ _id, weddingId }`; for guest operations also check required invitation/assignment relationship within that tenant.
6. Apply business rules (deadline, count, vendor payment guard, photo quota, etc.) in service layer; use transaction/conditional update when needed.
7. Record safe audit event for high-impact changes and return a safe DTO.

## 4. Management authentication, wedding membership and settings endpoints

**Legend:** `P` = public; `M` = any active wedding manager (admin or organizer); `A` = administrator only; `G` = guest capability; `I` = internal cron/webhook. All paths in the tables are relative to `/api/v1`, unless explicitly marked otherwise.

### 4.1 Authentication and management membership

| Method & path                                | Access                         | Request / behavior                                                                                                                | Success                                                                      |
| -------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `GET /auth/csrf`                             | P or cookie holder             | Obtain per-session/pre-session CSRF value; no private tenant data                                                                 | `200` token/metadata                                                         |
| `POST /auth/register`                        | P                              | `displayName`, `email`, `password`; no verification gate, unique normalized email; throttle                                       | `201` safe user, management session                                          |
| `POST /auth/login`                           | P                              | `email`, `password`; generic bad-credentials response                                                                             | `200` safe user, secure session cookie                                       |
| `POST /auth/logout`                          | M or signed-in unassigned user | Revoke server session and clear cookie                                                                                            | `204`                                                                        |
| `GET /auth/me`                               | Signed-in                      | Safe `{user,weddingCount}`; no arbitrary singular membership; selection via GET /weddings                                         | `200`                                                                        |
| `POST /auth/password-reset/request`          | P                              | `email`; generic accepted response whether or not registered                                                                      | `202`                                                                        |
| `POST /auth/password-reset/confirm`          | P                              | `token`, `newPassword`; verify single-use recovery token, revoke active sessions                                                  | `204`                                                                        |
| `GET /weddings`                              | Signed-in                      | Paginated accessible ACTIVE wedding cards with membership role/revision, dates/zone and cursor; optional bounded search           | `200` page                                                                   |
| `POST /weddings`                             | Signed-in                      | Create another wedding + first ADMIN atomically; persisted UUID Idempotency-Key, regardless of other memberships                  | `201` wedding                                                                |
| `GET /wedding`                               | M                              | Read current wedding from membership context                                                                                      | `200` wedding                                                                |
| `PATCH /wedding`                             | M                              | Allowlisted profile/theme/timezone fields; no tenant-ID change                                                                    | `200` updated wedding                                                        |
| `GET /members`                               | M                              | List managers and roles for assignment UI; no password or session info                                                            | `200` page                                                                   |
| `POST /member-invitations`                   | A                              | Recipient email, role/expiry, deliveryMethod MANUAL or EMAIL; manual needs no Resend setup/quota; optional custom email text      | `201` safe invitation metadata; no code                                      |
| `GET /member-invitations`                    | A                              | List pending/consumed/expired invites without codes                                                                               | `200` page                                                                   |
| `DELETE /member-invitations/{inviteId}`      | A                              | Revoke unused invite                                                                                                              | `204`                                                                        |
| `POST /member-invitations/redeem`            | Signed-in                      | `{email,code}`; validate recipient/state, consume and create/reactivate target pair atomically; other wedding memberships allowed | `200` safe membership/wedding summary                                        |
| `POST /member-invitations/{inviteId}/reveal` | A                              | Exact wedding + CSRF, rate limit, active/recoverable invitation; audited secret-free action                                       | `200` `{data:{code,expiresAt}}`, no-store, explicit secret-bearing exception |
| `PATCH /members/{memberId}`                  | A                              | `role`; guard final admin, enforce revision/transaction                                                                           | `200` member                                                                 |
| `DELETE /members/{memberId}`                 | A                              | Remove/revoke member; invalidate their management sessions; guard final admin                                                     | `204`                                                                        |

Implemented Team contract: create requires UUID Idempotency-Key, intendedEmail, deliveryMethod MANUAL|EMAIL, optional role (default ORGANIZER), expiry 24/48/168 hours (default 48), and optional subject (1–160 single-line characters)/message (1–4,000). MANUAL creates no email job, requires no email credentials and consumes no email quota; safe metadata uses NOT_SENT/Email not requested. EMAIL preserves editable defaults and fixed code/expiry/acceptance instructions. Failed/unconfirmed sending leaves the active code available for admin reveal. Known configuration/quota failures offer an explicit manual fallback. Provider acceptance is not delivery and does not delete the recoverable active code. Reissue invalidates prior unused codes for the same wedding/email only. Codes never appear in URLs or ordinary list/create DTOs; a general app navigation URL is not an invitation credential.

Wedding listing defaults to 20 cards (maximum 100); signed cursors are bound to the current session and search term. Creation allows 10 new attempts per account per 15-minute window, persists idempotency in `idempotencyRecords`, exempts successful replays from that limit and returns `Retry-After` when limited. Listing invitations clears expired encrypted codes in bounded batches of at most 100 within the selected wedding; expiry prevents reveal/redemption immediately even before cleanup. This is not a scheduled queue worker.

`GET /members` returns safe member IDs, names, emails, roles, isYou and revision for the explicit wedding. PATCH `{role,revision}` returns `{data:{member}}`; DELETE `{revision}` returns 204. Only that wedding's membership changes, without global logout or loss of other weddings. Revalidate exact membership/role per request and at critical mutation commit; stale edits return 409. Removal preserves contributions/history, and rejoin reactivates the pair. Neither removal nor demotion may eliminate that wedding's last active admin, including concurrent requests.

Redemption accepts `{email,code}` after sign-in/CSRF, independently of any selected wedding. Case-sensitive 12-character code plus normalized recipient matching is required. Invalid/expired/replaced/revoked/used/wrong-account codes retain generic 422 feedback. Existing membership elsewhere is allowed; already belonging to the target returns 409 ALREADY_A_MEMBER without consumption/role change. Consumption, target-pair creation/reactivation and current-session rotation are atomic; unrelated sessions remain valid. Existing 15-minute account (10), source (30), recipient (20) limits, per-invitation 20-guess cap and Retry-After remain. Browser entry is `/weddings/join`, available regardless of membership count.

**Account onboarding nuance:** Signup alone never attaches an account to any wedding. Your weddings supports creating/joining an additional wedding at any time; matching email alone never grants authority. Management capability links remain unsupported. Ordinary API metadata and logs never expose codes; the explicit admin-only reveal POST is the narrow exception. Reveal requires X-Wedding-Id, CSRF, current admin membership and a valid active recoverable invitation; default limit 10/account/wedding/15 minutes, no-store and no-referrer. Unauthorized role returns 403, foreign/missing IDs 404, invalid invitation state 409 INVITATION_NOT_PENDING, legacy missing ciphertext 409 CODE_UNAVAILABLE with replacement guidance. Client masking, user-triggered copy and clearing are specified in the delivery plan.

Browser account navigation: `/`, `/sign-in` and `/register` read the session at request time. All valid sessions visiting account forms and fresh authentication successes go to `/weddings`, including zero/one/many states. Signed-in homepage actions say Your weddings. Preserve fresh navigation to discard prefetched signed-out pages. Scoped UI uses `/weddings/{weddingId}/...`, with dirty-draft protection when switching. Legacy unscoped management routes go to the selector; legacy setup/join entries go to `/weddings/new` and `/weddings/join`.

**Mandatory management context:** Existing tenant-owned API routes require X-Wedding-Id, even when the account has only one membership. Validate that exact ACTIVE wedding/membership and derive its role server-side; return 400 WEDDING_CONTEXT_REQUIRED for missing context, 400 malformed context, or indistinguishable 404 for nonexistent/foreign/removed context. Never fall back to the first membership. Auth, GET/POST /weddings and redemption are context-free exceptions; guest capabilities stay independent. GET /wedding returns the selected wedding plus safe membership ID/role/revision. All frontend queries, caches, requests, drafts and retries include the tab URL's wedding context; late responses cannot overwrite another context.

### 4.2 Wedding profile and settings

| Method & path                 | Access    | Contract notes                                                                          | Success |
| ----------------------------- | --------- | --------------------------------------------------------------------------------------- | ------- |
| `GET /settings`               | M         | Sanitized wedding profile, theme, RSVP defaults, reminder config, upload limits         | `200`   |
| `PATCH /settings/wedding`     | M         | Title, date range, tradition, wedding copy, timezone, cover photo ID; validated         | `200`   |
| `PATCH /settings/invitations` | M         | Theme template ID, copy/hero photo ID, invitation text defaults                         | `200`   |
| `PATCH /settings/reminders`   | M         | `enabled`, `daysBeforeDeadline`, `cooldownHours` within controlled bounds; defaults off | `200`   |
| `PATCH /settings/photos`      | M         | Organizer-managed guest upload settings and safe quota choices within platform caps     | `200`   |
| `PATCH /auth/profile`         | Signed-in | Own display name and non-security profile fields                                        | `200`   |
| `POST /auth/change-password`  | Signed-in | Current password + new password; rotate sessions per security policy                    | `204`   |

**Not an endpoint:** There is no `PATCH /settings/memberships` available to organizers. All member-management actions live behind administrator-only routes.

## 5. Wedding function and dashboard endpoints

Function records embed a bounded `scheduleItems[]` array; **there is no separate `scheduleItems` collection in the canonical database design**.

| Method & path                          | Access | Request / behavior                                                                                                          | Success                  |
| -------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `GET /dashboard/summary`               | M      | Upcoming functions, task summary, actual paid total, outstanding charge total, pending RSVPs, email problems, storage usage | `200` aggregated summary |
| `GET /functions`                       | M      | Filter status, upcoming, date window; sorted by `startsAt`                                                                  | `200` page               |
| `POST /functions`                      | M      | `name`, `startsAt`, optional `endsAt`, `venue`, dress code, schedule and notes                                              | `201` function           |
| `GET /functions/{functionId}`          | M      | Full same-wedding function detail                                                                                           | `200` function           |
| `PATCH /functions/{functionId}`        | M      | Allowlisted fields, venue and coordinates; validated lifecycle state                                                        | `200` function           |
| `PUT /functions/{functionId}/schedule` | M      | Replace bounded list `[{id?,title,startsAt,endsAt?,note?}]` atomically                                                      | `200` function schedule  |
| `POST /functions/{functionId}/archive` | M      | Mark function `ARCHIVED`; retain linked RSVPs, expenses, photos and audit                                                   | `200` function           |

**Business restrictions:** A function cannot be physically deleted if referenced by invitations, tasks, vendor charges, payments or photographs. Archiving is the default supported removal path. The service validates event time order, numeric latitude between -90 and 90 and longitude between -180 and 180, allowed YouTube URL patterns, and wedding-owned cover-photo references. Function status impacts guest displays consistently; explicit invitations are never automatically created for new functions.

Function creation/editing also enforces the inclusive wedding date range in the wedding’s selected time zone. Wedding profile edits must not exclude any ACTIVE function’s start or end. Both paths serialize through the wedding document within MongoDB transactions to prevent concurrent date edits from bypassing the invariant. Range conflicts return `422 WEDDING_DATE_CONFLICT` with field feedback. Archive requests include the function `revision`; stale requests return 409, foreign IDs return 404, and repeated successful archive requests are idempotent. Archiving retains the record and its references, records an audit event and excludes it from the active management schedule.

Function POST/PATCH bodies must also include `weddingRevision`, obtained from `GET /wedding`. This is separate from the function’s edit `revision`. Inside the same scheduling transaction, a mismatch returns `409 STALE_WEDDING_SCHEDULE` with the current wedding `revision`, `startsOn`, `endsOn`, `timeZone` and `title`, without saving the function. Clients refresh guidance, preserve entered local values and require another explicit submission after review; never silently retry a UTC conversion made using an obsolete zone. `weddingRevision` is a write precondition, not a stored function attribute or tenant authority.

Function POST/PATCH also requires `color`, chosen from `forest`, `copper`, `marigold`, `rose`, `plum` or `slate`; missing/unknown values return 422 with inline field feedback. Responses include the saved color. Older records without a color read as copper without an automatic database rewrite. The color decorates only the card border and a small title marker; cards retain white surfaces.

**Dashboard money:** `paidActual = SUM(POSTED expenses.amountPaise) + SUM(POSTED vendorPayments.amountPaise)`. Outstanding charges remain separate; avoid double counting. Vendors' personal balances must never be returned by guest dashboards.

## 6. Task and comment endpoints

| Method & path                                 | Access | Request / behavior                                                                                      | Success       |
| --------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------- | ------------- |
| `GET /tasks`                                  | M      | Filter `functionId`, `status`, `priority`, `assigneeUserId`, `assigneeVendorId`, due window; cursor     | `200` page    |
| `POST /tasks`                                 | M      | `title`, `description?`, `functionId?`, `assigneeType`, one assignee ID, `priority`, `dueAt?`, `status` | `201` task    |
| `GET /tasks/{taskId}`                         | M      | Detail, safely resolved assignee and counts                                                             | `200` task    |
| `PATCH /tasks/{taskId}`                       | M      | Allowlisted updates incl. Kanban status/order; validate same-wedding assignee                           | `200` task    |
| `DELETE /tasks/{taskId}`                      | M      | Soft-delete task; keep appropriate audit history                                                        | `204`         |
| `GET /tasks/{taskId}/comments`                | M      | Paginated comments, bounded author/mention display                                                      | `200` page    |
| `POST /tasks/{taskId}/comments`               | M      | `body`, `mentionedUserIds[]`; validate each mention is same-wedding manager                             | `201` comment |
| `PATCH /tasks/{taskId}/comments/{commentId}`  | M      | Edit comment content under a defined comment-edit policy                                                | `200` comment |
| `DELETE /tasks/{taskId}/comments/{commentId}` | M      | Soft-delete comment                                                                                     | `204`         |

**Task invariants:** `assigneeType` is `USER`, `VENDOR`, or `UNASSIGNED`; exactly the matching reference field must be present. Client cannot set `completedAt` arbitrarily. All managers in the wedding can see all tasks, including assignments created by someone else. Only managers update task status, including tasks assigned to a vendor.

## 7. Financial REST endpoints — expense tracker, not budgeting

The API distinguishes **standalone posted expenses** from **vendor agreed charges** and **vendor payments against charges**.

| Method & path                              | Access | Request / behavior                                                                             | Success                                |
| ------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------- | -------------------------------------- |
| `GET /finances/summary`                    | M      | Actual paid total, function paid totals, vendor agreed/paid/outstanding totals                 | `200` summary                          |
| `GET /expenses`                            | M      | List POSTED/VOID standalone expenses by function, date, category                               | `200` page                             |
| `POST /expenses`                           | M      | `description`, `category`, `amountPaise`, `paidAt`, `functionId?`, `notes?`; `Idempotency-Key` | `201` expense                          |
| `GET /expenses/{expenseId}`                | M      | Read full own-wedding expense                                                                  | `200` expense                          |
| `POST /expenses/{expenseId}/void`          | M      | `reason`; mark `VOID` and audit, never silently erase paid amount                              | `200` void result                      |
| `POST /expenses/{expenseId}/correct`       | M      | Replacement fields + reason; transactionally void original and create corrected expense        | `201` replacement + original reference |
| `GET /vendor-charges`                      | M      | Filter vendor, function, status                                                                | `200` page                             |
| `POST /vendor-charges`                     | M      | `vendorId`, `functionId?`, `description`, `amountPaise`; validated vendor/function tenant refs | `201` charge                           |
| `PATCH /vendor-charges/{chargeId}`         | M      | Change description/function/agreed amount; forbid reduction below POSTED payments              | `200` charge                           |
| `POST /vendor-charges/{chargeId}/void`     | M      | Only if no POSTED payments remain; else `409`                                                  | `200` charge                           |
| `GET /vendor-charges/{chargeId}/payments`  | M      | Payment history including VOID entries                                                         | `200` page                             |
| `POST /vendor-charges/{chargeId}/payments` | M      | `amountPaise`, `paidAt`, `paymentMethod?`, `reference?`, `notes?`, `Idempotency-Key`           | `201` payment                          |
| `POST /vendor-payments/{paymentId}/void`   | M      | `reason`; safe void and audit with concurrent charge guard                                     | `200` void result                      |

**Financial concurrency:** Payment insert must enforce `sum(POSTED payments) + newAmount <= vendorCharge.amountPaise` within a transaction or equivalent guarded ledger; return `409 PAYMENT_EXCEEDS_CHARGE` otherwise. A payment cannot refer to a charge or vendor of another wedding. All amounts are integer paise, no negative/refund workflow in v1. If organizers request “edit payment,” the UI implements _void + replacement_, not mutating the posted historical record. Finance endpoints do not accept a planned budget or spending ceiling.

**Transaction-dependent operations:** Initial admin membership, join redemption, final-admin role changes, posting a payment while enforcing charge balance, financial correction/void with audit where atomicity is required. In MongoDB deployments ensure transaction support is actually available and test it, rather than assuming every free-tier setup has identical behavior.

## 8. Vendor management and Google Places discovery endpoints

| Method & path                               | Access | Request / behavior                                                                                       | Success                              |
| ------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `GET /vendors`                              | M      | Search/filter internal vendors by category, name, status                                                 | `200` page                           |
| `POST /vendors`                             | M      | Organizer-entered vendor name, phones, category, notes, optional `googlePlaceId`; no Google result cache | `201` vendor                         |
| `GET /vendors/{vendorId}`                   | M      | Internal contact and responsibility detail                                                               | `200` vendor                         |
| `PATCH /vendors/{vendorId}`                 | M      | Edit independently maintained vendor data                                                                | `200` vendor                         |
| `POST /vendors/{vendorId}/deactivate`       | M      | Deactivate internal vendor; retain payment and responsibility history                                          | `200` vendor                         |
| `GET /vendors/{vendorId}/assignments`       | M      | Function assignments and responsibilities                                                                | `200` list                           |
| `POST /vendors/{vendorId}/assignments`      | M      | `functionId`, `responsibilities[]`, window/notes; unique per vendor-function                             | `201` assignment                     |
| `PATCH /vendor-assignments/{assignmentId}`  | M      | Update responsibilities and assignment status                                                            | `200` assignment                     |
| `DELETE /vendor-assignments/{assignmentId}` | M      | Cancel/disable assignment; dependent task access reflects updated scope                                  | `204`                                |
| `POST /vendor-discovery/nearby`             | M      | Search with `latitude`, `longitude`, `radiusMeters`, supported `category`, `pageSize`                    | `200` attributed live Places results |
| `POST /vendor-discovery/text`               | M      | `query`, location center/radius or bias, bounded result count                                            | `200` attributed live Places results |

**Google Places proxy requirements:** Only the backend calls `places:searchNearby` or `places:searchText`, with a server-held restricted key and an explicit, cost-conscious `X-Goog-FieldMask`. Nearby place type and category mapping must use allowed Places API New taxonomies. APIs cannot accept arbitrary upstream URLs, field masks, or request payloads. If billing is disabled, quota exhausted, or Google unavailable, return a clear non-sensitive error and allow manual vendor creation. Show attribution and a Google Maps link for live results. Persist only Google place IDs when allowed, plus independently entered vendor details. No booking, ratings cache, reviews, leads, or quote workflow. **Google Places billing must be enabled; cost caps are separate from app-level rate limits.**

**Discovery result DTO (not persisted as a Google listing):** `placeId`, permitted live `displayName`, `formattedAddress`, `location`, `googleMapsUri?`, `attributions[]`, `source: "GOOGLE_PLACES"`. Availability of individual fields depends on selected mask/SKU and applicable policy; never assume that adding fields has no cost. Never accept Google result `formattedAddress` or `displayName` as an automatically permanent organizer-maintained field.

## 9. Guest records, function invitations and RSVP management endpoints

| Method & path                                     | Access | Request / behavior                                                                                                       | Success                   |
| ------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| `GET /guests`                                     | M      | Search name/email, active status, function filter; pagination                                                            | `200` page                |
| `POST /guests`                                    | M      | `displayName`, optional `email`, optional `personalMessage`; optional initial `functionInvitations[]` created atomically | `201` guest + invitations |
| `GET /guests/{guestId}`                           | M      | Guest, link state and function invitation summary (never plaintext secret unless explicit secure copy action)            | `200` guest               |
| `PATCH /guests/{guestId}`                         | M      | Name, optional email, personal message, opt-out/status under policy                                                      | `200` guest               |
| `POST /guests/{guestId}/disable`                  | M      | Disable guest and revoke portal access; preserve RSVP history                                                            | `200` guest               |
| `GET /guests/{guestId}/function-invitations`      | M      | Function-wise eligibility, RSVP, attendee max, deadlines                                                                 | `200` list                |
| `POST /guests/{guestId}/function-invitations`     | M      | Add eligible function with `functionId`, `maxAttendees`, optional deadline override/upload flag                          | `201` invitation          |
| `PATCH /function-invitations/{invitationId}`      | M      | Update `maxAttendees`, deadline override, upload permission; never silently reduce max below accepted count              | `200` invitation          |
| `DELETE /function-invitations/{invitationId}`     | M      | Set eligibility to `REVOKED` and `revokedAt`; retain this invitation's historical RSVP                                   | `204`                     |
| `PATCH /function-invitations/{invitationId}/rsvp` | M      | Audited organizer override, even after deadline; `status`, `attendeeCount`, `reason`                                     | `200` invitation          |
| `GET /rsvps/summary`                              | M      | `functionId?` and groupings; invited recipients, accepted/declined/pending, confirmed people                             | `200` summary             |
| `POST /guests/{guestId}/links`                    | M      | Create guest's unique private link if absent, return shareable URL to manager                                            | `201` link                |
| `POST /guests/{guestId}/links/rotate`             | M      | Revoke old link/sessions, create new link and update encrypted resend secret                                             | `201` replacement URL     |
| `DELETE /guests/{guestId}/links`                  | M      | Revoke active guest link/sessions                                                                                        | `204`                     |
| `POST /guests/{guestId}/links/reveal`             | M      | Explicit authorized copy action; decrypt active secret; `Cache-Control: no-store`, audited without secret                | `200` private URL         |

**Guest eligibility invariant:** Each invited function has one `functionInvitations` record and unique `(weddingId, guestId, functionId)` index. The one guest URL opens a portal containing only those eligible function invitations. A guest can have one RSVP status and maximum per function, not one wedding-wide RSVP.

**Function eligibility:** `functionInvitations.eligibilityStatus: ACTIVE|REVOKED` and `revokedAt?` are separate from RSVP status. `DELETE` is a soft revoke. All guest function, RSVP, gallery, signed media URL, livestream and reminder queries require active eligibility. Historical RSVP remains available to authorized managers and audit workflows.

### 9.1 Guest capability portal API

These routes use a guest cookie; **they never receive a raw private link token, guest ID, or wedding ID as proof of access**.

| Method & path                                         | Access | Response / action                                                                                                      |
| ----------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| `GET /guest/me`                                       | G      | Personalized guest name, limited wedding presentation, effective invitation permissions                                |
| `GET /guest/functions`                                | G      | Eligible active function cards with dates, schedule, venue, RSVP deadline, countdown inputs and livestream eligibility |
| `GET /guest/functions/{functionId}`                   | G      | Single eligible function detail; unrelated function returns `404`                                                      |
| `GET /guest/function-invitations`                     | G      | That guest's function RSVP states/counts/deadlines and upload flags                                                    |
| `PUT /guest/function-invitations/{invitationId}/rsvp` | G      | Versioned RSVP action, scoped to that guest; see contract below                                                        |
| `GET /guest/photos`                                   | G      | Paginated READY photo metadata for an invited `functionId`; no public bucket paths                                     |

**RSVP request example:**

```json
{
  "status": "ACCEPTED",
  "attendeeCount": 3,
  "revision": 2
}
```

**Server checks:** Resolve session to `guestId` and wedding, find `functionInvitations` by `_id`, `guestId`, `weddingId`, `eligibilityStatus=ACTIVE`; load active function; enforce `deadlineOverrideAt ?? function.rsvpDeadlineAt`; validate `1 <= attendeeCount <= maxAttendees` if accepted, exactly `0` if declined; atomically update only if `revision` and active eligibility match, increment revision, set `respondedAt`. `PENDING` is an organizer-created state; a guest does not submit an arbitrary PENDING state. **API v1 mapping: `409 RSVP_DEADLINE_PASSED`; `409 STALE_REVISION`; `422 ATTENDANCE_LIMIT_EXCEEDED`.**

**Sample response:**

```json
{
  "data": {
    "id": "66c0d49e7a00cb84f0810123",
    "functionId": "66c0d49e7a00cb84f0810111",
    "status": "ACCEPTED",
    "attendeeCount": 3,
    "maxAttendees": 5,
    "revision": 3,
    "respondedAt": "2026-12-08T10:30:00.000Z"
  },
  "meta": { "requestId": "req_example" }
}
```

**Deadline consistency:** Every RSVP write checks the current effective deadline server-side; the same rule drives reminder eligibility. There is no confirmation email requirement for an RSVP in v1.

## 10. Vendor access removed

No vendor portal, capability cookie, exchange, private-link or completion endpoints are supported. Managers maintain vendor records and task status. Former `/vendor` and `/api/v1/vendor/...` routes return 404, as do vendor link/access routes.

## 11. Email invitation, reminder and job APIs

Email requests create durable outbox jobs; external provider sending is **not** a transactional part of the organizer's HTTP request. Resend quotas apply **platform-wide**, even across separate weddings.

| Method & path                  | Access             | Request / behavior                                                                                            | Success                                     |
| ------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `POST /emails/invitations`     | M                  | `guestIds[]` (bounded) and optional `messageOverride`; enqueue one per eligible guest with email/link         | `202` `queuedCount`, `skipped[]`, `batchId` |
| `POST /emails/reminders`       | M                  | `functionId`, optional `invitationIds[]`; only Pending, active, future deadline, email present, not opted-out | `202` queued/skipped breakdown              |
| `GET /emails`                  | M                  | Paginated outbox delivery history by guest, kind, status, date                                                | `200` page                                  |
| `GET /emails/{emailJobId}`     | M                  | Job status/attempts and safe provider result; no raw invitation link                                          | `200` job                                   |
| `POST /emails/process-next`    | M                  | Explicit bounded batch trigger with quota/lease guard; never unrestricted background loop                     | `202` processed/remaining estimate          |
| `GET /emails/usage`            | M                  | Wedding-level usage and platform capacity indicator, without other tenants' addresses                         | `200` summary                               |
| `GET /api/internal/cron/daily` | I                  | Outside `/api/v1`; secret-protected daily job for reminder eligibility + due outbox drain + bounded cleanup   | `200` internal counts                       |
| `POST /api/webhooks/resend`    | Provider signature | Outside `/api/v1`; signed provider event updates delivery/bounce, idempotent                                  | `200` ack                                   |

**Email outbox contract:** `emailOutbox` is canonical. Persist states `QUEUED`, `PROCESSING`, `SENT`, `DELIVERED`, `FAILED`, `BOUNCED`, `CANCELLED`. `SENT` means Resend accepted the message; `DELIVERED` is shown only if confirmed. Retryable failure may be represented as `FAILED` with `sendAfter` future and `attemptCount` below maximum, or put back to `QUEUED` atomically; do not invent undocumented persistent `RETRY_DUE`. Stable dedupe keys and provider idempotency keys are reused across retry attempts. Provider webhook status transitions must not regress terminal statuses.

**Invitation outbox request example:**

```json
{
  "guestIds": ["66c0d49e7a00cb84f0810133", "66c0d49e7a00cb84f0810134"]
}
```

**Response (queued, not delivered):**

```json
{
  "data": {
    "batchId": "batch_2026_12_01_a",
    "queuedCount": 2,
    "skipped": [],
    "message": "Invitation emails accepted for processing"
  },
  "meta": { "requestId": "req_example" }
}
```

**Reminder generation:** Use wedding timezone and `enabled`/`daysBeforeDeadline`/cooldown settings, `functionInvitations.status=PENDING`, ACTIVE eligibility and active guest/link, email presence, opt-out absence, and _future_ effective deadline. Recheck immediately before Resend call. A daily cron may run with hour-level imprecision; do not promise exact reminder times. Sending 200 emails on a 100/day allowance requires backlog display and manual small-batch alternatives, not false delivery guarantees.

**Link confidentiality:** The outbox contains `guestId`, `functionId?`, recipient email, safe template content, link ID reference, and dedupe key—**not the plaintext bearer URL**. The sender constructs the URL by decrypting the active AES-256-GCM link secret only at dispatch using an external versioned key. `POST /emails/invitations` may enqueue but must never return guest links to unauthorized users. A revoked link or function invitation causes cancellation/skip, not a stale URL email. Never log the decrypted token, signed URL, encryption key, nonce or authenticated plaintext.

**Webhooks:** If enabled, verify Resend's documented signing scheme against the raw request before parsing/trusting event data; save a unique provider event ID in `emailWebhookEvents`. Webhooks are for post-send statuses and bounce/suppression; sender success itself is recorded separately. If no webhooks are configured, do not show `DELIVERED` based merely on provider acceptance.

## 12. Cloudflare R2 photo/media endpoints

The image workflow uses **private R2, client-side compression, signed direct PUT, server-side verification, immediate publication after successful technical checks**, and never a human approval queue.

| Method & path                     | Access                                               | Request / behavior                                                                                     | Success                                                  |
| --------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `POST /media/upload-intents`      | M/G                                   | `functionId`, declared `mimeType`, `sizeBytes`, `fileName?`; enforce source-specific eligibility/quota | `201` `{photoId, uploadUrl, requiredHeaders, expiresAt}` |
| `POST /media/{photoId}/finalize`  | Original authorized uploader, or M                   | Verify exact R2 object exists and matches expected key/size/file signature/dimensions; mark READY      | `200` safe photo DTO                                     |
| `GET /media`                      | M                                                    | Paginated photo metadata, `functionId`, `uploadState` filters                                          | `200` page                                               |
| `GET /media/{photoId}`            | M or eligible G/V, when allowed                      | Metadata only; READY and function scope enforced                                                       | `200` photo                                              |
| `GET /media/{photoId}/read-url`   | M or eligible G/V where upload/preview scope permits | Create short-lived presigned GET after per-request eligibility check                                   | `200` URL + expiry; `no-store`                           |
| `DELETE /media/{photoId}`         | M                                                    | Soft-delete DB metadata and schedule actual object removal                                             | `204`                                                    |
| `PATCH /media/{photoId}/function` | M                                                    | `functionId`; validate same-wedding function; instantly change gallery eligibility                     | `200` photo                                              |
| `GET /guest/photos`               | G                                                    | See eligible READY photos only, with cursor and function filter                                        | `200` page                                               |

**Intent request:**

```json
{
  "functionId": "66c0d49e7a00cb84f0810111",
  "mimeType": "image/webp",
  "sizeBytes": 1258291,
  "fileName": "family-photo.webp"
}
```

**Intent response (URL shortened for documentation):**

```json
{
  "data": {
    "photoId": "66c0d49e7a00cb84f0810166",
    "uploadUrl": "https://<account>.r2.cloudflarestorage.com/<bucket>/<key>?<signed-parameters>",
    "requiredHeaders": { "Content-Type": "image/webp" },
    "expiresAt": "2026-12-10T09:35:00.000Z"
  },
  "meta": { "requestId": "req_example" }
}
```

The documented URL is illustrative, never an actual credential. The browser uses `PUT` **directly to R2** and then calls `POST .../finalize`. A `READY` record is created only after trustworthy object verification. If technically invalid, mark `FAILED` and clean it up. If upload never completes, a daily/maintenance cleanup may remove stale `INITIATED` records and orphan objects. No gallery user sees `INITIATED` or `VALIDATING` photos.

**Security/privacy trade-off:** A 30–60-second signed GET is itself a bearer URL and can outlive an organizer's photo delete/reassignment for that brief period. Cache-control `no-store` and short expiries reduce exposure. The bucket must not be public and private photo objects must not be automatically cached on a public CDN. The backend never uses storage-key folder names as authorization evidence; only the current `photos.functionId` and invitation relation count.

**Uploader authorization:** Management = any wedding manager; guest = only active function invitation with `uploadAllowed=true`. Vendors, including photographers, have no upload capability.

## 13. Internal, operational, audit and lifecycle endpoints

| Method & path                  | Access                         | Behavior                                                                                                                        |
| ------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `GET /audit-events`            | M                              | Cursor page of sanitized same-wedding high-impact changes, no raw tokens                                                        |
| `GET /health`                  | Internal deployment-safe route | Minimal liveness response; do not disclose DB credentials or provider state publicly                                            |
| `GET /api/internal/cron/daily` | I                              | Protected daily job: eligible reminder creation, email outbox drain, bounded stale-upload cleanup; strict time budget and lease |
| `POST /api/webhooks/resend`    | Signed provider                | Optional delivery/bounce transitions using raw-body signature verification                                                      |
| `GET /service-usage`           | M                              | Safe wedding usage data, current configured photo/email cap and Google Places availability; no other tenant PII                 |

The exact health/cron path should be registered once in the Next.js router and consistently configured in Vercel. Cron calls use `Authorization: Bearer <CRON_SECRET>`; reject missing/wrong secret before touching queues. Cron invocations must be idempotent, acquire a global lease, and remain within function timeout. Logs must contain request IDs and non-sensitive error codes, never tokens, cookies, email bodies, or signed R2 URLs.

**Out-of-scope endpoints:** `/budgets`, `/payments/checkout`, `/vendor-bookings`, `/guest/login`, `/vendor/login`, `/weddings/switch`, `/google/oauth`, `/photos/approve`, `/photos/reject`, `/sms`, `/whatsapp`, `/hotel`, `/seating`, `/uploads/videos`. These must **not** be created as placeholders in Version 1.

## 14. Request validation and input contracts

### 14.1 Zod validation rules by domain

| DTO                       | Required checks                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Auth signup               | Valid normalized email, bounded name, secure password policy; no email verification flag required for signup  |
| Wedding/function          | Trimmed bounded strings; valid timezone; `endsAt > startsAt` if provided; date sanity                         |
| Venue                     | `latitude ∈ [-90,90]`, `longitude ∈ [-180,180]`, both supplied together if either is supplied; safe `mapUrl`  |
| Schedule item             | Bounded array (proposed 50 items); ordered valid UTC timestamps; no arbitrary Mongo operators                 |
| Task                      | Title length, enum status/priority, single valid assignee reference, same-wedding relation                    |
| Expense/payment           | Safe positive integer `amountPaise`, valid date, same-tenant references, no negative/refund request           |
| Vendor discovery          | Valid center, bounded radius/result count, allowlisted place types, query length; limit total calls           |
| Guest/function invitation | Bounded personalized text; `maxAttendees >= 1`; accepted count cannot exceed max; optional deadline override  |
| RSVP                      | `status ∈ {ACCEPTED,DECLINED}`, accepted count ≥1 and ≤ private maximum; declined count 0; revision required  |
| Email send                | Bounded unique guest/invitation ID lists, validated recipient email, safe templates, opt-out/cooldown checks  |
| Upload intent             | Allowlisted MIME, positive size ≤ configured cap, safe image content after finalization, function eligibility |

Cross-document refs are checked in service/repository layers, not only by Zod. Reject unknown privileged fields (`weddingId`, `role`, payment status, `tokenHash`, `storageKey`, `providerMessageId`) rather than silently applying them.

### 14.2 Error catalog

| Stable code                                 | When returned                                                          | Expected UI behavior                                                              |
| ------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `AUTH_REQUIRED` / `SESSION_EXPIRED`         | No valid management or portal cookie                                   | Show sign-in for manager; show invalid-link guidance for guest             |
| `CSRF_INVALID`                              | Missing/wrong CSRF or origin                                           | Refresh security token / repeat safely                                            |
| `PERMISSION_DENIED`                         | Role lacks action                                                      | Hide forbidden control; show concise explanation                                  |
| `RESOURCE_NOT_FOUND`                        | Absent or not within scope                                             | Do not leak cross-tenant existence                                                |
| `TOKEN_REVOKED` / `TOKEN_EXPIRED`           | Link entry rejected                                                    | Explain private link no longer works without identifying tenant                   |
| `VALIDATION_ERROR`                          | DTO parsing fails                                                      | Inline input correction                                                           |
| `STALE_REVISION`                            | Concurrency conflict                                                   | Reload current state before submitting                                            |
| `RSVP_DEADLINE_PASSED`                      | Guest edit after deadline                                              | Show locked state, no client-side bypass                                          |
| `ATTENDANCE_LIMIT_EXCEEDED`                 | Guest attempts too many attendees                                      | Display organizer-set allowable count                                             |
| `PAYMENT_EXCEEDS_CHARGE`                    | Sum would exceed agreed amount                                         | Adjust charge or correct payment                                                  |
| `ALREADY_A_MEMBER` / `LAST_ADMIN_REQUIRED`  | Already belongs to target wedding / final admin change in that wedding | Open target wedding / explain per-wedding restriction; no global membership limit |
| `EMAIL_QUOTA_EXCEEDED`                      | Resend provider/platform quota reached                                 | Keep job queued, show retry availability                                          |
| `PLACE_SEARCH_UNAVAILABLE`                  | Billing/Google/quota issue                                             | Provide manual vendor entry option                                                |
| `PHOTO_NOT_READY` / `UPLOAD_LIMIT_EXCEEDED` | Invalid/unfinalized upload / quota                                     | Retry safely or select smaller photo                                              |
| `RATE_LIMITED`                              | Abuse/rate guard                                                       | Show cooldown; `Retry-After` when relevant                                        |
| `DEPENDENCY_UNAVAILABLE`                    | DB, R2, Resend transient issue                                         | Don't claim operation succeeded                                                   |

### 14.3 Example invalid attendance response

```json
{
  "error": {
    "code": "ATTENDANCE_LIMIT_EXCEEDED",
    "message": "The attendee count exceeds the invitation limit.",
    "details": { "maxAttendees": 5 }
  },
  "meta": { "requestId": "req_example" }
}
```

Do not disclose a guest's private maximum to someone with no valid guest session; the example applies only after successful capability authorization.

## 15. Rate limiting, quotas and idempotency

Implement distributed (MongoDB-backed) counters in `rateLimitWindows`, not an in-memory process map. Every limit is enforced server-side and tuned after representative tests.

| Surface                    | Suggested starting policy; configurable, **not yet a final user-approved quota**               |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| Signup/login               | Per IP and normalized email, progressive throttling after failures                             |
| Password reset             | Per IP and target identity; generic response                                                   |
| Guest link exchange | Per IP and token fingerprint; avoid open enumeration                                           |
| Guest RSVP                 | Example 12 mutations per link/hour; `revision` protects lost updates                           |
| Vendor completion          | Low per-link mutation cap, completion is idempotent                                            |
| Photo intent               | Per-link and per-wedding upload count, size, and byte quota                                    |
| Vendor discovery           | Example 20 searches per wedding/day and strict platform total guard, subject to billing budget |
| Email                      | Per-wedding and platform daily/monthly reservations; resend/cooldown/dedup guard               |
| Cron                       | Secret only, exclusive lease, fixed per-run work cap                                           |

If a quota reservation itself fails because MongoDB is unavailable, fail closed for paid/abuse-sensitive operations rather than making an unmetered Google or Resend request. TTL cleanup is eventual and not a substitute for explicit current-window checks.

**Bulk actions:** Sending 200 invitations must not be described as instant. `POST /emails/invitations` enqueues work and optionally drains a handful of jobs inside the request; remaining jobs progress on later explicit processing or daily cron, respecting platform allowance. No reliable always-on worker is assumed on Vercel Hobby.

## 16. End-to-end contracts and failure scenarios

### 16.1 Create wedding and onboard organizers

1. Public signup (no email verification) creates user, DB session and cookie.
2. GET /weddings lists accessible weddings; POST /weddings creates another wedding + ADMIN pair atomically, using idempotency to prevent duplicate attempts rather than a one-active-user restriction.
3. Admin POST /member-invitations creates a short-lived single-use code for manual sharing or optional email. Only a separate authorized reveal exposes the active code.
4. Invitee signs up/logs in and POST /member-invitations/redeem; the manually shared or emailed code, not email text alone, proves invitation authority. Other wedding memberships are allowed.
5. A role change/removal checks that wedding's active admin count atomically and invalidates that membership's authority, preserving account access to unrelated weddings.

### 16.2 Guest invitation → RSVP → reminder

1. Manager creates guest and one or more `functionInvitations`, assigns max headcount/deadlines.
2. Manager generates guest link and shares it manually or queues a Resend invitation. Link lookup secret stays hashed + proposed encrypted copy.
3. Guest opens `/invite/{token}`, gets scoped cookie, redirects to clean invitation page.
4. Guest gets allowed functions and submits versioned RSVP via `PUT /guest/function-invitations/{id}/rsvp`.
5. `GET /rsvps/summary` aggregates headcounts; pending invitation remains reminder candidate.
6. Manager sends a manual reminder or daily cron generates due reminders; before Resend call, check RSVP still Pending, email present, deadline future, link active, and opt-out/cooldown.

### 16.3 Vendor discovery → assignment → expense

1. Manager searches Google Places through backend proxy with validated location/category and quota limits.
2. Manager creates their own vendor record, optionally referencing Google `placeId` (no permanent listing cache).
3. Manager assigns vendor to function, creates task and agreed charge.
4. Manager records partial payment using transaction/idempotency guard; actual paid total updates, due amount decreases.
5. Manager updates vendor-assigned task status. Vendor access and link-generation endpoints are unavailable.

### 16.4 Photo upload → immediate gallery

1. Guest or authorized manager requests upload intent for an eligible function.
2. API reserves quota and creates `photos.uploadState=INITIATED`; issues very short private R2 presigned PUT.
3. Browser uploads compressed photo directly to R2.
4. Finalize verifies object and changes state `VALIDATING → READY`; it appears immediately, without human approval.
5. Gallery uses authorized metadata query; each read URL requires fresh function eligibility.
6. Organizer delete/retag changes future access immediately; already issued presigned URLs can persist until expiry.

### 16.5 Operational failure handling

| Failure                                            | Required contract behavior                                                             |
| -------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Duplicate POST payment                             | Same key/body returns original safe result; different body with reused key returns 409 |
| Two admins remove each other                       | Transaction/guard preserves at least one ACTIVE administrator                          |
| Guest edits RSVP in two tabs                       | One revision succeeds, other receives `409 STALE_REVISION`                             |
| Guest invitation revoked during email queue        | Sender rechecks link; marks job CANCELLED, does not email dead link                    |
| Resend network timeout after acceptance            | Retry with same provider idempotency key; acknowledge residual at-least-once risk      |
| R2 direct PUT completes but client misses finalize | Item not visible; client can retry finalize; stale cleanup bounded                     |
| Photo moved to uninvited function                  | Guest gets no new signed URL; old issued URLs naturally expire                         |
| Google Places disabled/over quota                  | Search reports unavailability; manual vendor record remains available                  |
| Mongo rate-limit counter unavailable               | Fail closed for anonymous writes and paid provider calls                               |
| Daily cron runs twice                              | Lease/dedupe permits one effective reminder per scheduled window                       |

## 17. Test strategy, phase mapping and release gates

### 17.1 Contract and integration tests

- **Zod / routes:** valid and invalid request DTOs, query parameters, unknown sensitive fields, standard response envelope.
- **Authentication:** no signup email verification gate, generic login errors, Argon2id password storage, cookie flags, CSRF, password reset, login throttling.
- **Tenancy:** Wedding A IDs submitted by Wedding B manager always yield 404 and never mutate data; list filters cannot bypass scope.
- **Membership:** concurrent first-wedding creation, concurrent join invitations, self/last-admin removal, role elevation attempt by organizer.
- **Guest capabilities:** URL guessing/rate controls; revoked link stops new and existing sessions; guest sees invited functions only.
- **RSVP:** count lower/upper bounds, expired deadline, same request repeated, revision conflicts, organizer override audit, removed function eligibility.
- **Finance:** sums and no-double-count, concurrent payment cap, void/correction, foreign charge/vendor mismatch, idempotency replay.
- **Places:** allowed field mask, quotas and Google attribution; no bulk cached Google listing persistence; graceful provider failure.
- **Email:** correct link, no secret in outbox, quota reservation, duplicate cron/sends, provider webhook signature, pending-only reminders.
- **R2:** upload type/size/content verification, insufficient permission, READY-only gallery, delete and retag access, orphan cleanup.
- **Deployment:** request logs redacted, database restore drill, mobile smoke test at realistic 200-recipient wedding scale.

### 17.2 Phase-to-endpoint delivery

| Phase                             | API deliverables                                                                                         | Exit gate                                                         |
| --------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **P1 Foundation & tenancy**       | Auth, wedding create/profile, member invitations/roles, functions/schedule, settings foundation          | Cross-tenant and last-admin tests pass                            |
| **P2 Organizer operations**       | Dashboard, tasks/comments, expenses/charges/payments, manual vendor directory/assignments and in-app notifications | Payment consistency, notifications and management tenant isolation pass            |
| **P3 Guest experience**           | Guests, function-invitation records, private guest links, guest portal, RSVP, summaries                  | Revoked/uninvited access rejected; count/deadline/revision tested |
| **P4 Email**                      | Invitation/reminder sends, outbox listing, daily cron, webhook if configured, usage/settings             | Quota/dedupe/failure tests pass                                   |
| **P5 Photos & visual experience** | R2 intent/finalize/read, gallery, delete/retag; invitation theme settings and livestream fields          | Private media/no approval/authorized guest gallery tests pass     |
| **P6 Production**                 | Harden all endpoints; security/performance/backup, logs, staging and deployment validation               | No critical defects, restore and abuse cases verified             |

### 17.3 Minimum API release gate

- All non-public routes have explicit authentication/capability and tenant+role checks.
- CSRF/Origin and persistent rate limiting protect unsafe cookie-authenticated requests.
- API responses never contain password hashes, private token hashes, guest links to strangers, provider API keys, or R2 signing secrets.
- Payment and RSVP concurrency tests pass with MongoDB transactions/atomic guards.
- Guest invitation and email resend work without plaintext private token storage.
- R2 bucket is private; gallery routes enforce authorized function relation.
- Places billing, quota and field-mask restrictions are validated in deployment.
- Resend queue and daily cron cannot misreport queued mail as delivered.
- Revoke/link rotation and last-admin preservation are tested across concurrent sessions.

## 18. Approval checklist and deliberate decisions

Approved decisions are marked below. The remaining entries specify phase-specific implementation or operational choices, not additional product features.

| ID                  | Item                                           | Recommended API/database resolution                                                                                                                         |
| ------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A-01 — approved** | Reusable private URL for reminders             | `accessLinks` holds lookup hash plus AES-256-GCM ciphertext, unique nonce, authentication tag and key version; keys outside DB; authorized reveal/send only |
| **A-02 — approved** | Revoking one guest-function eligibility        | `functionInvitations.eligibilityStatus: ACTIVE                                                                                                              | REVOKED`and`revokedAt?`; historical RSVP status remains independent |
| **A-03 — approved** | RSVP deadlines                                 | Function default `rsvpDeadlineAt`, optional per-invitation override; audit authorized late organizer correction                                             |
| **A-04**            | Admin concurrency                              | Wedding membership version/guard in transaction; never lose last active admin                                                                               |
| **A-05**            | Money correction                               | Integer paise, reject overpayment, `VOID` + corrected replacement rather than silent edits                                                                  |
| **A-06**            | Media quotas and TTL                           | Choose per-upload/per-wedding caps and signed GET lifetime before deployment; e.g. 30–60s GET is provisional                                                |
| **A-07**            | Delivery/retention controls                    | Platform Resend caps, per-wedding soft caps, webhook event retention, opt-out/cooldown and error codes                                                      |
| **A-08**            | Function archive behavior                      | Archive instead of deleting referenced functions; invitations excluded from active guest views according to archive policy                                  |
| **A-09**            | Account recovery with unverified signup emails | Use mailbox-proof reset flow with rate limits or controlled assistance; never allow unverified-email-only role joining                                      |

**Implementation order:** Build the minimal scaffold first, then implement one phase at a time. A-04's last-admin invariant and tenant checks are binding; choose and test the concurrency mechanism in Phase 1. A-05 preserves expense-only finance and is detailed in Phase 2. Keep A-06 and A-07 configurable until media/email phases and finalize before production. Clarify A-08 archive presentation and A-09 recovery procedure during their respective implementation work without weakening the PRD's access rules.

## 19. External references

- Google Places API (New) — Nearby Search and field masks: https://developers.google.com/maps/documentation/places/web-service/nearby-search
- Google Places — policy and caching: https://developers.google.com/maps/documentation/places/web-service/policies
- Cloudflare R2 — presigned URLs: https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- MongoDB transactions: https://www.mongodb.com/docs/drivers/node/current/crud/transactions/
- MongoDB TTL indexes: https://www.mongodb.com/docs/current/core/index-ttl/
- Vercel Cron: https://vercel.com/docs/cron-jobs
- Resend — sending and idempotency: https://resend.com/docs
- OWASP Session Management: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- OWASP Password Storage: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html

**End of REST API Design & Contract Specification — Make My Event v1.0**

Deletion replay protection: creation idempotency rows become anonymous tombstones containing only their opaque key hash and deletion timestamp. Account, wedding and payload references are removed. This prevents an old creation retry from recreating an explicitly deleted wedding; a fresh creation key still permits a new wedding.

### Invitation delivery and deletion coordination — 13 November 2026

Permanent deletion also returns `409 INVITATION_DELIVERY_IN_PROGRESS` with `Retry-After: 5` while the selected wedding has a PROCESSING email-outbox reservation. The existing deletion dialog retains confirmation and displays the retry guidance.

### Invitation redemption session fencing — 13 November 2026

Redemption transactionally consumes the exact authenticated, active, unexpired current session before accepting the code or minting a replacement. Password changes and logout write that same row, so a paused request authenticated earlier receives 401 AUTH_REQUIRED after revocation; invitation/membership changes roll back and no replacement cookie is sent. If redemption commits first, a subsequent password change revokes its newly created session. Session rotation is single-use: parallel redemptions sharing one old cookie may require retry with the fresh session, while independently authenticated sessions can join separate weddings concurrently. Other legitimate sessions are not revoked by redemption itself.

## Operations refinement contracts - 14 November 2026

- GET /api/v1/notifications?view=count returns data: { unreadCount: number } only, scoped to the authenticated recipient and validated X-Wedding-Id; it does not load or expose inbox rows.
- POST /api/v1/finance/paid-expenses takes costInput (description, category, optional vendorId, amountPaise, currency INR, notes, UUID creationKey) plus weddingTimeZone, ISO paidAt and paymentMethod CASH/UPI/BANK/OTHER. It creates one expense and its full payment atomically; response 201 data contains expense and payment DTOs. Tenant/member/vendor/time-zone guards and creation-key replay/conflict rules apply. Invalid input leaves neither record.
- POST /api/v1/finance/{expenses|payments}/{id}/remove uses the existing source, revision, reason and creationKey body. It marks the entry VOID with retained history. Existing /correct remains a compatibility alias. Removing an expense with posted payments is rejected.
- Client bell requests are coalesced after successful selected-wedding data API responses (excluding notification endpoints to prevent feedback loops), focus/visibility return and notification mutations. No periodic timer; rapid requests share a count refresh.
