# MAKE MY EVENT

**14 November 2026 approved redesign:** Split operations UI by feature with server-side filters/pagination/searchable choices; no eager fetch-all vendor/payment metadata. Wedding root is Dashboard, legacy dashboard URL redirects. New expense obligations use expenses.modelVersion=2 plus expensePayments; read adapters preserve legacy paid expenses/charges/payments until guarded migration. All writes retain wedding transaction lock, membership checks, idempotency and revision guards. See [implementation plan](OPERATIONS_REDESIGN_PLAN.md).

**Operations implementation structure:** operations-store owns the shared connection, indexes, wedding-locked transaction, DTO/idempotency helpers. operations-service owns task/vendor/comment/inbox behavior and bounded context/choice reads. finance-service owns source-aware legacy adapters, expenses/payments, summaries and correction invariants; finance-http exposes its REST routes. Separate FinancePage and WorkspaceDashboard avoid eager directory/payment downloads. Tasks/vendors/inbox share a compact shell with modal side editors and server-searched pickers. Every new payment consumer and legacy writer uses the same wedding lock and combined balance calculation; expensePayments participates in tenant deletion. Full test evidence is maintained in PROJECT_STATUS.md rather than inferred from design exports.

**14 November 2026 product decision:** Vendors have no application access: no portal, private URLs, capability sessions, self-service task completion or vendor/photographer uploads. Administrators and organizers maintain vendor contacts, responsibilities, task status, charges and payments internally. Guest invitation access is unchanged. Google Places discovery remains deferred. Any earlier design exports or historical test notes describing vendor access are superseded.


**Phase 2 amendment — 13 November 2026:** External vendor discovery is deferred; manual directory requires no Places dependency. Organizer operations use the same modular monolith, selected-wedding authority and transaction wedding lock. Comments and deduplicated mention notifications commit together. Bell refresh uses coalesced selected-wedding activity/focus count reads, without recurring polling, sockets or background email. Finance uses integer paise, idempotency and serialized balance checks. See [delivery plan](PHASE_2_OPERATIONS_PLAN.md).

## System Design & Architecture — Version 1.0

**Status:** Proposed implementation architecture aligned with PRD v1.0; implementation requires security and release validation  
**Date:** 8 November 2026  
**Architecture:** TypeScript modular monolith; Next.js App Router, Node.js Route Handlers, REST, Mongoose/MongoDB Atlas  
**Third-party services:** Cloudflare R2 (private media), Resend (transactional email), Google Places API (New) (deferred vendor discovery), Vercel (hosting and daily Cron)

> **Key architecture decision:** A **single deployable Next.js monolith** contains presentation, API routes, application services, domain rules and persistence adapters. Weddings are independent tenants; accounts may have multiple wedding memberships with independent roles. Guests use private links instead of accounts. Vendors are internal management records only. There is no Redis, Kafka, separate Express backend or authentication provider.

**12 November 2026 implementation amendment:** Explicit per-tab wedding selection and admin-revealed/manual invitation codes replace the former single-wedding/email-only assumptions. See [the implementation and migration plan](MULTI_WEDDING_AND_INVITATION_CODES_PLAN.md). The development database migration is applied; other environments require the guarded migration before enabling new writers.

## Profile/session consistency — 13 November 2026

Global account profile lives under the auth module and requires authenticated account authority rather than wedding membership. Name/password mutations write-lock the current live session, compare the user profile revision and update in a MongoDB transaction. Password changes hash outside the transaction after persisted attempt limits/current-password validation; credential/session replacement commits atomically. Login rechecks the verified hash while writing the user coordination counter in its session transaction, preventing a delayed old-password verification from creating access after password revocation. Current browser receives a new cookie; other sessions are revoked. Read-only email avoids changing invitation binding without a verified ownership flow.

## 13 November 2026 — account navigation and tenant deletion

Wedding scope remains URL-local even though its navigation is consolidated into the name/avatar popover. No mutable global selected-wedding state is introduced. Escape/outside click close the menu; destructive deletion uses a separate typed-confirmation modal. Reduced motion disables decorative transitions.

Permanent tenant deletion locks the same wedding document as membership/function/profile writes and rechecks administrator authority within the transaction. All canonical wedding-owned MongoDB rows, including code ciphertext and creation replay records, are removed atomically. Accounts and other weddings remain accessible. Previously accepted email cannot be unsent. Photo-bearing records block deletion until the future media integration provides external object cleanup; successful deletion must not falsely claim external erasure. Future workers must validate the tenant still exists before dispatch and must not upsert orphan tenant rows after deletion.

## 1. Scope, architectural drivers and constraints

**Use case:** Up to ~200 guest recipients per wedding in the initial deployment, modest concurrent traffic, multiple wedding tenants, organizers with full shared same-wedding data, guests with narrow capabilities. Optimize for low operational cost, clean engineering boundaries, and maintainability over speculative scale.

**Drivers:** (1) multi-tenant isolation; (2) secure custom auth without email verification on registration; (3) no-login bearer-link portal security; (4) RSVP and financial consistency; (5) private image upload/read without approval queue; (6) reliable, quota-aware email delivery on daily cron; (7) controlled Google Places cost and compliance; (8) responsive UI and simple observability.

**Non-goals:** Distributed microservices; WebSockets; real-time collaborative editing; third-party auth/OAuth; message broker/Redis; automated content moderation; self-hosted livestream; mobile apps; payment gateway; complex budget planning; professional planner CRM.

