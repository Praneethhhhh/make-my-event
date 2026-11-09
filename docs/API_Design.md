# MAKE MY EVENT
## REST API Design & Contract Specification — Version 1.0

**Status:** Implementation design baseline — review required for nine policy defaults  
**Date:** 9 November 2026  
**Sources:** Final PRD v1.0; System Design & Architecture v1.0; Database Design v1.0  
**Architecture:** TypeScript, single Next.js App Router / Node.js modular monolith, MongoDB Atlas + Mongoose, Zod  
**Infrastructure:** Vercel, Resend, Vercel daily Cron, private Cloudflare R2, Google Places API (New)  
**Intended initial load:** ~200 guest recipients per wedding; multiple isolated wedding tenants  
**API base:** `/api/v1` (HTTPS; same-origin browser clients)

> **Contract principle:** API clients cannot select their own tenant. Server-validated management membership or scoped guest/vendor capability determines `weddingId`, authorization, and permitted functions. One wedding is a tenant; all administrators and organizers of that wedding share the same operational data. This document does **not** add a guest/vendor login, human photo moderation, budget allocation, or vendor booking.

## 1. Verification against the three source documents

### 1.1 Alignment matrix

| Dimension | PRD v1.0 | System design v1.0 | Database design v1.0 | API decision |
|---|---|---|---|---|
| Multi-tenancy | One wedding per management user in v1; multiple isolated weddings | Server-derived `weddingId` and scoped repositories | `weddingId` on wedding-owned records, partial unique active membership | Management routes derive tenant from session; never accept authority from request `weddingId` |
| Management | Multiple admins/organizers share the same wedding data; admin-only membership | Custom password/session auth | `users`, `authSessions`, `weddingMemberships`, `membershipInvites` | Cookie management session; admin-only membership mutations |
| Guests & vendors | No accounts; individually revocable private URLs | Token exchange to cookie-scoped portal session | `accessLinks`, `portalSessions` | Token entry via web pages; guest/vendor REST endpoints require their portal cookies |
| RSVP | One status/count per guest/function, limits and deadlines | Authorized conditional mutation | Unique `functionInvitations`, `revision` | Versioned RSVP update with server deadline/limit checks |
| Finance | Expense tracker, not budgets; paid and agreed amounts separate | Avoid double counting and race conditions | `expenses`, `vendorCharges`, `vendorPayments` | Immutable posted-payment history via void/correction; derived totals |
| Vendors | Manual directory and Places discovery, no booking | Server-side Places proxy, cost controls | Persistent `googlePlaceId` only for Google-derived listing reference | Search endpoints with cost caps; manual vendor save independent of Google listing cache |
| Email | Resend invitations, manual/daily pending-only reminders | Mongo outbox + bounded immediate send + daily cron | `emailOutbox`, `serviceUsage`, optional `emailWebhookEvents` | API accepts jobs, reports real delivery states, retries safely |
| Photos | Valid photo appears without human approval | Private R2 presigned PUT/GET, finalize verification | `photos` technical `uploadState`, no approval field | Upload intent → direct PUT → finalize → READY; authorized gallery and short read URLs |
| Hosting & ops | Cost-aware, logs, backup/recovery | Vercel Hobby daily Cron, basic JSON logs | Audit, TTL, quota counters | One protected cron endpoint; management operations expose operational summaries |

### 1.2 Inconsistencies and reconciliations

1. **Illustrative collection names differ.** System Design section 8 uses names such as `sessions`, `memberships`, `memberInvites`, `payments`, `accessCredentials`, `capabilitySessions`, `rateLimits` and a separate `scheduleItems`. Database Design uses the canonical `authSessions`, `weddingMemberships`, `membershipInvites`, `vendorPayments`, `accessLinks`, `portalSessions`, `rateLimitWindows`, and an embedded bounded `functions.scheduleItems` array. **Resolution:** this document follows the Database Design's 25 concrete collection names; amend the System Design's illustrative table in a later revision.
2. **Outbox status naming differs.** System Design names `PROVIDER_ACCEPTED`, `RETRY_DUE`, `SUPPRESSED`; Database Design uses `SENT`, `DELIVERED`, `FAILED`, `BOUNCED`, `CANCELLED`. **Resolution:** persist the database vocabulary; expose `SENT` as *accepted by provider, not necessarily delivered*, `FAILED` with `retryable` and `nextAttemptAt`, and `CANCELLED` for suppressed jobs. `PROCESSING` stays internal.
3. **Email must reuse the private guest link.** Link lookup requires one-way hashing, while reminders need to send the same URL again. **Proposed resolution:** store an AES-256-GCM-encrypted copy of the active capability secret in `accessLinks`, with envelope key material outside MongoDB; store a separate lookup hash. Decrypt only for authorized organizer copy/send or the email worker. Never put the token in an outbox payload, webhook, access log, or API audit entry. A later explicit policy approval is required before implementing this.
4. **RSVP deadline levels.** PRD states organizer-configured deadline; Database Design adds function default with per-recipient override. **Resolution:** effective deadline = invitation override if set, else function default; omit or null means no guest edit deadline only if the product expressly permits it. Organizer overrides after a deadline are audited.
5. **Concurrent admin/finance changes.** DB design requires a transaction/guard for the last-admin rule and payment balance correctness. **Resolution:** APIs return `409 CONFLICT` on stale revisions or conflicting edits; serializable business mutations occur in transactions/guarded atomic writes.
6. **Guest photo uploads have no human review.** All three documents agree; only technical validation precedes `READY`. The existing PRD screen label 'gallery management' is not an approval queue.
7. **External signed GET URLs are not immediately revocable.** All three agree on short-lived URLs and the residual exposure window. **Resolution:** issue short expiry (proposed 30–60 seconds), never public bucket URLs, and reauthorize each signing request.
8. **Open operational policies remain.** Retention lengths, photo size/storage caps, RSVP default/override, and email daily limits are not user-approved exact numbers. The API can specify validated ranges and configurable defaults without pretending these thresholds are finalized.

**Audit result:** The three documents are substantially aligned in product scope and overall architecture; items 1–3 and the open defaults must be reconciled before code is frozen. This document defines proposed contracts but does not silently edit prior files.

