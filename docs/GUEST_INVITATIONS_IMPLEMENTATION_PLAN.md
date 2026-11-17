# Guest invitations implementation plan

14 November 2026. Implementation authorized after the planning pass. This plan follows the manual-link-only scope and the Stitch references in [the design brief](../design/guest-invitations/BRIEF.md). Implementation uses the defaults communicated during development: maximum 4 including the recipient, editable per function, and cutoff at function start unless earlier.

## 1. Deliverable and boundaries

An active ADMIN or ORGANIZER adds an individual/family recipient, selects one or more active functions, sets a private maximum per function and optionally writes a welcome message. Saving creates the recipient, invitations and one reusable private link atomically. The manager explicitly copies/shares that link. The recipient opens one image-free themed page without an account, views only invited functions, expands venue/Google Maps details inline, and saves a separate response/headcount per function. Management sees searchable recipients and accurate per-function totals in Guests and the existing Dashboard.

No guest email/phone collection, Resend delivery, reminders, vendor access, photo/gallery, livestream, calendar exports, theme builder or new notification kinds. Existing management-team email invitations stay unchanged. A shared link is bearer access: anyone receiving it can act for that recipient until revoked; this is not identity verification.

## 2. Code organization and reuse

Keep the current Next.js/TypeScript/MongoDB modular monolith. Add src/modules/guests with guest validation/types/DTOs, repository/index setup, management service/HTTP handlers, access-link crypto/session service, RSVP service, aggregation queries, UI components and focused tests. REST handlers remain thin adapters under src/app/api/v1. Do not put this feature into the already large operations page/service.

Management pages: /weddings/[weddingId]/guests and /weddings/[weddingId]/guests/preview. Directory, create/edit and recipient details use the existing shell, side-panel/draft protection and pagination patterns. Shared InvitationView renders both read-only management previews and the guest page; fetching and mutation permissions remain separate. Existing branding/tokens override generated placeholders. Reviewer bars/technical notes in Stitch exports are not product UI.

Reuse management authentication, exact X-Wedding-Id validation, CSRF/rate-limit helpers, date/time-zone conversion and the existing wedding coordination lock. Both ADMIN and ORGANIZER are permitted. Guest requests use a separate narrow authority resolver, never manager() or a client-chosen wedding. Inspect and reuse the AES-GCM approach in team/invitation-code.ts with domain separation; do not alter the current organizer invitation protocol. Extract only genuinely shared infrastructure if needed, with affected-consumer tests.

## 3. Database design

Use the four existing canonical collection names; these are already in the wedding cascade inventory, but guest-specific populated deletion/isolation tests must be added.

| Collection | Purpose and fields |
| --- | --- |
| guests | weddingId, displayName, optional personalMessage, ACTIVE/DISABLED status, revision, creator and UTC timestamps. No required account/email or separate family-member records. Duplicate names are permitted; never auto-merge recipients. |
| functionInvitations | weddingId, guestId, functionId, ACTIVE/REVOKED eligibility, PENDING/ACCEPTED/DECLINED response, private maxAttendees, attendeeCount, optional deadlineOverrideAt, revision and response timestamps. This is the sole RSVP source of truth. |
| accessLinks | GUEST subject, weddingId/guestId, tokenHash, separately encrypted recoverable secret/nonce/authTag/keyVersion, ACTIVE/REVOKED state, revision/version, creation/revocation/optional expiry. One active link per recipient. |
| portalSessions | weddingId, guestId, linkId, hashed random session token, link version, expiry and revocation. Separate cookies/authority from management sessions. TTL is cleanup, not authorization. |

Use existing auditEvents and idempotencyRecords for changes/retry protection. Never store plaintext link secrets in these collections, ordinary DTOs, logs or browser storage. Guest/preview DTOs must be explicit allowlists, not a generic database serializer that could expose maxAttendees, ciphertext or internal fields. Guest API examples omit the private maxAttendees setting.

Indexes: guests by weddingId/displayName/_id; unique functionInvitations weddingId+guestId+functionId, plus wedding/function/eligibility/status and wedding/guest/eligibility lookups; unique token/session hashes; partial unique active GUEST link per wedding/guest; session link/revocation lookup and expiry TTL. Review legacy inert vendor capability rows before adding indexes; do not delete or revive them. Any incompatible index change needs a guarded migration/backup, not an automatic destructive startup migration.

## 4. API contracts

All management routes below require active exact-wedding membership. Mutation bodies are bounded, strictly validated and versioned. Use current creation-key idempotency conventions for creation, replacement and correction. Ordinary responses are secret-free.

