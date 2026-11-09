# MAKE MY EVENT
## System Design & Architecture — Version 1.0

**Status:** Proposed implementation architecture aligned with PRD v1.0; implementation requires security and release validation  
**Date:** 8 November 2026  
**Architecture:** TypeScript modular monolith; Next.js App Router, Node.js Route Handlers, REST, Mongoose/MongoDB Atlas  
**Third-party services:** Cloudflare R2 (private media), Resend (transactional email), Google Places API (New) (vendor discovery), Vercel (hosting and daily Cron)

> **Key architecture decision:** A **single deployable Next.js monolith** contains presentation, API routes, application services, domain rules and persistence adapters. Weddings are independent tenants; accounts belong to at most one wedding in v1. Guests and vendors use private links instead of accounts. There is no Redis, Kafka, separate Express backend or authentication provider.

## 1. Scope, architectural drivers and constraints

**Use case:** Up to ~200 guest recipients per wedding in the initial deployment, modest concurrent traffic, multiple wedding tenants, organizers with full shared same-wedding data, guests/vendors with narrow capabilities. Optimize for low operational cost, clean engineering boundaries, and maintainability over speculative scale.

**Drivers:** (1) multi-tenant isolation; (2) secure custom auth without email verification on registration; (3) no-login bearer-link portal security; (4) RSVP and financial consistency; (5) private image upload/read without approval queue; (6) reliable, quota-aware email delivery on daily cron; (7) controlled Google Places cost and compliance; (8) responsive UI and simple observability.

**Non-goals:** Distributed microservices; WebSockets; real-time collaborative editing; third-party auth/OAuth; message broker/Redis; automated content moderation; self-hosted livestream; mobile apps; payment gateway; complex budget planning; professional planner CRM.

## 2. Technology decisions

| Layer | Choice | Why / important caveat |
|---|---|---|
| Runtime and frontend | Next.js App Router on Node.js, TypeScript | One web app and one deployable; server/client components as appropriate |
| APIs | REST via `app/api/**/route.ts` | Clear endpoint boundaries; no direct database access from clients |
| Domain logic | Feature modules + application services | Avoid putting business rules directly into route handlers or React components |
| Validation | Zod | Validate and normalize all untrusted request input and provider responses |
| Storage | MongoDB Atlas via Mongoose | Document flexibility with deliberate references, indexes and transactions where necessary |
| Admin authentication | Custom email/password and DB-backed opaque sessions | No auth provider or Google OAuth; must implement security controls rigorously |
| Guest/vendor authz | High-entropy URL capability token exchanged for limited cookie | Narrow scope, revocation and expiry, no accounts |
| Images | Private Cloudflare R2 Standard, direct presigned PUT/short-lived GET | Cost-sensitive; do not make gallery publicly addressable |
| Email | Resend + MongoDB outbox | Immediate bounded batch on request, daily cron for backlog/reminders |
| Jobs | Vercel Cron (daily) + bounded request-time processing | Vercel Hobby cron runs once daily with ~hour-level precision |
| Nearby discovery | Google Places API (New) server proxy | Requires enabled Google billing, restrictions, field masks, quotas and attributions |
| Hosting | Vercel, initially Hobby if compliant with noncommercial personal use | Free tier imposes invocation/duration quotas and policy limits |
| Observability | JSON application logs + Mongo audit entries | No external observability tool in v1 |

**Explicit change from earlier discussion:** There is **no Better Auth, Auth.js, Firebase Auth, Supabase Auth or Google sign-in**. Custom auth is an intentional owner decision, not a security-free shortcut.

## 3. High-level component and deployment view