## 2. Technology decisions

| Layer                | Choice                                                               | Why / important caveat                                                                    |
| -------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Runtime and frontend | Next.js App Router on Node.js, TypeScript                            | One web app and one deployable; server/client components as appropriate                   |
| APIs                 | REST via `app/api/**/route.ts`                                       | Clear endpoint boundaries; no direct database access from clients                         |
| Domain logic         | Feature modules + application services                               | Avoid putting business rules directly into route handlers or React components             |
| Validation           | Zod                                                                  | Validate and normalize all untrusted request input and provider responses                 |
| Storage              | MongoDB Atlas via Mongoose                                           | Document flexibility with deliberate references, indexes and transactions where necessary |
| Admin authentication | Custom email/password and DB-backed opaque sessions                  | No auth provider or Google OAuth; must implement security controls rigorously             |
| Guest authz   | High-entropy URL capability token exchanged for limited cookie       | Narrow scope, revocation and expiry, no accounts                                          |
| Images               | Private Cloudflare R2 Standard, direct presigned PUT/short-lived GET | Cost-sensitive; do not make gallery publicly addressable                                  |
| Email                | Resend + MongoDB outbox                                              | Immediate bounded batch on request, daily cron for backlog/reminders                      |
| Jobs                 | Vercel Cron (daily) + bounded request-time processing                | Vercel Hobby cron runs once daily with ~hour-level precision                              |
| Nearby discovery     | Google Places API (New) server proxy                                 | Requires enabled Google billing, restrictions, field masks, quotas and attributions       |
| Hosting              | Vercel, initially Hobby if compliant with noncommercial personal use | Free tier imposes invocation/duration quotas and policy limits                            |
| Observability        | JSON application logs + Mongo audit entries                          | No external observability tool in v1                                                      |

**Explicit change from earlier discussion:** There is **no Better Auth, Auth.js, Firebase Auth, Supabase Auth or Google sign-in**. Custom auth is an intentional owner decision, not a security-free shortcut.

## 3. High-level component and deployment view