## 2. API conventions

### 2.1 Envelope, dates, monetary values and IDs

- JSON requests/responses over HTTPS with `Content-Type: application/json`; R2 bytes are sent directly to a presigned URL, not through the Next.js API.
- Resource IDs are opaque 24-hex MongoDB ObjectId strings. Never use a guessed ID as authorization evidence.
- Dates/times: ISO 8601 UTC timestamps (`2026-12-10T09:30:00.000Z`); wedding settings contain an IANA time zone for display and reminder computation.
- Currency in v1: `INR`. All amounts are **positive safe integers in paise** (`amountPaise`); totals are computed from POSTED records, not client-supplied aggregations.
- Enumerations use uppercase values, e.g., `ADMIN`, `ORGANIZER`, `TODO`, `PENDING`, `ACCEPTED`, `DECLINED`, `READY`.
- Server-set fields (`weddingId`, `createdByUserId`, payment totals, session/token digests, provider IDs) must not be accepted from untrusted clients.
- Internal database documents are mapped to explicit DTOs, excluding password hashes, token verifiers, raw secrets, audit-only details, private organizer notes from portals, and R2 storage credentials.

**Success response:** Standard single-result payload `{ "data": { ... }, "meta": { "requestId": "..." } }`. List results use `{ "data": [ ... ], "page": { "nextCursor": null, "limit": 20 }, "meta": { "requestId": "..." } }`. Empty success uses `204 No Content`.

**Error response:** `{ "error": { "code": "VALIDATION_ERROR", "message": "A safe message", "details": { ... } }, "meta": { "requestId": "..." } }`. `details` is optional and excludes secrets and other tenants' data.

### 2.2 Status codes and protected-resource concealment

| HTTP | Meaning / examples |
|---|---|
| `200` / `201` / `204` | Read/update success; created resource; successful empty action |
| `202` | Email request queued; does **not** claim email delivery |
| `400` | Malformed JSON, invalid ObjectId/shape, missing required CSRF header |
| `401` | Management/portal session absent or expired |
| `403` | Known session lacks required role/permission (e.g. organizer tries member role change) |
| `404` | Missing record **or resource outside the caller's authorized wedding/function** |
| `409` | Stale revision, duplicate membership/invitation, referenced function, financial conflict |
| `410` | Expired/revoked token entry (avoid token enumeration); RSVP deadline uses `409` in API v1 |
| `413` / `415` | Upload too large / unsupported format |
| `422` | Well-formed request violates domain rule (e.g. attendee count above limit) |
| `429` | Rate/quota limit with `Retry-After` when meaningful |
| `500` / `503` | Unexpected error / temporary provider or database outage; do not falsely report success |

### 2.3 Pagination and filtering

- Cursor pagination for guests, tasks, payments, photos, audit and email lists: `?limit=20&cursor=<opaque>&sort=...`; default 20, maximum 100. Opaque cursors encode a stable sort key and `_id` and must be signed or integrity-checked.
- Date/status/function filters are allowlisted and Zod-validated. Never allow arbitrary Mongo filter JSON or client-chosen projection operators.
- Summary endpoints compute grouped counts and use bounded aggregations. Avoid returning hundreds of private image URLs or emails in an unpaginated response.

### 2.4 Mutation safety

- Use `Idempotency-Key` (UUID or 16–128 ASCII chars) for all **creation of payments**, bulk email requests, first-admin wedding setup, and other critical non-idempotent operations. Keys are scoped to the principal + operation + wedding, persisted in `idempotencyRecords`, and a reused key with different request body returns `409`.
- For optimistic edits use `revision`/`If-Match` where the domain supports it, notably RSVPs; return current safe state on a legitimate conflict to support UI refresh.
- Soft-deletion and finance corrections are explicit operations; no arbitrary client `$set` into Mongoose models.
- Every unsafe cookie-authenticated request requires an allowed `Origin` and a CSRF protection mechanism (including guest/vendor capability sessions). `SameSite` alone is not enough.

## 3. Identity boundaries and security classes

| Identity class | Evidence | Permitted scope | Important restriction |
|---|---|---|---|
| Public anonymous | None | Signup/login, public static pages, token-exchange entry, carefully limited password-reset request | Heavily rate limited; no tenant data |
| Management `ADMIN` | Valid `__Host-mme_session` + ACTIVE membership | Same-wedding operations plus membership management | Cannot remove final ACTIVE admin |
| Management `ORGANIZER` | Same session + ACTIVE membership | Same-wedding operational data and settings | Cannot create/remove/promote members |
| Guest capability | Valid `__Host-mme_guest` scoped cookie linked to ACTIVE guest link | That guest's invited functions, RSVPs, photos and livestream | Cannot see uninvited functions or admin data |
| Vendor capability | Valid `__Host-mme_vendor` scoped cookie linked to ACTIVE vendor link | Own assignments, payments and task completion; scoped photographer uploads | No other vendor details or financial edits |
| Cron/internal service | Bearer `CRON_SECRET` | Daily work exclusively | No direct user-management APIs |
| Resend webhook | Verified provider signature, if enabled | Delivery event updates only | Never trusts event without signature/idempotency |

**Management registration without email verification:** A user may create an account with an unverified email. That email must not independently authorize wedding membership, admin invitations, or account linking. A single-use admin-issued membership invite proves permission to join; safe password recovery requires actual mailbox control or a documented controlled recovery process.

**Private-link entry:** `/invite/{rawToken}` and `/vendor/{rawToken}` are **web entry routes**, not JSON API resources. Validate lookup hash and link state, set limited `HttpOnly`, `Secure`, `SameSite=Lax` cookie, and redirect to a secret-free guest/vendor URL. Initial GET must not RSVP, complete tasks, consume a one-time invitation, or trigger email sending. Revoke/rotate invalidates all existing portal sessions through per-request link-state verification. Use `Referrer-Policy: no-referrer`; disable analytics/prefetch on entry pages. Do not return bearer tokens in guest/vendor JSON.

### 3.1 Route authorization checks (mandatory sequence)