```text
                       MANAGEMENT USER (login)
                       GUEST (unique URL)       VENDOR (unique URL)
                                |                   |        |
                                +-------------------+--------+
                                                    |
                                               HTTPS / Vercel
                                                    |
                   +--------------------------------------------------+
                   | Next.js modular monolith (Node.js runtime)        |
                   |  UI + REST Route Handlers                         |
                   |  Authentication / access-link session middleware |
                   |  Application service layer / domain modules      |
                   |  Repositories / integrations / validation        |
                   +--------------------------------------------------+
                        |                 |                |       |
                  MongoDB Atlas     Cloudflare R2       Resend   Google Places
                tenancy, sessions   private photos    emails    vendor search
                outbox, audit              ^              ^
                         ^                 |              |
                         +------------- Vercel daily Cron |
                                        outbox/reminders  |
```

The **Cloudflare CDN** serves appropriate public/static assets. Protected wedding media stays in private R2 and is accessed through short-lived, scoped URLs after application authorization. Do not infer that a Cloudflare custom domain makes private R2 objects authorization-aware.

## 4. Monolith module boundaries

Suggested layout (illustrative, not a required code generator template):

```text
src/
  app/
    (public)/...                 # entry, management signup/login
    (management)/...             # protected admin/organizer screens
    invite/[token]/...           # guest token exchange / entry
    vendor/[token]/...           # vendor token exchange / entry
    api/v1/...                   # REST route handlers
    api/internal/cron/daily/...  # protected cron handler
  modules/
    auth/           # password, session, recovery, CSRF
    memberships/    # join token, roles, one-wedding membership
    weddings/       # tenant setup / profile / functions / schedules
    tasks/          # list/kanban/tasks/comments
    expenses/       # payments/charges/expense calculations
    vendors/        # internal directory/assignments/portal
    places/         # Google Places adapter/quota/policy
    guests/         # guest records/access links/RSVP
    email/          # templates/outbox/sending/reminders
    media/          # R2 upload/finalize/delivery/cleanup
    themes/         # invitation templates
    audit/          # durable audit events
  shared/
    db/             # connection + Mongoose models
    http/           # API error model, response helpers
    validation/     # reusable Zod schemas
    security/       # tenant ctx, authz, rate limiting
    integrations/   # R2, Resend, Google adapters
```

A Route Handler validates input and access, calls an application service, maps service errors to HTTP. Services enforce business invariants; repositories query using server-supplied tenant context. The frontend never sends a trusted `weddingId` to select its own tenant.

## 5. Tenant model and authorization

**Canonical persisted tenant key:** `weddingId: ObjectId`. A single wedding is a tenant; different weddings can co-exist. The application user can have **at most one active** `weddingMembership` in v1. Member role is `ADMIN` or `ORGANIZER`; authorization is always derived from the validated session/membership record rather than the browser.

- All wedding-scoped collection reads/writes include a `weddingId` filter or follow a parent reference already verified to be part of the same wedding.
- Where APIs accept a child ID (function, guest, vendor, photo), load it with the `weddingId`/authorized parent relationship. Never `findById(id)` then assume it belongs to the tenant.
- Manager role access to wedding data is shared; **membership mutations remain admin-only**.
- For guests/vendors, resolve the token to one invited guest or vendor record, and compute function/resource access from that record. A `guestId` or `vendorId` in a URL is never sufficient authorization.
- In database indexes, include `weddingId` for tenant-scoped lists and uniqueness; use a unique membership index on user ID to enforce the current single-wedding rule.

Example: `find({ weddingId: ctx.weddingId, functionId: requestedFunction })`, after validating that function also belongs to `ctx.weddingId`.

## 6. Custom management authentication (no auth provider)

### 6.1 Registration and login

- User registers with email/password; the system normalizes email and enforces unique email in accounts. **No email verification gate in v1.**
- Hash password with **Argon2id** with a unique salt and configurable parameters consistent with current OWASP guidance. Do not use SHA-256 alone, reversible encryption or home-grown hashing.
- Login compares password securely and uses generic responses so email existence is not exposed. Throttle login/signup by IP and account identity, including temporary progressive lockouts.
- **Do not automatically join a wedding based on a claimed email address.** Wedding invitation is a separate signed/unguessable single-use token, subject to expiry and revocation.
- First authenticated account may create a new wedding and becomes initial admin. An unassigned user can instead redeem a valid invite token; a user already in a wedding cannot join another in v1.
- Password reset may be implemented through a time-limited emailed recovery link, but proving access to a mailbox for reset is not the same as requiring email verification at signup. Rate-limit issuance; invalidate old sessions after reset. If safe recovery cannot be guaranteed for unverified contact details, provide controlled admin-assisted recovery rather than insecure shortcuts.