| Endpoint under /api/v1 | Behavior |
| --- | --- |
| GET /guests | Server-side name/function/response/active filters and cursor pagination, with a clearly defined response filter when multiple functions are selected. Never filter only the currently downloaded page. |
| POST /guests | Recipient + at least one selected function/max/deadline + creation key; creates recipient, function invitations and link in one transaction. Returns safe IDs/revisions/link state only. |
| GET /guests/{id} | Management details, per-function responses/private limits/deadlines and safe link metadata. |
| PATCH /guests/{id} | One atomic editor save for changed recipient fields and explicit add/update/revoke function changes. Send recipient revision and expected revisions for changed existing function invitations. Never overwrite unrelated RSVP fields from an old form snapshot. |
| POST /guests/{id}/links/reveal | Explicit authorized Copy/Reveal: decrypt current active secret, return URL with no-store, rate limit and audit without the secret. Both manager roles are allowed. |
| POST /guests/{id}/links/rotate | Replace secret and invalidate old link sessions atomically, preserving current RSVP/eligibility. Retry-safe; response is metadata, then explicit reveal. |
| DELETE /guests/{id}/links | Revoke link and its sessions with revision confirmation. No RSVP erasure; inactive-link recipients are excluded from current actionable invitation totals. |
| POST /guests/{id}/disable | Remove invitation from active management scope: disable recipient, revoke link/sessions and function eligibility, preserve historical responses. |
| PATCH /function-invitations/{id}/rsvp | Manager correction with reason, expected revision, validated response/count and audit. Keep canonical management invitation endpoints for focused future consumers; do not implement editor saves as multiple independent requests. |
| GET /guests/summary | Per-active-function recipient response counts and accepted people totals; same query helper also serves the existing Dashboard response. |
| POST /guest/access/exchange | Verify private secret and establish a narrow guest session; no RSVP is changed by opening/exchanging a link. This route implements the fragment-to-cookie exchange. |
| GET /guest/me and GET /guest/functions | Safe personalized presentation and eligible active function/RSVP data, including effective deadline, server time and UTC start/end inputs. No internal limits or other recipients. |
| PUT /guest/function-invitations/{id}/rsvp | ACCEPTED with integer count >=1 and <= current private limit, or DECLINED with count exactly0; expected revision and retry key. PENDING is not a guest-submitted response. |

Resolve static /guests/summary separately from dynamic IDs. Define stable errors for stale revision, unavailable invitation, passed deadline, invalid/over-limit count and rate limiting, with safe field feedback. Preserve current documented RSVP error names where applicable: STALE_REVISION, RSVP_DEADLINE_PASSED and ATTENDANCE_LIMIT_EXCEEDED. Do not reveal the private limit in an error payload.

## 5. Private-link and guest-session flow

Implemented share format: APP_ORIGIN/invite#token=<random-secret>. A URL fragment keeps the secret out of HTTP request paths and normal access logs; this deliberately supersedes the older /invite/{secret} plan. A minimal first-party entry reads it, POSTs the exchange and replaces the address with a clean invitation URL after success. No analytics, third-party scripts, referrer leakage, caching or token persistence on the entry/private page. Temporary exchange failures offer an explicit retry using only the live component's in-memory secret; no browser storage is used. If a complete fragment arrives while /invite remains mounted, consume it as a new exchange and ignore superseded response/error completions. A full reload after fragment removal still requires the original complete private link. Invalid/revoked links stay unavailable. Creating/replacing a guest link does not require a new external service.

Use at least 256 bits of randomness, hashed verification and versioned AES-GCM encryption solely for authorized re-copy. Production cookies are secure/HttpOnly with suitable SameSite and CSRF/Origin validation. Every read/write validates the live guest, wedding, exact active link/version, session expiry and eligible function. Rotating/revoking must block already open sessions too, not merely new exchanges. The link can open on multiple devices and is not a single-use organizing-team code.

Bind each clean invitation view to its exact guest session. Multiple invitation links/tabs in the same browser must not silently retarget a page or overwrite management authentication; specify invitation-scoped session selection/cookies and test it. Client IDs are selectors only, never authority. Invalid/revoked/replaced/expired links return the same polished unavailable view without disclosing wedding details. Encrypted-secret keys must exist in every target deployment; add any genuinely missing setting to .env.example without committing secrets.

## 6. Corrections and concurrency rules