1. Validate HTTP method, body size, request origin/CSRF, and coarse rate limit.
2. Authenticate management session or portal capability, or authenticate `CRON_SECRET` for the internal job.
3. Resolve tenant **server-side** (`weddingId` from membership or access-link record), role and entity subject.
4. Parse/validate user input via Zod and check fine-grained quotas.
5. Fetch target resource by `{ _id, weddingId }`; for guest/vendor operations also check required invitation/assignment relationship within that tenant.
6. Apply business rules (deadline, count, vendor payment guard, photo quota, etc.) in service layer; use transaction/conditional update when needed.
7. Record safe audit event for high-impact changes and return a safe DTO.

## 4. Management authentication, wedding membership and settings endpoints

**Legend:** `P` = public; `M` = any active wedding manager (admin or organizer); `A` = administrator only; `G` = guest capability; `V` = vendor capability; `I` = internal cron/webhook. All paths in the tables are relative to `/api/v1`, unless explicitly marked otherwise.

### 4.1 Authentication and management membership

| Method & path | Access | Request / behavior | Success |
|---|---|---|---|
| `GET /auth/csrf` | P or cookie holder | Obtain per-session/pre-session CSRF value; no private tenant data | `200` token/metadata |
| `POST /auth/register` | P | `displayName`, `email`, `password`; no verification gate, unique normalized email; throttle | `201` safe user, management session |
| `POST /auth/login` | P | `email`, `password`; generic bad-credentials response | `200` safe user, secure session cookie |
| `POST /auth/logout` | M or signed-in unassigned user | Revoke server session and clear cookie | `204` |
| `GET /auth/me` | Signed-in | Safe profile, membership role/wedding reference if assigned | `200` |
| `POST /auth/password-reset/request` | P | `email`; generic accepted response whether or not registered | `202` |
| `POST /auth/password-reset/confirm` | P | `token`, `newPassword`; verify single-use recovery token, revoke active sessions | `204` |
| `POST /weddings` | Signed-in with no membership | `title`, `coupleNames`, `timeZone`, optional `tradition`, dates; create wedding + first ADMIN atomically | `201` wedding |
| `GET /wedding` | M | Read current wedding from membership context | `200` wedding |
| `PATCH /wedding` | M | Allowlisted profile/theme/timezone fields; no tenant-ID change | `200` updated wedding |
| `GET /members` | M | List managers and roles for assignment UI; no password or session info | `200` page |
| `POST /member-invitations` | A | `role: ADMIN|ORGANIZER`, optional intended email, expiry; one-use secret; copy link or send separately | `201` invitation with one-time shareable link |
| `GET /member-invitations` | A | List pending/consumed/expired invites without raw token | `200` page |
| `DELETE /member-invitations/{inviteId}` | A | Revoke unused invite | `204` |
| `POST /member-invitations/redeem` | Signed-in, no membership | `token`; validate unused/unexpired admin-issued invitation; transaction for consume + membership | `200` membership |
| `PATCH /members/{memberId}` | A | `role`; guard final admin, enforce revision/transaction | `200` member |
| `DELETE /members/{memberId}` | A | Remove/revoke member; invalidate their management sessions; guard final admin | `204` |

**Account onboarding nuance:** Signup alone never attaches someone to a wedding. A newly signed-in user must create a wedding or redeem an admin-issued invite. No API accepts `email` as proof that a person owns a member invitation. Since only admins manage membership, the organizer list route is read-only for organizers while task assignee lookup stays available.

### 4.2 Wedding profile and settings

| Method & path | Access | Contract notes | Success |
|---|---|---|---|
| `GET /settings` | M | Sanitized wedding profile, theme, RSVP defaults, reminder config, upload limits | `200` |
| `PATCH /settings/wedding` | M | Title, date range, tradition, wedding copy, timezone, cover photo ID; validated | `200` |
| `PATCH /settings/invitations` | M | Theme template ID, copy/hero photo ID, invitation text defaults | `200` |
| `PATCH /settings/reminders` | M | `enabled`, `daysBeforeDeadline`, `cooldownHours` within controlled bounds; defaults off | `200` |
| `PATCH /settings/photos` | M | Organizer-managed guest upload settings and safe quota choices within platform caps | `200` |
| `PATCH /auth/profile` | Signed-in | Own display name and non-security profile fields | `200` |
| `POST /auth/change-password` | Signed-in | Current password + new password; rotate sessions per security policy | `204` |

**Not an endpoint:** There is no `PATCH /settings/memberships` available to organizers. All member-management actions live behind administrator-only routes.

## 5. Wedding function and dashboard endpoints

Function records embed a bounded `scheduleItems[]` array; **there is no separate `scheduleItems` collection in the canonical database design**.

| Method & path | Access | Request / behavior | Success |
|---|---|---|---|
| `GET /dashboard/summary` | M | Upcoming functions, task summary, actual paid total, outstanding charge total, pending RSVPs, email problems, storage usage | `200` aggregated summary |
| `GET /functions` | M | Filter status, upcoming, date window; sorted by `startsAt` | `200` page |
| `POST /functions` | M | `name`, `startsAt`, optional `endsAt`, `venue`, dress code, schedule and notes | `201` function |
| `GET /functions/{functionId}` | M | Full same-wedding function detail | `200` function |
| `PATCH /functions/{functionId}` | M | Allowlisted fields, venue and coordinates; validated lifecycle state | `200` function |
| `PUT /functions/{functionId}/schedule` | M | Replace bounded list `[{id?,title,startsAt,endsAt?,note?}]` atomically | `200` function schedule |
| `POST /functions/{functionId}/archive` | M | Mark function `ARCHIVED`; retain linked RSVPs, expenses, photos and audit | `200` function |

**Business restrictions:** A function cannot be physically deleted if referenced by invitations, tasks, vendor charges, payments or photographs. Archiving is the default supported removal path. The service validates event time order, numeric latitude between -90 and 90 and longitude between -180 and 180, allowed YouTube URL patterns, and wedding-owned cover-photo references. Function status impacts guest displays consistently; explicit invitations are never automatically created for new functions.

**Dashboard money:** `paidActual = SUM(POSTED expenses.amountPaise) + SUM(POSTED vendorPayments.amountPaise)`. Outstanding charges remain separate; avoid double counting. Vendors' personal balances must never be returned by guest dashboards.