### 6.2 Sessions and CSRF

- Generate cryptographically random **opaque session secret**; store only a keyed identifier plus hash/verifier, user ID, expiry and revocation timestamps in MongoDB.
- Set cookie `__Host-mme_session` with `HttpOnly; Secure; SameSite=Lax` (or Strict after user-flow verification); `Path=/`, no Domain. Rotate on login/privilege change; expire and invalidate on logout.
- Authorize protected mutations server-side. Use **Origin/Referer allowlist checking and anti-CSRF protection** for cookie-authenticated unsafe requests; SameSite is defense in depth, not the only control.
- Enforce safe account recovery, password reset and role-change flows. Never store credentials in `localStorage`.
- Validate `weddingMembership` and revocation status on sensitive management operations; revoke sessions as part of member removal.

### 6.3 Membership invitation

Admin generates single-use invite with target role, `weddingId`, optional intended email, expiry and random secret hash. It may be copied manually or delivered by Resend. Invitee may register/sign in and redeem; a matching email string alone does not authorize membership. Redemption checks unused/unexpired token, session, one-wedding restriction and admin-issued role. Record audit event and invalidate token atomically.

## 7. Guest/vendor private links and capability sessions

- Issue each guest/vendor a unique 256-bit-or-equivalent random token; keep `sha256(token)` in `accessCredentials`, with `principalType`, record ID, `weddingId`, creation, revocation and optional expiry.
- Initial `GET /invite/{token}` or `/vendor/{token}` validates the token **without mutating** RSVP/task state (email link scanners may prefetch). Return a first-party page and exchange to a narrow, short-lived, `HttpOnly` capability cookie; then redirect to a clean URL that omits the secret to reduce history/referrer leakage.
- Restrict guest cookie to that guest's authorized invitation set; restrict vendor cookie to that vendor, own charges/assignments and permitted task status changes. Apply CSRF/Origin checks to mutations even for capability-cookie sessions.
- Since guests may open links on different devices, link reuse is allowed until revoked; rotating/revoking old secret immediately blocks new exchanges and should invalidate existing capability sessions through server-side credential version or revocation checks.
- Avoid embedding raw private tokens in analytics, image URLs, externally loaded links, logs or email tracking redirects. Apply `Referrer-Policy: no-referrer` to secret-bearing entry pages and disable token-bearing URL prefetching from the app where possible.
- Anyone who possesses the link can access its scoped data. This limitation is an explicit product tradeoff, not full identity verification.

## 8. MongoDB document model, integrity and indexes

All IDs below are ObjectIds; timestamps are stored in UTC. Wedding timezone is stored explicitly (default `Asia/Kolkata`) for display and RSVP reminder decisions. Currency defaults to INR; **store monetary amounts as integer minor units (paise)** to avoid floating-point errors.