- All management guest edits and guest RSVP writes serialize with the existing wedding coordination lock and check current records inside their transaction. Manager writes revalidate membership; public writes revalidate capability. This coordinates deletion, member removal, function archive, link revocation, limit/deadline changes and RSVP submission. Do not reuse a manager-only transaction helper for an unauthenticated guest.
- RSVP revision comparisons prevent two tabs/manager corrections from silently overwriting each other. Retry the identical request safely; stale drafts retain their typed data and offer reload/review, not an automatic overwrite.
- Reducing a maximum below an accepted headcount is rejected with guidance. A manager must explicitly correct the response with a reason; never silently truncate attendance.
- Unselecting a previously invited function revokes eligibility while retaining its response history. It disappears from the guest page and active totals. Re-adding it should explicitly begin PENDING/count0 with an audit of the previous state, rather than silently restoring an old acceptance.
- Replacing a link retains RSVPs. Revoking access preserves history but removes it from current active totals. An explicit re-invitation after full removal begins pending; it is distinct from link replacement.
- Declining sets count0 but does not revoke function viewing. Archive/deletion removes active guest access/counts while retaining history where the domain action requires it; wedding deletion still cascades all tenant guest records.
- Deadline checks use server time and current UTC values. Display wedding time zone, never the server/browser zone as authority. Re-evaluate current function start/deadline after schedule changes; never permit a stale page to bypass a shortened cutoff.

## 7. Summary and frontend data flow

Compute per-function invited recipients, accepted, declined and pending from active wedding/guest/link/function eligibility; accepted people is the sum of ACCEPTED attendeeCount. Invited = accepted + declined + pending. Historical revoked records do not inflate current totals. Do not sum repeated attendees across functions into a unique wedding headcount.

Use one MongoDB aggregation/query service for Guests and Dashboard; no hand-maintained independent counters and no totals derived from paginated client rows. Fetch a bounded first directory page and summary together; details only on open. Reuse epoch/abort/cursor invalidation protections from the reviewed pagination fixes.

Refresh/invalidate relevant directory/detail/summary data after a manager save or correction, on return/focus, or explicit refresh. Remote guest replies become visible on those refreshes; no claim of live push. Countdown ticks use the local clock calibrated from server time, never an API request per tick. Add guests/function-invitations to management scoped-fetch handling and existing activity-driven notification-count refresh without introducing recurring polling. Public guest traffic does not trigger management notification requests.

The shared invitation UI has compact function sections, consistent Save response actions, numeric controls only while attending, inline venue/map disclosures, and per-function pending/saved/error/deadline/start/end states. No photographs or image placeholders. Management previews are structurally read-only; correction is a separate authorized form, never a public guest mutation.

## 8. Implementation order and verification

1. Finalize contracts/defaults and update PRD/System/API/Database docs. Define DTO boundaries, indexes, errors and correction/re-invitation semantics before UI wiring.
2. Deliver management create/edit/list/detail + encrypted manual-link lifecycle, idempotency/audit and tenant/role tests. Both manager roles must pass.
3. Deliver guest exchange/read APIs + one shared invitation view/management preview, with eligibility/revocation/privacy tests.
4. Deliver per-function RSVP and audited manager corrections, with headcount/deadline/revision/concurrency and unchanged-retry tests.
5. Wire per-function summaries into Guests and Dashboard; test pagination/count correctness beyond one page and derived totals after edit/revoke/archive.
6. Inspect actual desktop/mobile routes and complete the focused end-to-end flow. Record exact evidence and remaining deployment work in PROJECT_STATUS.

Meaningful automated cases: cross-wedding and foreign-ID rejection; removed organizer; both manager roles; create/retry uniqueness; link reveal privacy and rotation invalidating existing sessions; multiple guest tabs/devices; integer/zero/over-limit counts; decline retains view; deadlines/time-zone/schedule changes; concurrent limit reduction/revocation/correction vs RSVP; uninvite/reinvite history; populated wedding cascade preserving unrelated tenants; stale pagination/loading/drafts; accurate response arithmetic. Use the isolated temporary MongoDB test setup, not retained weddings or real mail.

Normal development runs only affected tests. This feature introduces a new public capability boundary and touches shared wedding coordination/deletion, so broaden checks to those affected consumers; reserve the full application suite for the merge/release checkpoint. Browser checks at 390px and 1440px cover copy/share feedback, keyboard/focus, wrapping/overflow, inline venue/map destinations, form validation, preview read-only controls and unavailable-link states.

## 9. Implemented defaults and readiness

- Default maximum: four people including the named recipient, editable per function. This default was communicated during the authorized implementation.
- Deadline: retain an explicit per-function override; otherwise use the function default, falling back to function start if unset. Always bound effective RSVP cutoff by current function start. This is the implemented server rule.
- RSVP changes are allowed before that cutoff and authorized reasoned manager correction afterward.

Ready means the end-to-end manual-link flow works for both roles, guest/public DTOs expose no private limits/secrets, current counts reconcile after changes, revoked/stale requests cannot resurrect access or attendance, and focused tests plus actual-route desktop/mobile review pass. No guest Resend key, email domain or reminder infrastructure is a dependency. Local blank APP_ORIGIN uses http://127.0.0.1:3000. The production deployment must have APP_ORIGIN and INVITATION_CODE_SECRET configured. User review and deployment remain separate from local verification.