## 6. Task and comment endpoints

| Method & path | Access | Request / behavior | Success |
|---|---|---|---|
| `GET /tasks` | M | Filter `functionId`, `status`, `priority`, `assigneeUserId`, `assigneeVendorId`, due window; cursor | `200` page |
| `POST /tasks` | M | `title`, `description?`, `functionId?`, `assigneeType`, one assignee ID, `priority`, `dueAt?`, `status` | `201` task |
| `GET /tasks/{taskId}` | M | Detail, safely resolved assignee and counts | `200` task |
| `PATCH /tasks/{taskId}` | M | Allowlisted updates incl. Kanban status/order; validate same-wedding assignee | `200` task |
| `DELETE /tasks/{taskId}` | M | Soft-delete task; keep appropriate audit history | `204` |
| `GET /tasks/{taskId}/comments` | M | Paginated comments, bounded author/mention display | `200` page |
| `POST /tasks/{taskId}/comments` | M | `body`, `mentionedUserIds[]`; validate each mention is same-wedding manager | `201` comment |
| `PATCH /tasks/{taskId}/comments/{commentId}` | M | Edit comment content under a defined comment-edit policy | `200` comment |
| `DELETE /tasks/{taskId}/comments/{commentId}` | M | Soft-delete comment | `204` |

**Task invariants:** `assigneeType` is `USER`, `VENDOR`, or `UNASSIGNED`; exactly the matching reference field must be present. Client cannot set `completedAt` arbitrarily. All managers in the wedding can see all tasks, including assignments created by someone else. Vendor completion uses a narrower portal endpoint below.

## 7. Financial REST endpoints — expense tracker, not budgeting

The API distinguishes **standalone posted expenses** from **vendor agreed charges** and **vendor payments against charges**.

| Method & path | Access | Request / behavior | Success |
|---|---|---|---|
| `GET /finances/summary` | M | Actual paid total, function paid totals, vendor agreed/paid/outstanding totals | `200` summary |
| `GET /expenses` | M | List POSTED/VOID standalone expenses by function, date, category | `200` page |
| `POST /expenses` | M | `description`, `category`, `amountPaise`, `paidAt`, `functionId?`, `notes?`; `Idempotency-Key` | `201` expense |
| `GET /expenses/{expenseId}` | M | Read full own-wedding expense | `200` expense |
| `POST /expenses/{expenseId}/void` | M | `reason`; mark `VOID` and audit, never silently erase paid amount | `200` void result |
| `POST /expenses/{expenseId}/correct` | M | Replacement fields + reason; transactionally void original and create corrected expense | `201` replacement + original reference |
| `GET /vendor-charges` | M | Filter vendor, function, status | `200` page |
| `POST /vendor-charges` | M | `vendorId`, `functionId?`, `description`, `amountPaise`; validated vendor/function tenant refs | `201` charge |
| `PATCH /vendor-charges/{chargeId}` | M | Change description/function/agreed amount; forbid reduction below POSTED payments | `200` charge |
| `POST /vendor-charges/{chargeId}/void` | M | Only if no POSTED payments remain; else `409` | `200` charge |
| `GET /vendor-charges/{chargeId}/payments` | M | Payment history including VOID entries | `200` page |
| `POST /vendor-charges/{chargeId}/payments` | M | `amountPaise`, `paidAt`, `paymentMethod?`, `reference?`, `notes?`, `Idempotency-Key` | `201` payment |
| `POST /vendor-payments/{paymentId}/void` | M | `reason`; safe void and audit with concurrent charge guard | `200` void result |

**Financial concurrency:** Payment insert must enforce `sum(POSTED payments) + newAmount <= vendorCharge.amountPaise` within a transaction or equivalent guarded ledger; return `409 PAYMENT_EXCEEDS_CHARGE` otherwise. A payment cannot refer to a charge or vendor of another wedding. All amounts are integer paise, no negative/refund workflow in v1. If organizers request “edit payment,” the UI implements *void + replacement*, not mutating the posted historical record. Finance endpoints do not accept a planned budget or spending ceiling.

**Transaction-dependent operations:** Initial admin membership, join redemption, final-admin role changes, posting a payment while enforcing charge balance, financial correction/void with audit where atomicity is required. In MongoDB deployments ensure transaction support is actually available and test it, rather than assuming every free-tier setup has identical behavior.

## 8. Vendor management and Google Places discovery endpoints

| Method & path | Access | Request / behavior | Success |
|---|---|---|---|
| `GET /vendors` | M | Search/filter internal vendors by category, name, status | `200` page |
| `POST /vendors` | M | Organizer-entered vendor name, phones, category, notes, optional `googlePlaceId`; no Google result cache | `201` vendor |
| `GET /vendors/{vendorId}` | M | Internal contact and responsibility detail | `200` vendor |
| `PATCH /vendors/{vendorId}` | M | Edit independently maintained vendor data | `200` vendor |
| `POST /vendors/{vendorId}/deactivate` | M | Disable vendor and revoke portal access; retain payment history | `200` vendor |
| `GET /vendors/{vendorId}/assignments` | M | Function assignments and responsibilities | `200` list |
| `POST /vendors/{vendorId}/assignments` | M | `functionId`, `responsibilities[]`, window/notes; unique per vendor-function | `201` assignment |
| `PATCH /vendor-assignments/{assignmentId}` | M | Update responsibilities and assignment status | `200` assignment |
| `DELETE /vendor-assignments/{assignmentId}` | M | Cancel/disable assignment; dependent task access reflects updated scope | `204` |
| `POST /vendors/{vendorId}/links` | M | Issue active private vendor link if absent; return raw URL **only to authorized manager** | `201` link |
| `POST /vendors/{vendorId}/links/rotate` | M | Revoke old link and sessions, issue new link atomically | `201` replacement URL |
| `DELETE /vendors/{vendorId}/links` | M | Revoke vendor link and associated capability sessions | `204` |
| `POST /vendor-discovery/nearby` | M | Search with `latitude`, `longitude`, `radiusMeters`, supported `category`, `pageSize` | `200` attributed live Places results |
| `POST /vendor-discovery/text` | M | `query`, location center/radius or bias, bounded result count | `200` attributed live Places results |