| Collection | Important fields | Indexes / constraints |
|---|---|---|
| `users` | `emailNormalized`, `passwordHash`, `displayName`, `createdAt` | unique `emailNormalized` |
| `sessions` | `userId`, token verifier hash, `expiresAt`, revoked | hashed verifier index; TTL on expiry (do not trust TTL for immediate security) |
| `weddings` | title, couple, timezone, type/theme, dates, settings | `_id`; optional status |
| `memberships` | `weddingId`, `userId`, `role`, status | unique `userId` (v1), unique (`weddingId`,`userId`), compound tenant lookups |
| `memberInvites` | `weddingId`, role, tokenHash, optional email, expires, used | unique tokenHash, TTL expiry |
| `functions` | `weddingId`, title, `startsAt`, `endsAt`, venue with lat/lng, `rsvpDeadline` | (`weddingId`,`startsAt`) |
| `scheduleItems` | `weddingId`, `functionId`, time, label, notes | (`functionId`,time) |
| `tasks` | `weddingId`, `functionId?`, assigneeType/id, status, due | (`weddingId`,status,due), (`weddingId`,assigneeId) |
| `taskComments` | `weddingId`, `taskId`, author, body, mentionedUserIds | (`weddingId`,`taskId`,`createdAt`) |
| `expenses` | `weddingId`, `functionId?`, amountMinor, paidDate, note | (`weddingId`,`functionId`,`paidDate`) |
| `vendors` | `weddingId`, name, category, organizer-entered contacts, `googlePlaceId?` | (`weddingId`,category), optional (`weddingId`,`googlePlaceId`) |
| `vendorAssignments` | `weddingId`, `vendorId`, `functionId`, responsibilities | (`weddingId`,`vendorId`,`functionId`) |
| `vendorCharges` | `weddingId`, `vendorId`, `functionId?`, agreedMinor | (`weddingId`,`vendorId`) |
| `payments` | `weddingId`, `vendorChargeId`, amountMinor, date, note | (`weddingId`,`vendorChargeId`,`paidAt`) |
| `guests` | `weddingId`, name, optional email, message, linkId | (`weddingId`,email) nonunique |
| `functionInvitations` | `weddingId`, `guestId`, `functionId`, status, maxAttendees, attendeeCount, updatedAt | unique (`weddingId`,`guestId`,`functionId`); (`weddingId`,`functionId`,status) |
| `accessCredentials` | `weddingId`, principal type/id, tokenHash, revokedAt, version | unique tokenHash; (`weddingId`,principalType,principalId) |
| `capabilitySessions` | accessCredentialId, random verifier hash, expiry | verifier index and TTL |
| `photos` | `weddingId`, `functionId`, uploader ref/type, r2Key, bytes, mime, state, created | (`weddingId`,`functionId`,`createdAt`), (`weddingId`,state) |
| `emailOutbox` | `weddingId`, recipient, invitation/metadata IDs, state, dueAt, attempts, idempotencyKey, lease | unique idempotencyKey; (`state`,`dueAt`), lease expiry |
| `reminderHistory` | `weddingId`, invitationId, reminderWindow, emailOutboxId | unique (`invitationId`,`reminderWindow`) |
| `rateLimits` | scope/key hash, bucketStart, count, expiresAt | unique scope/key/bucket; TTL |
| `auditEvents` | `weddingId`, actor, action, objectRef, createdAt, safe metadata | (`weddingId`,`createdAt`) |

**Modeling rules:** Keep function invitations, tasks, photos and payments as referenced collections (not infinitely growing embedded wedding arrays). Use small embedding only for bounded fields such as venue or configured schedule labels if appropriate. Enforce ref-to-tenant matching before writes. Where two records must change consistently, use a MongoDB transaction; otherwise use single-document atomic operations with guards.

**Money correctness:** `sum(payments.amountMinor)` must not exceed agreed charges unless explicitly supported by business rules; choose rejection/organizer correction in v1. `paidActual = sum(standalonePaidExpenses) + sum(vendorPayments)`; unpaid vendor charges appear only as commitments/outstanding. Negative values, duplicate transaction IDs and invalid currencies are rejected.

## 9. REST API resource layout (illustrative)

All routes live under `/api/v1`, use JSON, Zod input validation, consistent errors (`code`, `message`, `requestId`, optional `details`), and do not expose Mongoose raw documents.