```text
                       MANAGEMENT USER (login)
                       GUEST (unique URL)
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
    api/v1/...                   # REST route handlers
    api/internal/cron/daily/...  # protected cron handler
  modules/
    auth/           # password, session, recovery, CSRF
    memberships/    # invitation codes, roles, multiple wedding memberships
    weddings/       # tenant setup / profile / functions / schedules
    tasks/          # list/kanban/tasks/comments
    expenses/       # payments/charges/expense calculations
    vendors/        # internal color-accented contact directory
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

A Route Handler validates input and access, calls an application service, maps service errors to HTTP. Services enforce business invariants; repositories query using server-supplied tenant context. The frontend may identify the desired wedding, but that ID is only a candidate: the server validates exact active membership before deriving tenant context.

## 5. Tenant model and authorization

**Canonical persisted tenant key:** `weddingId: ObjectId`. Each wedding is a separate tenant. One account may have multiple ACTIVE memberships, unique by wedding/account pair. `ADMIN`/`ORGANIZER` belongs to that specific membership, never the account globally.

- All wedding-scoped collection reads/writes include a `weddingId` filter or follow a parent reference already verified to be part of the same wedding.
- Where APIs accept a child ID (function, guest, vendor, photo), load it with the `weddingId`/authorized parent relationship. Never `findById(id)` then assume it belongs to the tenant.
- Manager role access to wedding data is shared; **membership mutations remain admin-only**.
- For guests, resolve the token to one invited guest and its eligible functions. Vendor IDs are management-only references, never access authority.
- Keep unique `(weddingId,userId)` membership pairs and add non-unique `(userId,status,weddingId)` listing access; remove the former unique active-user restriction only through the coordinated migration plan. Preserve removed-membership history.

Management URLs contain `/weddings/{weddingId}/...`; account selection is `/weddings`. Existing tenant-owned APIs require `X-Wedding-Id`, authenticated identity, the exact ACTIVE membership and ACTIVE wedding. Never use `findOne({userId,status:ACTIVE})` to choose a tenant. A session authenticates the account, not a global selected wedding or role. Context-free exceptions are authentication, account wedding listing, wedding creation and invitation redemption. Guest capabilities continue deriving their own narrow context and ignore management selection.

Switching changes only the current tab URL. Scope frontend requests, caches, revisions and drafts to that wedding; cancel/ignore stale responses, warn on dirty forms and never retarget retries. Missing context fails explicitly; unauthorized/removed contexts fail closed and do not fall back to another membership. Membership removal/demotion is local to the wedding: deny subsequent requests there while retaining unrelated access and sessions. Serialize authorization-sensitive mutations and membership changes using the same wedding lock; preserve the last admin per wedding. Account logout, disable and security recovery remain account-level operations.

Example: `find({ weddingId: ctx.weddingId, functionId: requestedFunction })`, after validating that function also belongs to `ctx.weddingId`.

## 6. Custom management authentication (no auth provider)

### 6.1 Registration and login

- User registers with email/password; the system normalizes email and enforces unique email in accounts. **No email verification gate in v1.**
- Hash password with **Argon2id** with a unique salt and configurable parameters consistent with current OWASP guidance. Do not use SHA-256 alone, reversible encryption or home-grown hashing.
- Login compares password securely and uses generic responses so email existence is not exposed. Throttle login/signup by IP and account identity, including temporary progressive lockouts.
- **Do not automatically join a wedding based on a claimed email address.** A management invitation requires a separate admin-issued single-use code, delivered manually or by email, subject to recipient matching, expiry and revocation.
- Any authenticated account may create another wedding as its first admin or redeem a code for another wedding. One membership per wedding/account prevents duplicate joins; memberships in other weddings are not a rejection condition. Fresh sign-in always opens the wedding selector, including the one-card and empty states.
- Password reset may be implemented through a time-limited emailed recovery link, but proving access to a mailbox for reset is not the same as requiring email verification at signup. Rate-limit issuance; invalidate old sessions after reset. If safe recovery cannot be guaranteed for unverified contact details, provide controlled admin-assisted recovery rather than insecure shortcuts.

### 6.2 Sessions and CSRF

- Generate cryptographically random **opaque session secret**; store only a keyed identifier plus hash/verifier, user ID, expiry and revocation timestamps in MongoDB.
- Set cookie `__Host-mme_session` with `HttpOnly; Secure; SameSite=Lax` (or Strict after user-flow verification); `Path=/`, no Domain. Rotate on login/privilege change; expire and invalidate on logout.
- Authorize protected mutations server-side. Use **Origin/Referer allowlist checking and anti-CSRF protection** for cookie-authenticated unsafe requests; SameSite is defense in depth, not the only control.
- Enforce safe account recovery, password reset and role-change flows. Never store credentials in `localStorage`.
- Validate the exact selected `weddingMembership` and revocation status on every management operation. Removing/changing one membership must not revoke account sessions used in unrelated weddings. Rotate only the current session when accepting a code; keep identity-level logout/recovery semantics separate.

### 6.3 Membership invitation

The target UI uses the selected Team roster, optional email composer, private code-reveal dialog and account-level `/weddings/join`. Composer text is bounded plain text; the sender appends fixed security instructions. Admin member mutations use revision preconditions and a wedding transaction lock; count remaining admins inside it before removal/demotion. Joining consumes the invitation and creates/reactivates its unique wedding/account pair atomically; joins to other weddings are allowed. Wedding creation uses explicit idempotency keys, not the obsolete one-active-user index, to prevent duplicate retry-created weddings. Audit actions without secrets.

An admin supplies recipient email, role and MANUAL or EMAIL delivery. Manual creation works without Resend or email quota; EMAIL preserves the current sender/quota checks and failures. The authenticated recipient enters the same 12-character code regardless of delivery method. Possession of the code plus matching account email authorizes joining, not a claim of verified mailbox ownership. Reveal/copy is a separate admin-only CSRF-protected, rate-limited, audited no-store POST; ordinary creation/list responses never contain a code. Keep keyed verification and versioned AES-GCM recoverable ciphertext for the entire active invitation lifetime, even after successful email. Decrypt only for authorized reveal or dispatch. Clear ciphertext on consume/revoke/reissue; expiry checks reject use immediately and bounded cleanup removes expired ciphertext. A legacy invitation whose ciphertext was previously deleted needs explicit replacement, not hash recovery. Keys remain outside MongoDB, secrets stay out of logs/outbox/browser storage/URLs, and client display is masked/cleared on close, timeout or switch. Redemption retains strict account/source/recipient limits and attempt caps. Reissue invalidates prior unused codes for that wedding/recipient only; management capability links remain unsupported.

## 7. Guest private links and capability sessions

- Issue each guest a unique 256-bit-or-equivalent random token; keep its lookup hash in `accessLinks` with subject type/ID, `weddingId`, status, creation and optional expiry. Where the existing URL must be resent or copied, also keep a separately AES-256-GCM-encrypted secret, nonce, authentication tag and key version. Encryption keys remain outside MongoDB and source control.
- Initial `GET /invite/{token}` validates the token **without mutating** RSVP/task state (email link scanners may prefetch). Return a first-party page and exchange to a narrow, short-lived, `HttpOnly` capability cookie; then redirect to a clean URL that omits the secret to reduce history/referrer leakage.
- Restrict the guest cookie to that guest's `ACTIVE` function invitations; RSVP status does not determine function eligibility. Revocation preserves the historical RSVP but removes function, photo, livestream and RSVP access and reminder eligibility. Apply CSRF/Origin checks to mutations even for capability-cookie sessions.
- Since guests may open links on different devices, link reuse is allowed until revoked; rotating/revoking old secret immediately blocks new exchanges and should invalidate existing capability sessions through server-side credential version or revocation checks.
- Avoid embedding raw private tokens in analytics, image URLs, externally loaded links, logs or email tracking redirects. Apply `Referrer-Policy: no-referrer` to secret-bearing entry pages and disable token-bearing URL prefetching from the app where possible.
- Anyone who possesses the link can access its scoped data. This limitation is an explicit product tradeoff, not full identity verification.
- Only an authorized management copy action or email sender may decrypt an active link. Use `no-store` on reveal responses and audit the action without the secret. Never place plaintext URLs in `emailOutbox`, logs, audit metadata, analytics or webhooks. Rotation/revocation invalidates linked portal sessions. Versioned key rotation needs controlled re-encryption and protected key backups; losing a key makes its encrypted links unrecoverable.

## 8. MongoDB document model, integrity and indexes

All IDs below are ObjectIds; timestamps are stored in UTC. Wedding timezone is stored explicitly (default `Asia/Kolkata`) for display and RSVP reminder decisions. Currency defaults to INR; **store monetary amounts as integer minor units (paise)** to avoid floating-point errors.

| Collection            | Important fields                                                                                                                           | Indexes / constraints                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `users`               | `emailNormalized`, `passwordHash`, `displayName`, `createdAt`                                                                              | unique `emailNormalized`                                                                             |
| `authSessions`        | `userId`, `tokenHash`, `expiresAt`, `revokedAt?`                                                                                           | unique token hash; TTL on expiry (do not trust TTL for immediate security)                           |
| `passwordResetTokens` | `userId`, `tokenHash`, `expiresAt`, `usedAt?`                                                                                              | unique token hash; TTL on expiry                                                                     |
| `weddings`            | title, couple, timezone, type/theme, dates, settings                                                                                       | `_id`; optional status                                                                               |
| `weddingMemberships`  | `weddingId`, `userId`, `role`, `status`                                                                                                    | partial unique active `userId`; tenant/role lookups                                                  |
| `membershipInvites`   | `weddingId`, role, intended email, MANUAL/EMAIL method, keyed verifier, encrypted active code, expiry, consumption                         | unique verifier; cleanup expiry; scoped idempotency                                                  |
| `functions`           | `weddingId`, name, `startsAt`, `endsAt`, venue with lat/lng, `rsvpDeadlineAt`, bounded embedded `scheduleItems[]`                          | (`weddingId`,`startsAt`); no schedule collection                                                     |
| `tasks`               | `weddingId`, `functionId?`, required human assigneeUserId, optional vendorId, inline mention ranges, revision/status/due                                                                                   | (`weddingId`,status,due), (`weddingId`,assigneeId)                                                   |
| `taskComments`        | `weddingId`, `taskId`, author, body, mentionedUserIds                                                                                      | (`weddingId`,`taskId`,`createdAt`)                                                                   |
| `expenses` | weddingId, modelVersion 2 obligation, optional vendorId, amountPaise, ACTIVE/VOID; legacy paid rows remain readable | Tenant/status/cursor indexes |
| `expensePayments` | weddingId, expenseId/expenseSource, amountPaise, paidAt/method, POSTED/VOID, revision | weddingId/expenseSource/expenseId/status and tenant cursor |
| `vendors`             | `weddingId`, name, category, organizer-entered contacts, `googlePlaceId?`                                                                  | (`weddingId`,category), optional (`weddingId`,`googlePlaceId`)                                       |
| `vendorAssignments` | Historical wedding/vendor/function responsibility rows; no exposed assignment writer | Existing unique pair index; tenant cascade retained |
| `vendorCharges`       | `weddingId`, `vendorId`, `functionId?`, `amountPaise`, status                                                                              | (`weddingId`,`vendorId`,`status`)                                                                    |
| `vendorPayments`      | `weddingId`, `vendorId`, `chargeId`, `amountPaise`, `paidAt`, status                                                                       | (`weddingId`,`chargeId`,`status`,`paidAt`)                                                           |
| `guests`              | `weddingId`, `displayName`, optional `emailNormalized`, personal message                                                                   | (`weddingId`,`emailNormalized`) nonunique                                                            |
| `functionInvitations` | `weddingId`, `guestId`, `functionId`, RSVP status, independent `eligibilityStatus`, `maxAttendees`, `attendeeCount`, `deadlineOverrideAt?` | unique (`weddingId`,`guestId`,`functionId`); (`weddingId`,`functionId`,`eligibilityStatus`,`status`) |
| `accessLinks`         | `weddingId`, subject type/ID, `tokenHash`, optional encrypted secret/key version, status                                                   | unique token hash; tenant/subject lookups                                                            |
| `portalSessions`      | `linkId`, `sessionTokenHash`, expiry                                                                                                       | unique verifier hash; TTL                                                                            |
| `photos`              | `weddingId`, `functionId`, uploader ref/type, `storageKey`, bytes, mime, `uploadState`                                                     | (`weddingId`,`functionId`,`uploadState`,`visibleAt`)                                                 |
| `emailOutbox`         | `weddingId?`, recipient, safe references/template data, `status`, `sendAfter`, attempts, `dedupeKey`, lease                                | unique dedupe key; (`status`,`sendAfter`,`leaseUntil`)                                               |
| `emailWebhookEvents`  | provider event ID, type, timestamps                                                                                                        | unique provider event ID when webhooks are enabled                                                   |
| `rateLimitWindows`    | key hash, window start, count, expiry                                                                                                      | unique key/window; TTL                                                                               |
| `serviceUsage`        | service, scope, period and quota counts                                                                                                    | unique service/scope/period                                                                          |
| `idempotencyRecords`  | principal, operation, key, request hash, expiry                                                                                            | unique principal/operation/key; TTL                                                                  |
| `auditEvents`         | `weddingId`, actor, action, objectRef, createdAt, safe metadata                                                                            | (`weddingId`,`createdAt`)                                                                            |

**Modeling rules:** This table follows the canonical Database Design collection inventory; reminder deduplication uses `emailOutbox.dedupeKey` and does not create a `reminderHistory` collection. Keep function invitations, tasks, photos and payments as referenced collections. Embed only bounded value objects, including `functions.scheduleItems[]`. Enforce ref-to-tenant matching before writes. Where two records must change consistently, use a MongoDB transaction; otherwise use single-document atomic operations with guards.

**Money correctness:** Posted `vendorPayments.amountPaise` against a charge must not exceed its agreed `amountPaise`; reject or make an authorized correction. `paidActual = sum(POSTED expenses.amountPaise) + sum(POSTED vendorPayments.amountPaise)`; unpaid vendor charges appear only as outstanding, not actual spending. Negative values, duplicate transaction IDs and invalid currencies are rejected. All same-wedding admins and organizers can see the same financial records; only admins control membership and roles.

## 9. REST API resource layout (illustrative)

All routes live under `/api/v1`, use JSON, Zod input validation, consistent errors (`code`, `message`, `requestId`, optional `details`), and do not expose Mongoose raw documents.

| Method/path                                                                                               | Identity                | Purpose                                                                             |
| --------------------------------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------- |
| `POST /auth/register`, `/auth/login`, `/auth/logout`                                                      | Public/management       | Custom signup/login/logout; rate limited                                            |
| `POST /auth/password-reset/request`, `/confirm`                                                           | Public                  | Recovery token flow                                                                 |
| `GET/POST /weddings`, `GET/PATCH /wedding`                                                                | Management              | List/create weddings; explicit validated context for selected-wedding reads/updates |
| `POST/GET /member-invitations`, `POST /member-invitations/redeem`, `POST /member-invitations/{id}/reveal` | Scoped admin/redemption | Manual/email invitations, controlled reveal and joining additional weddings         |
| `GET /members`, `PATCH/DELETE /members/{id}`                                                              | Admin                   | Membership role and revocation                                                      |
| `GET/POST /functions`, `GET/PATCH/DELETE /functions/{id}`                                                 | Management              | Function CRUD, schedule/venue nested resources                                      |
| `GET/POST /tasks`, `PATCH /tasks/{id}`, `POST /tasks/{id}/comments`                                       | Management              | Task + comment workflows                                                            |
| `GET/POST /expenses`, `GET/POST /vendor-charges`, `POST /vendor-charges/{id}/payments`                    | Management              | Finance records and totals                                                          |
| `GET/POST /vendors`, `PATCH /vendors/{id}`                            | Management              | Internal vendor directory and responsibilities                                                  |
| `POST /vendors/search-nearby`, `POST /vendors/search-text`                                                | Management              | Google Places proxy with quotas/attribution                                         |
| `GET/POST /guests`, `PATCH /guests/{id}`, `POST /guests/{id}/access/rotate`                               | Management              | Guest records and link generation                                                   |
| `GET /rsvps/summary`, `PATCH /rsvps/{id}`                                                                 | Management              | Summaries/organizer overrides                                                       |
| `POST /invitations/send`, `POST /reminders/send`, `GET /emails/status`                                    | Management              | Resend queue and follow-up                                                          |
| `GET/PATCH /settings`                                                                                     | Management              | Wedding/invitation/reminder settings, role restrictions                             |
| `GET /guest/functions`, `PUT /guest/rsvp/{functionInvitationId}`                                          | Guest capability        | Only eligible function data and RSVP                                                |
| `POST /media/upload-intents`, `POST /media/finalize`, `GET /media`, `GET /media/{id}/read-url`            | Role/capability         | Protected photo workflow                                                            |
| `DELETE /media/{id}`, `PATCH /media/{id}/function`                                                        | Management              | Delete / retag image                                                                |
| `GET /internal/cron/daily`                                                                                | Cron secret only        | Daily reminders and outbox drain                                                    |

Tokens should be exchanged at `/invite/{token}` pages, not passed as permanent path parameters to all operational APIs. Every route uses centralized rate limits and access guards.

## 10. Google Places vendor discovery design and policy

**Location input:** Use stored function venue (`lat`,`lng`) or organizer-entered center/radius. Do not require browser location permission. Validate coordinate bounds and radius.

**Request:** Backend sends HTTPS requests to Places API (New) with server-only restricted API key, field mask and bounded result count. `POST places:searchNearby` for nearby supported place types, Text Search for search terms such as wedding decorator when type taxonomy is insufficient. Limit requests per manager/wedding/IP; debounce frontend; forbid unauthenticated discovery.

**Returned data:** show a limited number of live results (name, address/location and attribution as permitted). **Avoid reviews, photos and rich place details** in the MVP because they add cost and licensing complexity. Show Google Maps branding on non-map results; if displaying results on a map, use a compliant Google Map rather than an arbitrary map tile provider for Google content.

**Persisted data:** Google `place_id` may be retained as permitted. All own vendor responsibility, contact, charge and payment data is entered and maintained independently by organizers. Do not persist Google reviews, ratings, photo assets or Google-derived business listing fields as a permanent vendor directory. Confirm exact Google terms before production and publish the needed privacy policy/Terms.

**Cost:** Google Places requires **billing enabled**. Free monthly usage depends on SKU and billing eligibility/region; do not assume free forever. Set Google Console quotas and budget alerts and enforce app-side caps, e.g. default 20 searches per wedding per day and 150 platform-wide per day, adjustable lower for cost. If external quota exhausted, disable Places search but keep manual vendor setup.

**Security:** API key stays server-side and restricted to approved Google APIs / permitted environment. Validate request body; never implement an open proxy that accepts arbitrary Google Places API paths or fields.

## 11. Email outbox, daily cron and rate-limited sending

### 11.1 Design

`emailOutbox` is a durable queue in MongoDB, not a separate broker. A row includes `dedupeKey`, recipient, invitation/reminder type, safe template data and link reference without plaintext URL, `sendAfter`, `status`, `attemptCount`, `claimedBy`, `leaseUntil`, `providerMessageId` and safe error code. Job processing atomically claims pending jobs whose due time has arrived; short leases and idempotency prevent concurrent execution from sending duplicates. Exact once-only delivery cannot be guaranteed across external API/network failures; system targets **at-least-once processing with strong duplicate suppression**.

### 11.2 Immediate invitation path

1. Organizer requests email send; validate role, active recipient email and wedding quotas.
2. Create one outbox job per recipient / invitation event (unique idempotency key).
3. Within the **same request**, process a bounded number of small jobs (e.g. maximum 3–5 with concurrency 2 and a short time budget), then return accepted/queued counts. Never rely on a promise continuing after serverless response.
4. Unprocessed jobs remain queued for the next organizer-triggered processing call or daily cron. Offer a visible **Process next batch** control if needed; do not promise near-real-time draining of hundreds of messages on Hobby.

### 11.3 Vercel Cron daily path

- A single daily cron endpoint authenticated using a strong `CRON_SECRET` bearer header runs reminder eligibility checks and drains due email jobs within a bounded time/quantity.
- Determine eligible reminders using the wedding timezone, function invitation's `ACTIVE` eligibility and `PENDING` RSVP, effective deadline, active link, email present, opt-out status and reminder dedupe window. Auto-reminders default disabled.
- Job creation and claiming are atomic/idempotent; abort sending when Resend account-wide allowance or per-wedding cap is reached. Delayed messages do not count as sent.
- Vercel Hobby supports **once-daily Cron with roughly hourly precision**, so reminders cannot promise exact send times. If reminders are overdue or deadline has passed by actual processing time, skip appropriately.
- A daily job run may not clear a 200-recipient backlog immediately on Resend Free (100 per day); display queue position/status, preserve pending messages and communicate expected daily throughput without promising delivery timing.

### 11.4 Delivery states and failures

The only persisted statuses are `QUEUED`, `PROCESSING`, `SENT`, `DELIVERED`, `FAILED`, `BOUNCED`, and `CANCELLED`. A successful provider acceptance moves `PROCESSING -> SENT`; `SENT` is not proof of delivery. Only confirmed provider delivery moves to `DELIVERED`. Retryable failures use `FAILED` with a future `sendAfter` or atomically return to `QUEUED`; suppressed or revoked sends use `CANCELLED`. Record attempts, use bounded backoff, and verify webhook signatures if configured. Do not automatically retry permanently invalid addresses or unsubscribed recipients. Exact retention and quotas are configurable and finalized before production.

## 12. Private Cloudflare R2 media workflow (no manual moderation)

**Upload intent:** Server verifies guest's invited function and `uploadAllowed` or active management membership, checks rate and quota, generates a unique private R2 object key and a **very short-lived presigned PUT URL**. Client compresses to high-quality JPEG/WebP within configured bounds; post-upload finalization must be required.

**Finalize:** Server verifies object exists, expected object key/size/content and performs technical file-signature/decoding checks. **Do not trust client-declared MIME or compression.** If additional validation needs a short processing step, hold object in a non-public technical-pending state, not a human-moderation approval queue. On success mark photo `READY` and make it visible instantly in authorized function gallery. Delete/quarantine invalid objects; clean up abandoned uploads via scheduled/maintenance cleanup.

**Read:** Guest/function permission check precedes issuing a short-lived R2 GET presigned URL. A URL alone can be shared until it expires; keep expiry short and avoid HTML/public caches storing it. Management can delete/retag; update DB authorization immediately, purge or invalidate grants where feasible. Short-lived already-issued URLs may remain usable until expiry; record this explicit security limitation.

**R2 details:** Private Standard bucket, no public listing/custom public domain; R2 presigned URLs operate on its S3 API domain rather than a custom CDN domain. Use CORS limited to application origins, no cross-tenant key reuse, object keys including wedding prefix but permissions are never based on prefix alone. Compress high-quality photographs, store optimized copies only for v1; apply per-photo and wedding quotas.

**Privacy and user uploads:** Since uploads auto-publish, organizer takedown remains essential; provide clear terms, deletion controls and a lightweight flag/report contact route if abuse occurs. No false claim of automatic image-content moderation.

## 13. Rate limiting and abuse prevention

Use MongoDB atomic per-window counters (e.g. `findOneAndUpdate` with unique scope/key/window and `$inc`), TTL cleanup, and expiry checked directly. A single Vercel instance's memory is **not** a shared rate-limit store. Route-level middleware can do cheap prechecks, but the service/route handler must enforce final authorization and limits.

| Risk surface                    | Suggested starting controls (tune by testing)                                        |
| ------------------------------- | ------------------------------------------------------------------------------------ |
| Signup / login                  | IP + normalized email limits, generic responses, progressively slower after failures |
| Password reset / member invites | Per IP/account/wedding cooldowns, one-use tokens                                     |
| Guest link exchange             | IP and credential-ID throttles, 404/410 without information leakage                  |
| RSVP writes                     | Per guest link + function; e.g. no more than 12 mutations/hour                       |
| Photo upload intents            | Per token + per wedding daily quotas, max size, per-file validation                  |
| Google Places search            | Admin-only; per user/wedding and platform caps, strict field masks                   |
| Email send                      | Per wedding and global Resend allowance, queue depth and cooldown checks             |
| Cron endpoint                   | Bearer secret, one-at-a-time lock, request/method checks                             |

Apply security headers, secure cookie policies, careful input encoding and output escaping. Use CSRF protection on unsafe cookie-authenticated requests. Monitor severe repeated failures through structured logs without logging secrets.

## 14. Observability, operations and deployment

**Deployment:** one Vercel project for Next.js; Node.js runtime for database/auth/R2-signing/Places/Resend routes. Configure HTTPS and same-origin cookies. Use separate development/preview/production environment configuration and resources. Store secrets in deployment environment settings, not Git.

**MongoDB Atlas:** select appropriate region, indexes, backups, connection pooling/reuse across requests, avoid opening a fresh connection per route invocation. Free tier has limits: backups and guaranteed recoverability may require a paid configuration or explicit alternative backup procedure. A documented **tested restoration** is a release gate.

**Logging:** structured JSON event with timestamp, severity, requestId, route, status, duration, tenant pseudonymous identifier if necessary and safe error codes. Audit collection persists membership, payment, link revocation and gallery deletion events. Do not log passwords, provider keys, raw bearer URLs, cookies, photo signed URLs or full sensitive guest data.

**Minimum metrics without external vendor:** dashboard counts for email queue failures, provider sends, R2 storage usage and Places request quota; logs on Vercel. No external APM. Respect log-retention limitations and redact personal data.

**Vercel Hobby considerations:** Hobby is intended for personal noncommercial projects; evaluate plan eligibility before real business/commercial operation. Cron is daily with hourly precision; no always-on worker. Function timeouts/quotas require small work units. Invited guests may use the system if within acceptable use, but this is not a guarantee of unlimited free hosting.

**Third-party costs (verified November 2026; recheck before deploy):**

- **Resend Free**: 100 emails/day, 3,000 emails/month; platform-wide queue guardrails must prevent accidental overage/failed sends.
- **Cloudflare R2 Standard Free**: 10 GB-month storage, 1 million Class A and 10 million Class B requests/month. Photos can exhaust storage; set a small per-wedding quota and cap uploads.
- **Google Places New**: billing project and key required; costs depend on chosen SKU/fields, eligibility, region and usage; India pricing has separate eligibility rules. Avoid relying on an assumed 'free API'.
- **Vercel Hobby Cron**: daily max frequency, approximately hourly execution precision; additional function limits and terms apply.

## 15. Reliability and failure scenarios

| Failure                            | Expected behavior                                                                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| MongoDB unavailable                | Return friendly error; do not claim RSVP/payment saved; logs identify safe incident code                                          |
| Duplicate RSVP submission          | Idempotent update with authorized invitation and deadline checks                                                                  |
| Concurrent financial edits         | Atomic version checks / transaction for related charge/payment; safe retry/conflict UI                                            |
| Duplicate cron invocation          | Global cron lease, idempotent job creation and atomic claims                                                                      |
| Resend quota exhausted             | Hold queued mail until next allowance; show queued status and do not mark sent                                                    |
| Invalid email / provider outage    | Mark retry or permanent failure; organizer sees status                                                                            |
| Google billing/API unavailable     | Show unavailable and allow manual vendor registration; do not retry aggressively                                                  |
| R2 upload abandoned                | Temporary object cleanup; gallery remains clean                                                                                   |
| R2 validation fails                | Remove/quarantine media; do not publish; notify uploader                                                                          |
| R2 private signed GET forwarded    | Remains usable only until short expiry; revoke future issuance                                                                    |
| Guest link stolen           | Admin rotates link; reject old access sessions; audit revocation                                                                  |
| Duplicate function invitation      | Unique index prevents duplicate recipient-function RSVP records                                                                   |
| Account's unverified email misused | No email-only tenant joining or automatic account linking; sensitive recovery demands mailbox proof or controlled admin procedure |

## 16. Test plan and six-phase implementation mapping

**Testing stack suggestion:** Vitest (domain/service logic), API integration tests using isolated test database, Playwright (critical browser flows). Include Zod validation tests, custom-auth threat cases, cross-tenant fixture pairs, duplicate-delivery and photo-permission regressions. Avoid API keys in automated tests; mock external providers by contract.

| Phase                        | Architecture work and test gates                                                                                                                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P1 — Foundation**          | Next.js monolith, Mongoose, custom auth, multiple memberships, per-tab wedding context, manual/email code reveal, scoped revocation, wedding/functions and migration; auth/tenant/context/concurrency tests |
| **P2 — Organizer & vendors** | Tasks, expenses/payments, manual vendor directory/responsibilities, notifications; financial and cross-tenant management tests. Vendor access removed; Places deferred                                                   |
| **P3 — Guests & RSVP**       | Guest capability exchange, invitation/function records, RSVP writes and deadline/limit checks, mobile portal; negative token/permission tests                                                               |
| **P4 — Email & cron**        | Resend outbox, immediate small batches, once-daily cron, manual/auto reminders and settings; retry/idempotency/quota tests                                                                                  |
| **P5 — Photos & UI**         | R2 presigned upload/read, client compression and finalization validation, instant gallery, organizer delete/retag, themes and YouTube; media privacy tests                                                  |
| **P6 — Production**          | Threat model review, performance tests, backup-restore drill, failure drills, secrets audits, staged deployment and public release gates                                                                    |

### Minimum production readiness gate

- Custom auth and session security review completed; password hashing, CSRF and account-recovery tests pass.
- Tenant filtering tested on every relevant collection and REST handler; guest token revocation and function restrictions verified.
- Google Places terms, attribution, quotas and billing setup validated; privacy/Terms published and key restricted.
- Resend outbox claims and cron run idempotently within free-tier constraints; backlog status is visible.
- R2 upload and read routes reject unauthorized access; invalid files never become gallery-visible; no exposed public bucket.
- Accounting sums are correct with concurrency tests; DB backup and restore tested.
- Browser/mobile end-to-end demo succeeds; error and audit logs available without credential leakage.

## 17. Decision record and implementation assumptions

| ADR     | Decision                                                                                                                                                          | Status                                                                              |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| ADR-001 | Modular monolith: one Next.js/Node.js deployment; REST handlers                                                                                                   | Chosen                                                                              |
| ADR-002 | MongoDB Atlas + Mongoose, Zod validation                                                                                                                          | Chosen                                                                              |
| ADR-003 | Custom email/password; no auth provider, OAuth or signup email verification                                                                                       | Chosen                                                                              |
| ADR-004 | Secure DB-backed opaque management sessions; capability links for guests                                                                                  | Chosen; implementation policy described above                                       |
| ADR-005 | Multiple wedding memberships per account; explicit per-tab wedding context, exact membership validation and independent roles                                     | Implemented 12 November 2026                                                        |
| ADR-006 | Resend + MongoDB outbox + bounded immediate batches + Vercel daily cron                                                                                           | Chosen                                                                              |
| ADR-007 | Cloudflare R2 private compressed images, no manual photo moderation                                                                                               | Chosen                                                                              |
| ADR-008 | Google Places (New) vendor discovery, no booking, billing/quota/policy controls                                                                                   | Chosen                                                                              |
| ADR-009 | Only basic application logs and durable audit trail                                                                                                               | Chosen                                                                              |
| ADR-010 | Function-default RSVP deadline with optional invitation override and audited organizer correction; independent invitation eligibility; embedded function schedule | Approved implementation decisions                                                   |
| ADR-011 | Hash private link tokens for lookup; keep AES-256-GCM encrypted, versioned recoverable secret for existing-URL resend, with keys outside MongoDB                  | Approved implementation decision                                                    |
| ADR-012 | Management invitation codes support manual delivery and optional email; admin-only reveal retains encrypted code for its active lifetime                          | Implemented 12 November 2026; supersedes email-only/pending-delivery-only retention |

Exact retention periods, photo/storage and email quotas, signed URL lifetimes, and rate thresholds remain configurable operational defaults to settle in their relevant phase before production. The last-admin rule and tenant isolation are binding; their concurrency and query implementations must be tested in Phase 1.

**End of System Design & Architecture — Make My Event v1.0**

Deletion replay protection: creation idempotency rows become anonymous tombstones containing only their opaque key hash and deletion timestamp. Account, wedding and payload references are removed. This prevents an old creation retry from recreating an explicitly deleted wedding; a fresh creation key still permits a new wedding.

### Invitation delivery and deletion coordination — 13 November 2026

Invitation creation reserves a PROCESSING outbox row while holding the wedding write lock. Deletion acquires that same lock and refuses to erase any tenant with a PROCESSING delivery. The sender marks its outbox terminal only after provider work and all preceding tenant writes finish. Therefore deletion winning first prevents invitation creation, and delivery winning first blocks deletion until it settles. Do not hold a MongoDB transaction across external HTTP. Already accepted messages cannot be recalled. A crashed sender may leave a PROCESSING reservation; reconcile its termination/outcome before clearing it rather than using an unsafe automatic expiry.

### Invitation redemption session fencing — 13 November 2026

Redemption transactionally consumes the exact authenticated, active, unexpired current session before accepting the code or minting a replacement. Password changes and logout write that same row, so a paused request authenticated earlier receives 401 AUTH_REQUIRED after revocation; invitation/membership changes roll back and no replacement cookie is sent. If redemption commits first, a subsequent password change revokes its newly created session. Session rotation is single-use: parallel redemptions sharing one old cookie may require retry with the fresh session, while independently authenticated sessions can join separate weddings concurrently. Other legitimate sessions are not revoked by redemption itself.

## Operations interaction refinement - 14 November 2026

Replace recurring notification polling with activity-triggered count reads. Wedding-scope fetch emits a tenant-keyed event after successful tenant API responses, excluding notification reads/writes to avoid recursion. Bell coalesces bursts, limits concurrent work to one request, respects hidden tabs and refreshes on focus/visibility return; explicit inbox actions trigger refresh too. An idle visible tab does not receive immediate remote events; this is an intentional tradeoff until a real-time delivery service is justified. No sockets or background email are added.

One-step paid purchase creates cost/payment plus audit/idempotency records inside the existing serialized wedding transaction. Existing-expense payments remain separately guarded against overpayment. UI removal maps to audit-preserving VOID. Empty/loading/result states are distinct; mismatched tab/filter results are hidden until the corresponding request resolves. Comment layout is isolated from task row CSS.