**Google Places proxy requirements:** Only the backend calls `places:searchNearby` or `places:searchText`, with a server-held restricted key and an explicit, cost-conscious `X-Goog-FieldMask`. Nearby place type and category mapping must use allowed Places API New taxonomies. APIs cannot accept arbitrary upstream URLs, field masks, or request payloads. If billing is disabled, quota exhausted, or Google unavailable, return a clear non-sensitive error and allow manual vendor creation. Show attribution and a Google Maps link for live results. Persist only Google place IDs when allowed, plus independently entered vendor details. No booking, ratings cache, reviews, leads, or quote workflow. **Google Places billing must be enabled; cost caps are separate from app-level rate limits.**

**Discovery result DTO (not persisted as a Google listing):** `placeId`, permitted live `displayName`, `formattedAddress`, `location`, `googleMapsUri?`, `attributions[]`, `source: "GOOGLE_PLACES"`. Availability of individual fields depends on selected mask/SKU and applicable policy; never assume that adding fields has no cost. Never accept Google result `formattedAddress` or `displayName` as an automatically permanent organizer-maintained field.

## 9. Guest records, function invitations and RSVP management endpoints

| Method & path | Access | Request / behavior | Success |
|---|---|---|---|
| `GET /guests` | M | Search name/email, active status, function filter; pagination | `200` page |
| `POST /guests` | M | `displayName`, optional `email`, optional `personalMessage`; optional initial `functionInvitations[]` created atomically | `201` guest + invitations |
| `GET /guests/{guestId}` | M | Guest, link state and function invitation summary (never plaintext secret unless explicit secure copy action) | `200` guest |
| `PATCH /guests/{guestId}` | M | Name, optional email, personal message, opt-out/status under policy | `200` guest |
| `POST /guests/{guestId}/disable` | M | Disable guest and revoke portal access; preserve RSVP history | `200` guest |
| `GET /guests/{guestId}/function-invitations` | M | Function-wise eligibility, RSVP, attendee max, deadlines | `200` list |
| `POST /guests/{guestId}/function-invitations` | M | Add eligible function with `functionId`, `maxAttendees`, optional deadline override/upload flag | `201` invitation |
| `PATCH /function-invitations/{invitationId}` | M | Update `maxAttendees`, deadline override, upload permission; never silently reduce max below accepted count | `200` invitation |
| `DELETE /function-invitations/{invitationId}` | M | Revoke one function's access without deleting unrelated guest RSVPs | `204` |
| `PATCH /function-invitations/{invitationId}/rsvp` | M | Audited organizer override, even after deadline; `status`, `attendeeCount`, `reason` | `200` invitation |
| `GET /rsvps/summary` | M | `functionId?` and groupings; invited recipients, accepted/declined/pending, confirmed people | `200` summary |
| `POST /guests/{guestId}/links` | M | Create guest's unique private link if absent, return shareable URL to manager | `201` link |
| `POST /guests/{guestId}/links/rotate` | M | Revoke old link/sessions, create new link and update encrypted resend secret | `201` replacement URL |
| `DELETE /guests/{guestId}/links` | M | Revoke active guest link/sessions | `204` |
| `POST /guests/{guestId}/links/reveal` | M | Explicit authorized copy action; decrypt active secret; `Cache-Control: no-store`, audited; **proposed D-03 design** | `200` private URL |

**Guest eligibility invariant:** Each invited function has one `functionInvitations` record and unique `(weddingId, guestId, functionId)` index. The one guest URL opens a portal containing only those eligible function invitations. A guest can have one RSVP status and maximum per function, not one wedding-wide RSVP.

**Proposed narrow revocation adjustment (requires database schema amendment):** A function invitation needs an eligibility state distinct from RSVP `PENDING|ACCEPTED|DECLINED` if removal must preserve history. Add `eligibilityStatus: ACTIVE|REVOKED` (or `revokedAt`) to `functionInvitations`; `DELETE` becomes a soft revoke. Every guest query and reminder filter must exclude revoked eligibility records. This is a **real schema gap identified by API design**, not an existing column to assume silently.

### 9.1 Guest capability portal API

These routes use a guest cookie; **they never receive a raw private link token, guest ID, or wedding ID as proof of access**.

| Method & path | Access | Response / action |
|---|---|---|
| `GET /guest/me` | G | Personalized guest name, limited wedding presentation, effective invitation permissions |
| `GET /guest/functions` | G | Eligible active function cards with dates, schedule, venue, RSVP deadline, countdown inputs and livestream eligibility |
| `GET /guest/functions/{functionId}` | G | Single eligible function detail; unrelated function returns `404` |
| `GET /guest/function-invitations` | G | That guest's function RSVP states/counts/deadlines and upload flags |
| `PUT /guest/function-invitations/{invitationId}/rsvp` | G | Versioned RSVP action, scoped to that guest; see contract below |
| `GET /guest/photos` | G | Paginated READY photo metadata for an invited `functionId`; no public bucket paths |

**RSVP request example:**

```json
{
  "status": "ACCEPTED",
  "attendeeCount": 3,
  "revision": 2
}
```

**Server checks:** Resolve session to `guestId` and wedding, find `functionInvitations` by `_id`, `guestId`, `weddingId`, `eligibilityStatus=ACTIVE`; load active function; enforce `deadlineOverrideAt ?? function.rsvpDeadlineAt`; validate `1 <= attendeeCount <= maxAttendees` if accepted, exactly `0` if declined; atomically update only if `revision` matches, increment revision, set `respondedAt`. `PENDING` is an organizer-created state; a guest does not submit an arbitrary PENDING state. A legitimate deadline pass yields `409 RSVP_DEADLINE_PASSED` or `410` according to the uniform chosen mapping, documented for clients. **API v1 mapping: `409 RSVP_DEADLINE_PASSED`; `409 STALE_REVISION`; `422 ATTENDANCE_LIMIT_EXCEEDED`.**

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

## 10. Vendor capability portal API