| Method/path | Identity | Purpose |
|---|---|---|
| `POST /auth/register`, `/auth/login`, `/auth/logout` | Public/management | Custom signup/login/logout; rate limited |
| `POST /auth/password-reset/request`, `/confirm` | Public | Recovery token flow |
| `POST /weddings`, `GET/PATCH /wedding` | Management | Create/read/update own wedding |
| `POST/GET /members/invitations`, `POST /members/redeem` | Admin/redemption | Invite and join management |
| `GET /members`, `PATCH/DELETE /members/{id}` | Admin | Membership role and revocation |
| `GET/POST /functions`, `GET/PATCH/DELETE /functions/{id}` | Management | Function CRUD, schedule/venue nested resources |
| `GET/POST /tasks`, `PATCH /tasks/{id}`, `POST /tasks/{id}/comments` | Management | Task + comment workflows |
| `GET/POST /expenses`, `GET/POST /vendor-charges`, `POST /vendor-charges/{id}/payments` | Management | Finance records and totals |
| `GET/POST /vendors`, `PATCH /vendors/{id}`, `POST /vendors/{id}/access/rotate` | Management | Vendor directory and private links |
| `POST /vendors/search-nearby`, `POST /vendors/search-text` | Management | Google Places proxy with quotas/attribution |
| `GET/POST /guests`, `PATCH /guests/{id}`, `POST /guests/{id}/access/rotate` | Management | Guest records and link generation |
| `GET /rsvps/summary`, `PATCH /rsvps/{id}` | Management | Summaries/organizer overrides |
| `POST /invitations/send`, `POST /reminders/send`, `GET /emails/status` | Management | Resend queue and follow-up |
| `GET/PATCH /settings` | Management | Wedding/invitation/reminder settings, role restrictions |
| `GET /guest/functions`, `PUT /guest/rsvp/{functionInvitationId}` | Guest capability | Only eligible function data and RSVP |
| `GET /vendor/me`, `PATCH /vendor/tasks/{id}/complete` | Vendor capability | Own assignments and task completion |
| `POST /media/upload-intents`, `POST /media/finalize`, `GET /media`, `GET /media/{id}/read-url` | Role/capability | Protected photo workflow |
| `DELETE /media/{id}`, `PATCH /media/{id}/function` | Management | Delete / retag image |
| `GET /internal/cron/daily` | Cron secret only | Daily reminders and outbox drain |

Tokens should be exchanged at `/invite/{token}` and `/vendor/{token}` pages, not passed as permanent path parameters to all operational APIs. Every route uses centralized rate limits and access guards.

## 10. Google Places vendor discovery design and policy

**Location input:** Use stored function venue (`lat`,`lng`) or organizer-entered center/radius. Do not require browser location permission. Validate coordinate bounds and radius.

**Request:** Backend sends HTTPS requests to Places API (New) with server-only restricted API key, field mask and bounded result count. `POST places:searchNearby` for nearby supported place types, Text Search for search terms such as wedding decorator when type taxonomy is insufficient. Limit requests per manager/wedding/IP; debounce frontend; forbid unauthenticated discovery.

**Returned data:** show a limited number of live results (name, address/location and attribution as permitted). **Avoid reviews, photos and rich place details** in the MVP because they add cost and licensing complexity. Show Google Maps branding on non-map results; if displaying results on a map, use a compliant Google Map rather than an arbitrary map tile provider for Google content.

**Persisted data:** Google `place_id` may be retained as permitted. All own vendor responsibility, contact, charge and payment data is entered and maintained independently by organizers. Do not persist Google reviews, ratings, photo assets or Google-derived business listing fields as a permanent vendor directory. Confirm exact Google terms before production and publish the needed privacy policy/Terms.

**Cost:** Google Places requires **billing enabled**. Free monthly usage depends on SKU and billing eligibility/region; do not assume free forever. Set Google Console quotas and budget alerts and enforce app-side caps, e.g. default 20 searches per wedding per day and 150 platform-wide per day, adjustable lower for cost. If external quota exhausted, disable Places search but keep manual vendor setup.

**Security:** API key stays server-side and restricted to approved Google APIs / permitted environment. Validate request body; never implement an open proxy that accepts arbitrary Google Places API paths or fields.

## 11. Email outbox, daily cron and rate-limited sending

### 11.1 Design

`emailOutbox` is a durable queue in MongoDB, not a separate broker. A row includes `dedupeKey`, recipient, invitation/reminder type, safe template data, nextAttemptAt, state, attempts, `leaseOwner`, `leaseUntil`, providerMessageId and error category. Job processing atomically claims pending jobs whose due time has arrived; short leases and idempotency prevent concurrent execution from sending duplicates. Exact once-only delivery cannot be guaranteed across external API/network failures; system targets **at-least-once processing with strong duplicate suppression**.

### 11.2 Immediate invitation path

1. Organizer requests email send; validate role, active recipient email and wedding quotas.
2. Create one outbox job per recipient / invitation event (unique idempotency key).
3. Within the **same request**, process a bounded number of small jobs (e.g. maximum 3–5 with concurrency 2 and a short time budget), then return accepted/queued counts. Never rely on a promise continuing after serverless response.
4. Unprocessed jobs remain queued for the next organizer-triggered processing call or daily cron. Offer a visible **Process next batch** control if needed; do not promise near-real-time draining of hundreds of messages on Hobby.

### 11.3 Vercel Cron daily path

- A single daily cron endpoint authenticated using a strong `CRON_SECRET` bearer header runs reminder eligibility checks and drains due email jobs within a bounded time/quantity.
- Determine eligible reminders using the wedding timezone, function invitation's pending state, deadline, active link, email present, opt-out status and reminder dedupe window. Auto-reminders default disabled.
- Job creation and claiming are atomic/idempotent; abort sending when Resend account-wide allowance or per-wedding cap is reached. Delayed messages do not count as sent.
- Vercel Hobby supports **once-daily Cron with roughly hourly precision**, so reminders cannot promise exact send times. If reminders are overdue or deadline has passed by actual processing time, skip appropriately.
- A daily job run may not clear a 200-recipient backlog immediately on Resend Free (100 per day); display queue position/status, preserve pending messages and communicate expected daily throughput without promising delivery timing.

### 11.4 Delivery states and failures

`QUEUED -> PROCESSING -> PROVIDER_ACCEPTED -> DELIVERED (if provider reports)` or `RETRY_DUE / FAILED / SUPPRESSED`. Record attempts; use limited exponential backoff and jitter; validate Resend response/webhook signatures if webhooks are configured. Do not automatically retry permanently invalid addresses or unsubscribed recipients. Protect transactional mail sender reputation and avoid duplicating manual reminders too frequently.

## 12. Private Cloudflare R2 media workflow (no manual moderation)

**Upload intent:** Server verifies guest's invited function and `uploadAllowed` or photographer's assigned function/organizer role, checks rate and quota, generates a unique private R2 object key and a **very short-lived presigned PUT URL**. Client compresses to high-quality JPEG/WebP within configured bounds; post-upload finalization must be required.

**Finalize:** Server verifies object exists, expected object key/size/content and performs technical file-signature/decoding checks. **Do not trust client-declared MIME or compression.** If additional validation needs a short processing step, hold object in a non-public technical-pending state, not a human-moderation approval queue. On success mark photo `READY` and make it visible instantly in authorized function gallery. Delete/quarantine invalid objects; clean up abandoned uploads via scheduled/maintenance cleanup.

**Read:** Guest/function permission check precedes issuing a short-lived R2 GET presigned URL. A URL alone can be shared until it expires; keep expiry short and avoid HTML/public caches storing it. Management can delete/retag; update DB authorization immediately, purge or invalidate grants where feasible. Short-lived already-issued URLs may remain usable until expiry; record this explicit security limitation.

**R2 details:** Private Standard bucket, no public listing/custom public domain; R2 presigned URLs operate on its S3 API domain rather than a custom CDN domain. Use CORS limited to application origins, no cross-tenant key reuse, object keys including wedding prefix but permissions are never based on prefix alone. Compress high-quality photographs, store optimized copies only for v1; apply per-photo and wedding quotas.

**Privacy and user uploads:** Since uploads auto-publish, organizer takedown remains essential; provide clear terms, deletion controls and a lightweight flag/report contact route if abuse occurs. No false claim of automatic image-content moderation.

## 13. Rate limiting and abuse prevention