These routes use a **vendor capability cookie**. A photographer uses the same vendor identity with a function-scoped upload permission.

| Method & path | Access | Response / action |
|---|---|---|
| `GET /vendor/me` | V | Own vendor name/category, permitted function summaries and own agreed/paid/due figures |
| `GET /vendor/functions` | V | Functions for this vendor's ACTIVE assignments only |
| `GET /vendor/tasks` | V | Own assigned tasks; no organizer comments or unrelated tasks |
| `POST /vendor/tasks/{taskId}/complete` | V | Only task `assigneeVendorId` equals portal vendor; sets COMPLETED idempotently |
| `GET /vendor/charges` | V | Own ACTIVE charges and corresponding POSTED payment sums, never another vendor's numbers |
| `GET /vendor/payments` | V | Own payment history, no unrelated financial fields |

**Vendor task completion:** Repeated completion is idempotent (`200` with current COMPLETED status). Vendor cannot change priority, due date, task description, assignee, or payment records. A photographer's upload authorization additionally checks ACTIVE vendor assignment for the selected function.

## 11. Email invitation, reminder and job APIs

Email requests create durable outbox jobs; external provider sending is **not** a transactional part of the organizer's HTTP request. Resend quotas apply **platform-wide**, even across separate weddings.

| Method & path | Access | Request / behavior | Success |
|---|---|---|---|
| `POST /emails/invitations` | M | `guestIds[]` (bounded) and optional `messageOverride`; enqueue one per eligible guest with email/link | `202` `queuedCount`, `skipped[]`, `batchId` |
| `POST /emails/reminders` | M | `functionId`, optional `invitationIds[]`; only Pending, active, future deadline, email present, not opted-out | `202` queued/skipped breakdown |
| `GET /emails` | M | Paginated outbox delivery history by guest, kind, status, date | `200` page |
| `GET /emails/{emailJobId}` | M | Job status/attempts and safe provider result; no raw invitation link | `200` job |
| `POST /emails/process-next` | M | Explicit bounded batch trigger with quota/lease guard; never unrestricted background loop | `202` processed/remaining estimate |
| `GET /emails/usage` | M | Wedding-level usage and platform capacity indicator, without other tenants' addresses | `200` summary |
| `GET /api/internal/cron/daily` | I | Outside `/api/v1`; secret-protected daily job for reminder eligibility + due outbox drain + bounded cleanup | `200` internal counts |
| `POST /api/webhooks/resend` | Provider signature | Outside `/api/v1`; signed provider event updates delivery/bounce, idempotent | `200` ack |

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

**Reminder generation:** Use wedding timezone and `enabled`/`daysBeforeDeadline`/cooldown settings, `functionInvitations.status=PENDING`, ACTIVE eligibility and active guest/link, email presence, opt-out absence, and *future* effective deadline. Recheck immediately before Resend call. A daily cron may run with hour-level imprecision; do not promise exact reminder times. Sending 200 emails on a 100/day allowance requires backlog display and manual small-batch alternatives, not false delivery guarantees.

**Link confidentiality:** The outbox contains `guestId`, `functionId?`, recipient email, safe template content, link ID reference, and dedupe key—**not the plaintext bearer URL**. The sender constructs the URL by decrypting the link secret only at dispatch. `POST /emails/invitations` may enqueue but must never return guest links to unauthorized users. A revoked link causes cancellation/skip, not a stale URL email.

**Webhooks:** If enabled, verify Resend's documented signing scheme against the raw request before parsing/trusting event data; save a unique provider event ID in `emailWebhookEvents`. Webhooks are for post-send statuses and bounce/suppression; sender success itself is recorded separately. If no webhooks are configured, do not show `DELIVERED` based merely on provider acceptance.

## 12. Cloudflare R2 photo/media endpoints

The image workflow uses **private R2, client-side compression, signed direct PUT, server-side verification, immediate publication after successful technical checks**, and never a human approval queue.

| Method & path | Access | Request / behavior | Success |
|---|---|---|---|
| `POST /media/upload-intents` | M/G/V-photographer | `functionId`, declared `mimeType`, `sizeBytes`, `fileName?`; enforce source-specific eligibility/quota | `201` `{photoId, uploadUrl, requiredHeaders, expiresAt}` |
| `POST /media/{photoId}/finalize` | Original authorized uploader, or M | Verify exact R2 object exists and matches expected key/size/file signature/dimensions; mark READY | `200` safe photo DTO |
| `GET /media` | M | Paginated photo metadata, `functionId`, `uploadState` filters | `200` page |
| `GET /media/{photoId}` | M or eligible G/V, when allowed | Metadata only; READY and function scope enforced | `200` photo |
| `GET /media/{photoId}/read-url` | M or eligible G/V where upload/preview scope permits | Create short-lived presigned GET after per-request eligibility check | `200` URL + expiry; `no-store` |
| `DELETE /media/{photoId}` | M | Soft-delete DB metadata and schedule actual object removal | `204` |
| `PATCH /media/{photoId}/function` | M | `functionId`; validate same-wedding function; instantly change gallery eligibility | `200` photo |
| `GET /guest/photos` | G | See eligible READY photos only, with cursor and function filter | `200` page |
| `GET /vendor/photos` | V-photographer only | Own authorized upload metadata, not general guest galleries | `200` page |

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

**Uploader authorization:** Management = any wedding manager; guest = only active function invitation with `uploadAllowed=true`; photographer = vendor capability with ACTIVE vendor assignment to function and photo-upload permission. A vendor without photographer permission cannot use upload intents.

## 13. Internal, operational, audit and lifecycle endpoints

| Method & path | Access | Behavior |
|---|---|---|
| `GET /audit-events` | M | Cursor page of sanitized same-wedding high-impact changes, no raw tokens |
| `GET /health` | Internal deployment-safe route | Minimal liveness response; do not disclose DB credentials or provider state publicly |
| `GET /api/internal/cron/daily` | I | Protected daily job: eligible reminder creation, email outbox drain, bounded stale-upload cleanup; strict time budget and lease |
| `POST /api/webhooks/resend` | Signed provider | Optional delivery/bounce transitions using raw-body signature verification |
| `GET /service-usage` | M | Safe wedding usage data, current configured photo/email cap and Google Places availability; no other tenant PII |

The exact health/cron path should be registered once in the Next.js router and consistently configured in Vercel. Cron calls use `Authorization: Bearer <CRON_SECRET>`; reject missing/wrong secret before touching queues. Cron invocations must be idempotent, acquire a global lease, and remain within function timeout. Logs must contain request IDs and non-sensitive error codes, never tokens, cookies, email bodies, or signed R2 URLs.

**Out-of-scope endpoints:** `/budgets`, `/payments/checkout`, `/vendor-bookings`, `/guest/login`, `/vendor/login`, `/weddings/switch`, `/google/oauth`, `/photos/approve`, `/photos/reject`, `/sms`, `/whatsapp`, `/hotel`, `/seating`, `/uploads/videos`. These must **not** be created as placeholders in Version 1.

## 14. Request validation and input contracts

### 14.1 Zod validation rules by domain

| DTO | Required checks |
|---|---|
| Auth signup | Valid normalized email, bounded name, secure password policy; no email verification flag required for signup |
| Wedding/function | Trimmed bounded strings; valid timezone; `endsAt > startsAt` if provided; date sanity |
| Venue | `latitude ∈ [-90,90]`, `longitude ∈ [-180,180]`, both supplied together if either is supplied; safe `mapUrl` |
| Schedule item | Bounded array (proposed 50 items); ordered valid UTC timestamps; no arbitrary Mongo operators |
| Task | Title length, enum status/priority, single valid assignee reference, same-wedding relation |
| Expense/payment | Safe positive integer `amountPaise`, valid date, same-tenant references, no negative/refund request |
| Vendor discovery | Valid center, bounded radius/result count, allowlisted place types, query length; limit total calls |
| Guest/function invitation | Bounded personalized text; `maxAttendees >= 1`; accepted count cannot exceed max; optional deadline override |
| RSVP | `status ∈ {ACCEPTED,DECLINED}`, accepted count ≥1 and ≤ private maximum; declined count 0; revision required |
| Email send | Bounded unique guest/invitation ID lists, validated recipient email, safe templates, opt-out/cooldown checks |
| Upload intent | Allowlisted MIME, positive size ≤ configured cap, safe image content after finalization, function eligibility |

Cross-document refs are checked in service/repository layers, not only by Zod. Reject unknown privileged fields (`weddingId`, `role`, payment status, `tokenHash`, `storageKey`, `providerMessageId`) rather than silently applying them.

### 14.2 Error catalog

| Stable code | When returned | Expected UI behavior |
|---|---|---|
| `AUTH_REQUIRED` / `SESSION_EXPIRED` | No valid management or portal cookie | Show sign-in for manager; show invalid-link guidance for guest/vendor |
| `CSRF_INVALID` | Missing/wrong CSRF or origin | Refresh security token / repeat safely |
| `PERMISSION_DENIED` | Role lacks action | Hide forbidden control; show concise explanation |
| `RESOURCE_NOT_FOUND` | Absent or not within scope | Do not leak cross-tenant existence |
| `TOKEN_REVOKED` / `TOKEN_EXPIRED` | Link entry rejected | Explain private link no longer works without identifying tenant |
| `VALIDATION_ERROR` | DTO parsing fails | Inline input correction |
| `STALE_REVISION` | Concurrency conflict | Reload current state before submitting |
| `RSVP_DEADLINE_PASSED` | Guest edit after deadline | Show locked state, no client-side bypass |
| `ATTENDANCE_LIMIT_EXCEEDED` | Guest attempts too many attendees | Display organizer-set allowable count |
| `PAYMENT_EXCEEDS_CHARGE` | Sum would exceed agreed amount | Adjust charge or correct payment |
| `MEMBERSHIP_LIMIT` / `LAST_ADMIN_REQUIRED` | User already joins a wedding / last admin change | Explain restriction |
| `EMAIL_QUOTA_EXCEEDED` | Resend provider/platform quota reached | Keep job queued, show retry availability |
| `PLACE_SEARCH_UNAVAILABLE` | Billing/Google/quota issue | Provide manual vendor entry option |
| `PHOTO_NOT_READY` / `UPLOAD_LIMIT_EXCEEDED` | Invalid/unfinalized upload / quota | Retry safely or select smaller photo |
| `RATE_LIMITED` | Abuse/rate guard | Show cooldown; `Retry-After` when relevant |
| `DEPENDENCY_UNAVAILABLE` | DB, R2, Resend transient issue | Don't claim operation succeeded |

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

| Surface | Suggested starting policy; configurable, **not yet a final user-approved quota** |
|---|---|
| Signup/login | Per IP and normalized email, progressive throttling after failures |
| Password reset | Per IP and target identity; generic response |
| Guest/vendor link exchange | Per IP and token fingerprint; avoid open enumeration |
| Guest RSVP | Example 12 mutations per link/hour; `revision` protects lost updates |
| Vendor completion | Low per-link mutation cap, completion is idempotent |
| Photo intent | Per-link and per-wedding upload count, size, and byte quota |
| Vendor discovery | Example 20 searches per wedding/day and strict platform total guard, subject to billing budget |
| Email | Per-wedding and platform daily/monthly reservations; resend/cooldown/dedup guard |
| Cron | Secret only, exclusive lease, fixed per-run work cap |

If a quota reservation itself fails because MongoDB is unavailable, fail closed for paid/abuse-sensitive operations rather than making an unmetered Google or Resend request. TTL cleanup is eventual and not a substitute for explicit current-window checks.

**Bulk actions:** Sending 200 invitations must not be described as instant. `POST /emails/invitations` enqueues work and optionally drains a handful of jobs inside the request; remaining jobs progress on later explicit processing or daily cron, respecting platform allowance. No reliable always-on worker is assumed on Vercel Hobby.

## 16. End-to-end contracts and failure scenarios

### 16.1 Create wedding and onboard organizers