Use MongoDB atomic per-window counters (e.g. `findOneAndUpdate` with unique scope/key/window and `$inc`), TTL cleanup, and expiry checked directly. A single Vercel instance's memory is **not** a shared rate-limit store. Route-level middleware can do cheap prechecks, but the service/route handler must enforce final authorization and limits.

| Risk surface | Suggested starting controls (tune by testing) |
|---|---|
| Signup / login | IP + normalized email limits, generic responses, progressively slower after failures |
| Password reset / member invites | Per IP/account/wedding cooldowns, one-use tokens |
| Guest link exchange | IP and credential-ID throttles, 404/410 without information leakage |
| RSVP writes | Per guest link + function; e.g. no more than 12 mutations/hour |
| Vendor task completion | Per vendor link, idempotent completion, low write cap |
| Photo upload intents | Per token + per wedding daily quotas, max size, per-file validation |
| Google Places search | Admin-only; per user/wedding and platform caps, strict field masks |
| Email send | Per wedding and global Resend allowance, queue depth and cooldown checks |
| Cron endpoint | Bearer secret, one-at-a-time lock, request/method checks |

Apply security headers, secure cookie policies, careful input encoding and output escaping. Use CSRF protection on unsafe cookie-authenticated requests. Monitor severe repeated failures through structured logs without logging secrets.

## 14. Observability, operations and deployment

**Deployment:** one Vercel project for Next.js; Node.js runtime for database/auth/R2-signing/Places/Resend routes. Configure HTTPS and same-origin cookies. Use separate development/preview/production environment configuration and resources. Store secrets in deployment environment settings, not Git.

**MongoDB Atlas:** select appropriate region, indexes, backups, connection pooling/reuse across requests, avoid opening a fresh connection per route invocation. Free tier has limits: backups and guaranteed recoverability may require a paid configuration or explicit alternative backup procedure. A documented **tested restoration** is a release gate.

**Logging:** structured JSON event with timestamp, severity, requestId, route, status, duration, tenant pseudonymous identifier if necessary and safe error codes. Audit collection persists membership, payment, link revocation and gallery deletion events. Do not log passwords, provider keys, raw bearer URLs, cookies, photo signed URLs or full sensitive guest data.

**Minimum metrics without external vendor:** dashboard counts for email queue failures, provider sends, R2 storage usage and Places request quota; logs on Vercel. No external APM. Respect log-retention limitations and redact personal data.

**Vercel Hobby considerations:** Hobby is intended for personal noncommercial projects; evaluate plan eligibility before real business/commercial operation. Cron is daily with hourly precision; no always-on worker. Function timeouts/quotas require small work units. Public vendors/guests may use the system if within acceptable use, but this is not a guarantee of unlimited free hosting.

**Third-party costs (verified November 2026; recheck before deploy):**

- **Resend Free**: 100 emails/day, 3,000 emails/month; platform-wide queue guardrails must prevent accidental overage/failed sends.
- **Cloudflare R2 Standard Free**: 10 GB-month storage, 1 million Class A and 10 million Class B requests/month. Photos can exhaust storage; set a small per-wedding quota and cap uploads.
- **Google Places New**: billing project and key required; costs depend on chosen SKU/fields, eligibility, region and usage; India pricing has separate eligibility rules. Avoid relying on an assumed 'free API'.
- **Vercel Hobby Cron**: daily max frequency, approximately hourly execution precision; additional function limits and terms apply.

## 15. Reliability and failure scenarios