1. Public signup (no email verification) creates user, DB session and cookie.
2. `POST /weddings` creates one wedding + ADMIN membership in a transaction; unique active membership index prevents double joins.
3. Admin `POST /member-invitations` creates a short-lived, single-use invitation token.
4. Invitee signs up/logs in and `POST /member-invitations/redeem`; token, not email text, proves joining authority.
5. A role change/removal checks active admin count atomically and invalidates revoked member sessions.

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
5. Vendor opens private link and marks its own assigned task complete; cannot edit financial data.

### 16.4 Photo upload → immediate gallery

1. Guest or authorized photographer requests upload intent for an eligible function.
2. API reserves quota and creates `photos.uploadState=INITIATED`; issues very short private R2 presigned PUT.
3. Browser uploads compressed photo directly to R2.
4. Finalize verifies object and changes state `VALIDATING → READY`; it appears immediately, without human approval.
5. Gallery uses authorized metadata query; each read URL requires fresh function eligibility.
6. Organizer delete/retag changes future access immediately; already issued presigned URLs can persist until expiry.

### 16.5 Operational failure handling

| Failure | Required contract behavior |
|---|---|
| Duplicate POST payment | Same key/body returns original safe result; different body with reused key returns 409 |
| Two admins remove each other | Transaction/guard preserves at least one ACTIVE administrator |
| Guest edits RSVP in two tabs | One revision succeeds, other receives `409 STALE_REVISION` |
| Guest invitation revoked during email queue | Sender rechecks link; marks job CANCELLED, does not email dead link |
| Resend network timeout after acceptance | Retry with same provider idempotency key; acknowledge residual at-least-once risk |
| R2 direct PUT completes but client misses finalize | Item not visible; client can retry finalize; stale cleanup bounded |
| Photo moved to uninvited function | Guest gets no new signed URL; old issued URLs naturally expire |
| Google Places disabled/over quota | Search reports unavailability; manual vendor record remains available |
| Mongo rate-limit counter unavailable | Fail closed for anonymous writes and paid provider calls |
| Daily cron runs twice | Lease/dedupe permits one effective reminder per scheduled window |

## 17. Test strategy, phase mapping and release gates

### 17.1 Contract and integration tests

- **Zod / routes:** valid and invalid request DTOs, query parameters, unknown sensitive fields, standard response envelope.
- **Authentication:** no signup email verification gate, generic login errors, Argon2id password storage, cookie flags, CSRF, password reset, login throttling.
- **Tenancy:** Wedding A IDs submitted by Wedding B manager always yield 404 and never mutate data; list filters cannot bypass scope.
- **Membership:** concurrent first-wedding creation, concurrent join invitations, self/last-admin removal, role elevation attempt by organizer.
- **Guest/vendor capabilities:** URL guessing/rate controls; revoked link stops new and existing sessions; guest sees invited only; vendor sees self only.
- **RSVP:** count lower/upper bounds, expired deadline, same request repeated, revision conflicts, organizer override audit, removed function eligibility.
- **Finance:** sums and no-double-count, concurrent payment cap, void/correction, foreign charge/vendor mismatch, idempotency replay.
- **Places:** allowed field mask, quotas and Google attribution; no bulk cached Google listing persistence; graceful provider failure.
- **Email:** correct link, no secret in outbox, quota reservation, duplicate cron/sends, provider webhook signature, pending-only reminders.
- **R2:** upload type/size/content verification, insufficient permission, READY-only gallery, delete and retag access, orphan cleanup.
- **Deployment:** request logs redacted, database restore drill, mobile smoke test at realistic 200-recipient wedding scale.

### 17.2 Phase-to-endpoint delivery

| Phase | API deliverables | Exit gate |
|---|---|---|
| **P1 Foundation & tenancy** | Auth, wedding create/profile, member invitations/roles, functions/schedule, settings foundation | Cross-tenant and last-admin tests pass |
| **P2 Organizer operations** | Dashboard, tasks/comments, expenses/charges/payments, vendor directory/assignments/access, Places search | Payment consistency and Places quota/vendor scope pass |
| **P3 Guest experience** | Guests, function-invitation records, private guest links, guest portal, RSVP, summaries | Revoked/uninvited access rejected; count/deadline/revision tested |
| **P4 Email** | Invitation/reminder sends, outbox listing, daily cron, webhook if configured, usage/settings | Quota/dedupe/failure tests pass |
| **P5 Photos & visual experience** | R2 intent/finalize/read, gallery, delete/retag; invitation theme settings and livestream fields | Private media/no approval/authorized guest gallery tests pass |
| **P6 Production** | Harden all endpoints; security/performance/backup, logs, staging and deployment validation | No critical defects, restore and abuse cases verified |

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

The API contract is complete enough for review, but these policy defaults must be approved before implementation freeze. They are not additional product features.

| ID | Item | Recommended API/database resolution |
|---|---|---|
| **A-01** | Reusable private URL for reminders | Add `encryptedSecret`, encryption nonce and key version to `accessLinks` beside `tokenHash`; AES-256-GCM key managed outside DB; authorized reveal/send only |
| **A-02** | Revoking one guest-function eligibility | Add `eligibilityStatus: ACTIVE|REVOKED` or `revokedAt` to `functionInvitations`; RSVP status remains independent |
| **A-03** | RSVP deadlines | Function default `rsvpDeadlineAt`, optional per-invitation override; auditing late organizer correction |
| **A-04** | Admin concurrency | Wedding membership version/guard in transaction; never lose last active admin |
| **A-05** | Money correction | Integer paise, reject overpayment, `VOID` + corrected replacement rather than silent edits |
| **A-06** | Media quotas and TTL | Choose per-upload/per-wedding caps and signed GET lifetime before deployment; e.g. 30–60s GET is provisional |
| **A-07** | Delivery/retention controls | Platform Resend caps, per-wedding soft caps, webhook event retention, opt-out/cooldown and error codes |
| **A-08** | Function archive behavior | Archive instead of deleting referenced functions; invitations excluded from active guest views according to archive policy |
| **A-09** | Account recovery with unverified signup emails | Use mailbox-proof reset flow with rate limits or controlled assistance; never allow unverified-email-only role joining |

**Recommended change order:** Approve A-01 and A-02 first because they require small, concrete Database Design amendments; harmonize collection names and email status names in the System Design; then freeze the API and implement one module at a time.

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