| Failure | Expected behavior |
|---|---|
| MongoDB unavailable | Return friendly error; do not claim RSVP/payment saved; logs identify safe incident code |
| Duplicate RSVP submission | Idempotent update with authorized invitation and deadline checks |
| Concurrent financial edits | Atomic version checks / transaction for related charge/payment; safe retry/conflict UI |
| Duplicate cron invocation | Global cron lease, idempotent job creation and atomic claims |
| Resend quota exhausted | Hold queued mail until next allowance; show queued status and do not mark sent |
| Invalid email / provider outage | Mark retry or permanent failure; organizer sees status |
| Google billing/API unavailable | Show unavailable and allow manual vendor registration; do not retry aggressively |
| R2 upload abandoned | Temporary object cleanup; gallery remains clean |
| R2 validation fails | Remove/quarantine media; do not publish; notify uploader |
| R2 private signed GET forwarded | Remains usable only until short expiry; revoke future issuance |
| Guest/vendor link stolen | Admin rotates link; reject old access sessions; audit revocation |
| Duplicate function invitation | Unique index prevents duplicate recipient-function RSVP records |
| Account's unverified email misused | No email-only tenant joining or automatic account linking; sensitive recovery demands mailbox proof or controlled admin procedure |

## 16. Test plan and six-phase implementation mapping

**Testing stack suggestion:** Vitest (domain/service logic), API integration tests using isolated test database, Playwright (critical browser flows). Include Zod validation tests, custom-auth threat cases, cross-tenant fixture pairs, duplicate-delivery and photo-permission regressions. Avoid API keys in automated tests; mock external providers by contract.

| Phase | Architecture work and test gates |
|---|---|
| **P1 — Foundation** | Next.js monolith, Mongoose, sessions/custom auth, role membership, wedding tenant context, wedding/functions, Zod, baseline rate limiting; auth/tenant tests |
| **P2 — Organizer & vendors** | Tasks, expenses/payments, vendor restricted tokens, Places backend adapter and search UI, quotas and attribution; financial and cross-tenant/vendor tests |
| **P3 — Guests & RSVP** | Guest capability exchange, invitation/function records, RSVP writes and deadline/limit checks, mobile portal; negative token/permission tests |
| **P4 — Email & cron** | Resend outbox, immediate small batches, once-daily cron, manual/auto reminders and settings; retry/idempotency/quota tests |
| **P5 — Photos & UI** | R2 presigned upload/read, client compression and finalization validation, instant gallery, organizer delete/retag, themes and YouTube; media privacy tests |
| **P6 — Production** | Threat model review, performance tests, backup-restore drill, failure drills, secrets audits, staged deployment and public release gates |

### Minimum production readiness gate

- Custom auth and session security review completed; password hashing, CSRF and account-recovery tests pass.
- Tenant filtering tested on every relevant collection and REST handler; guest/vendor token revocation and function restrictions verified.
- Google Places terms, attribution, quotas and billing setup validated; privacy/Terms published and key restricted.
- Resend outbox claims and cron run idempotently within free-tier constraints; backlog status is visible.
- R2 upload and read routes reject unauthorized access; invalid files never become gallery-visible; no exposed public bucket.
- Accounting sums are correct with concurrency tests; DB backup and restore tested.
- Browser/mobile end-to-end demo succeeds; error and audit logs available without credential leakage.

## 17. Decision record and implementation assumptions

| ADR | Decision | Status |
|---|---|---|
| ADR-001 | Modular monolith: one Next.js/Node.js deployment; REST handlers | Chosen |
| ADR-002 | MongoDB Atlas + Mongoose, Zod validation | Chosen |
| ADR-003 | Custom email/password; no auth provider, OAuth or signup email verification | Chosen |
| ADR-004 | Secure DB-backed opaque management sessions; capability links for guests/vendors | Chosen; implementation policy described above |
| ADR-005 | Multi-tenant wedding ownership, one wedding per member in v1 | Chosen |
| ADR-006 | Resend + MongoDB outbox + bounded immediate batches + Vercel daily cron | Chosen |
| ADR-007 | Cloudflare R2 private compressed images, no manual photo moderation | Chosen |
| ADR-008 | Google Places (New) vendor discovery, no booking, billing/quota/policy controls | Chosen |
| ADR-009 | Only basic application logs and durable audit trail | Chosen |
| ADR-010 | Per-function RSVP deadline, upload permission toggles, link exchange cookies, and baseline rate thresholds | Proposed technical defaults; can adjust without changing product scope |

**End of System Design & Architecture — Make My Event v1.0**
