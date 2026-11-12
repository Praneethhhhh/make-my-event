# MAKE MY EVENT

## Product Requirements Document — Version 1.0

**Status:** Approved-direction implementation baseline; production readiness subject to the release gates below  
**Date:** 8 November 2026  
**Product:** Make My Event (initially optimized for multi-function Indian weddings)  
**Delivery model:** Responsive web application; one production MVP in six development phases  
**Target scale:** Up to 200 guest recipients per wedding in the initial deployment; multiple isolated wedding tenants  
**Document owner:** Product and engineering

**12 November 2026 implementation amendment:** Multiple weddings per account and admin-revealed, manually shareable invitation codes are implemented. The rules below describe the delivered product contract; actual verification and remaining dependencies are recorded in PROJECT_STATUS.md. See [the delivery plan](MULTI_WEDDING_AND_INVITATION_CODES_PLAN.md) for UX, migration and acceptance gates.

> **Product promise.** Make My Event lets a small wedding organizing team coordinate functions, tasks, actual expenses, vendor discovery and assignments, guest invitations and RSVPs, photographs, and livestream links. Admins and organizers use authenticated management tools; guests and vendors use private links with no accounts.

## 1. Summary and success criteria

Make My Event is a focused, multi-tenant event-management application. Within a single wedding workspace, its administrators and organizers collaborate over the **same** operational records. A guest receives a unique invitation link (optionally sent via Resend email) and sees only invited functions. A vendor receives a unique restricted link and sees only assigned responsibilities and its own financial status. Both guest and vendor portals are mobile-first. The organizer experience is a responsive productivity dashboard.

**Release success:** The organizing team can create a wedding; add functions and team members; search nearby vendors and record selected vendors; assign and complete tasks; track expenses and vendor balances; send personalized invitations, collect function-specific RSVPs and send reminders; upload and share function-scoped photographs; and provide eligible livestream embeds. The production environment must satisfy the security, cost, and recovery gates in Sections 9–11.

## 2. Core product rules (binding)

| ID     | Rule                                                                                                                                                                                                                   |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CPR-01 | An authenticated management user may belong to **multiple weddings**, with a separate role and membership in each. After sign-in the user selects a wedding; selection in one tab cannot redirect another tab's edits. |
| CPR-02 | One wedding has multiple management members; multiple administrators and organizers are supported.                                                                                                                     |
| CPR-03 | All administrators and organizers in the **same** wedding can view and update the same management records; no private task or expense partitions.                                                                      |
| CPR-04 | Only administrators may invite/remove management members or change roles. The last active administrator cannot be removed.                                                                                             |
| CPR-05 | Guests and vendors have **no accounts**; each recipient uses a high-entropy, individually revocable private URL.                                                                                                       |
| CPR-06 | One wedding contains several independently configurable functions. Each guest's function eligibility and RSVP are separate.                                                                                            |
| CPR-07 | Wedding-owned records are isolated using the wedding's tenant identifier; client-side hiding is never the access-control mechanism.                                                                                    |
| CPR-08 | The finance module records **actual expenses, agreed vendor charges, payments, and outstanding amounts only**; no budgeting.                                                                                           |
| CPR-09 | Wedding organizers manage their own wedding; there is no professional planner/client workspace model.                                                                                                                  |
| CPR-10 | Photographs become gallery-visible **without human approval**, only after technical validation. Organizers retain removal and recategorization powers.                                                                 |
| CPR-11 | Vendor discovery uses **Google Places API (New)** only for nearby/text search. There are no booking, quotes, marketplace payments, or lead-management features.                                                        |
| CPR-12 | Management authentication is **custom email/password** with secure server-side sessions; no third-party auth provider, Google OAuth, or mandatory signup email verification in v1.                                     |

**Terminology note:** This product calls its parent workspace a _wedding_; the technical design may use a generic `eventId` for this same tenant boundary. One workspace is not one function.

## 3. User roles and permissions

| Capability                                   | Administrator | Organizer              | Guest private link     | Vendor private link             |
| -------------------------------------------- | ------------- | ---------------------- | ---------------------- | ------------------------------- |
| Management login and full same-wedding data  | Yes           | Yes                    | No                     | No                              |
| Add/remove or change management members      | Yes           | No                     | No                     | No                              |
| Manage functions, schedules, and venues      | Yes           | Yes                    | View invited only      | View assigned only              |
| Manage tasks and comments                    | Yes           | Yes                    | No                     | Complete own assigned tasks     |
| Record expense and vendor payments           | Yes           | Yes                    | No                     | View own relevant balances only |
| Search Places and save own vendor record     | Yes           | Yes                    | No                     | No                              |
| Invite guests, configure RSVP, send emails   | Yes           | Yes                    | No                     | No                              |
| RSVP independently per invited function      | N/A via role  | N/A via role           | Yes, until deadline    | No                              |
| Upload function-scoped photos                | Yes           | Yes                    | If invited and allowed | Photographer permission only    |
| Delete/recategorize gallery photos           | Yes           | Yes                    | No                     | No                              |
| Edit wedding-wide and communication settings | Yes           | Yes, except membership | No                     | No                              |

An authenticated account may create a wedding and become its first administrator, even when already a member of other weddings. Admins invite co-admins/organizers by recipient email and role, choosing manual code sharing or email delivery. They may explicitly reveal/copy an active invitation code, including after successful or failed email. The invitee registers/signs in with the intended email and enters the single-use code; having memberships elsewhere does not block joining. Possession of the admin-issued code grants invitation authority; neither a claimed email nor manual delivery establishes mailbox verification. Management invitation links remain unsupported. Roles and last-admin protection apply separately to each wedding.

## 4. Product features and functional requirements

### FR-01 — Custom management authentication and membership

- Email/password signup, login, logout and password reset using a carefully secured custom implementation; no Google OAuth and no authentication-as-a-service.
- Signup email ownership confirmation is **not required in v1**. Email remains a username/contact field, not proof of identity until mailbox control is demonstrated for a particular action.
- Any signed-in management user may create another wedding or join using an admin-issued, expiring, single-use code. Enforce one membership row per wedding/account, not one wedding per account.
- HTTP-only secure cookies back opaque, revocable database-stored sessions. An administrator can revoke member access immediately.
- Homepage actions reflect the current session. Signed-in users see Your weddings; visiting either account form while signed in, or successfully authenticating, opens the wedding selector. Zero, one and multiple wedding states all support Create wedding and Join with code.
- Team invitations support Share code manually without Resend credentials/domain setup, plus an optional email composer with editable defaults and fixed security instructions. Only selected-wedding admins may reveal/copy valid codes in a private dialog. Email success does not remove this ability; expiry, revocation, consumption or replacement does. Codes are masked by default and absent from ordinary metadata, logs and URLs.
- Recipients may join an additional wedding from Join with code. Already belonging to the target wedding never duplicates membership or changes role. Administrators can change roles/remove access only within their wedding; preserve its final active admin and contributions/history. Removing access in one wedding must not log the account out of unrelated weddings.
- A unique wedding/account pair prevents duplicate memberships. Every business request validates the explicitly selected wedding and its current membership; independent weddings never share operational data.

**Acceptance:** Attempts to access another tenant fail; organizer cannot manage membership; unverified-email matching alone never grants wedding access; password hashes are never exposed.

### FR-02 — Wedding creation, functions and venue information

- Manage couple/host names, wedding title, tradition, dates, description, header/cover image and invitation theme.
- Create/edit/archive functions with descriptions, start/end times, multiple activities (e.g., ceremony, rituals, meal), dress code and guest instructions.
- The wedding start/end dates define the inclusive overall schedule in its selected time zone. Every active function’s start and optional end must fall within that range. Reject wedding date or zone changes that would exclude an active function; move or archive the affected function first.
- A function requires an organizer-selected accent color when created or edited. Apply it to a restrained border/marker on a white card, not the entire card background. Keep visible card actions concise: Edit and Remove.
- Each function has venue name, address, optional city/state, **latitude and longitude**, Google Maps directions URL and optional entry/landmark notes.
- Show changes immediately to invited guests and assigned vendors. Organizers may edit after invitations were issued.

**Acceptance:** Uninvited function data is not retrievable through guest endpoints. Coordinates use validated numeric ranges.

### FR-03 — Shared organizer dashboard and settings

- Management dashboard shows approaching functions, assigned/pending/overdue tasks, actual paid spending, outstanding vendor payments, pending RSVPs, email problems and photo/storage usage.
- Settings include wedding profile, organizers and administrators (admin-only membership controls), invitation theme/content, RSVP defaults, email/reminder preferences, private-link revocation and personal account settings.
- All organizers see the **same wedding records**, regardless of who created them. Creator/assignee indicators can exist without establishing private visibility.

### FR-04 — Tasks

- Create/edit/delete function or wedding-wide tasks, assignees (organizer/vendor), due dates, priority, description, comments, @mentions and status.
- Toggle List/Kanban views with the same backing data; statuses **To Do / In Progress / Completed**.
- Vendor private links expose only explicitly assigned vendor tasks; vendors may mark their own assigned tasks complete, not edit arbitrary tasks.
- Overdue and upcoming tasks appear in the dashboard, without external push alerts.

### FR-05 — Expense-only tracking and vendor payments

- Record standalone paid expenses with description, date, amount, currency, function and optional vendor reference.
- Record vendor agreed charges and separate partial payments/advances with date, amount and optional note.
- Display **actual paid total**, function totals, vendor payment history, and **outstanding = agreed charges − recorded payments**.
- Never double count a vendor payment as both a separate expense and a payment against a charge.
- No budget targets, function allocations, forecasting, split-bill settlement, or payment gateway.
- Finances are visible to every admin/organizer in the wedding; vendors see only their own agreed/paid/due totals.

### FR-06 — Vendor directory, discovery and restricted portals

**Managed vendors.** Organizers manually maintain vendor name, category, contact numbers, optional email, notes, assigned functions, responsibilities, agreed amount and payments. Vendor link grants read access to only that vendor's assignments, schedules, venue and own payment status, plus completion of assigned tasks. Photographers may additionally upload media to authorized functions.

**Google Places discovery (new).** Within the organizer portal, a user may:

1. Choose a function venue's coordinates or enter a manual search location; choose a distance radius and category/keyword.
2. Search nearby vendors using **Places API (New) Nearby Search** and, for types not represented well by Places categories, **Text Search (New)**.
3. View a short results list with Google attribution, selected live place information and a link to Google Maps; optionally view a place on a compliant Google Map.
4. Select a place, retain its **place ID** as a reference, and create a separately editable internal vendor record using organizer-supplied operational/contractual details.

Vendor discovery **does not** imply booking, offers, quotation collection, price comparisons, Google reviews storage, or live vendor messaging. The Places API requires billing enabled, quotas, a restricted API key, field masks, appropriate attribution, and data retention compliant with Google policy. Persist place IDs, not copied or bulk-cached Google Places profiles; details shown from Google are fetched when necessary and should not be saved into the internal vendor record as long-lived Google-derived content.

**Acceptance:** Search errors and exhausted API quota yield a clear message and do not prevent manual vendor entry. Search requests enforce per-wedding quotas and cannot be called from anonymous guest/vendor links.

### FR-07 — Guest recipients and unique invitations

- Organizer manually adds a recipient/family-head name, optional email address, optional personalized message, eligible functions, private attendee maximum for each function and RSVP deadlines.
- Each guest recipient has one unguessable, revocable private URL. Invitee emails are optional unless sending an email.
- Copy/share private URLs manually or send personalized emails through Resend; each email contains the correct private link and event details.
- Organizer views pending/accepted/declined function invitations, guest counts and email delivery statuses.

### FR-08 — Guest portal and RSVP

- No guest signup or login. Private invitation link opens mobile-first themed invitation with only invited functions, countdowns, venue, map/directions, dress code, activities, permitted gallery and embedded YouTube livestream.
- For each eligible function: **Pending / Accepted / Declined** and accepted party headcount within the private maximum. Declined contributes zero attendees.
- Guests can edit before organizer-configured RSVP deadline, not afterward. Organizers may correct a locked RSVP with an auditable override.
- RSVP totals distinguish invitation **recipients** from attending **people**. Declining does not remove legitimate function visibility or livestream access.

### FR-09 — Invitations and RSVP reminders via email

- Organizers preview, send and resend invitation messages to recipients with emails.
- Organizers can filter **pending** function RSVPs and trigger manual reminders only for eligible recipients with an email, an active link and a future deadline.
- Optional **once-daily automatic reminders**, disabled by default, apply a configurable number of days before RSVP deadline, avoid duplicates and respect opt-outs.
- The application tracks queued, sending, accepted-by-provider, delivered-if-confirmed, failed and suppressed states; never labels provider acceptance as proof of inbox delivery.
- Delivery uses a **MongoDB-backed outbox**, immediate small-batch attempts for organizer actions, and **Vercel Cron once daily** to process backlogs and automatic reminders. Resend daily/monthly limits apply across the entire platform.
- Avoid unrestricted bulk emailing; apply per-wedding rate caps, daily platform caps, retry/backoff and deduplication.

### FR-10 — Invitation design and countdowns

- Curated, culturally appropriate predefined themes with editable text and event images; no Canva-style drag-and-drop builder.
- A clear guest homepage shows approaching eligible functions and timing/countdowns. Guests do not receive push notifications.

### FR-11 — Photographs, direct upload and galleries (NO human moderation)

- Admins, organizers, invited guests and authorized photographer-vendors may upload photos scoped to permitted functions.
- **No organizer approval/rejection queue.** After size/type/content safety checks and successful storage finalization, a valid photo is gallery-visible immediately to eligible recipients.
- Organizers may delete or move a photo between functions; each move immediately changes who can see it. Guest upload permission may be disabled per invitation while viewing remains enabled.
- Compress images to high-quality web formats, use private R2 storage, short-lived access URLs, gallery pagination, no public bucket, strict upload limits, and safe failure/retry behavior.
- Uploaded video hosting and automated AI content moderation are excluded. No claim is made that technical file validation reviews photo content.

### FR-12 — YouTube livestream

- Organizers set an optional YouTube video/live URL per function. Eligible guests can watch a player embed whether RSVP is accepted or declined.
- Video hosting, ingest, recording and guaranteed external YouTube-link privacy are excluded.

## 5. Primary screens

| Management (authenticated)                      | Private guest                                     | Private vendor                   |
| ----------------------------------------------- | ------------------------------------------------- | -------------------------------- |
| Register/Login/Recovery, Wedding Setup          | Personalized invitation                           | Assignments and function details |
| Dashboard, Functions, Schedules, Venues         | Function schedule, countdown, maps                | Own payment summary              |
| Tasks List/Kanban, Expense Tracker              | RSVP per function                                 | Complete assigned task           |
| Vendors, Nearby Discovery, Vendor Detail        | Approved-to-display photo gallery (no moderation) | Photographer upload (authorized) |
| Guests, RSVPs, Email Sending & Reminders        | Upload photos (if permitted)                      | Invalid/revoked link state       |
| Gallery Management, Invitation Themes, Settings | YouTube livestream                                |                                  |

## 6. Critical end-to-end user journeys

**J1 — Onboard:** user registers/signs in → Your weddings selector → creates a wedding as its first admin or joins another using a manually shared/emailed single-use code → selects the wedding to open → collaborates with its team. Accounts may repeat create/join for several weddings, with independent roles and tab-local switching.

**J2 — Find and manage a vendor:** organizer selects venue coordinates/category → Google Places returns attributed live results → organizer selects a place ID and enters an internal vendor record → assigns functions and responsibilities → copies restricted vendor link → vendor views details and completes assigned tasks.

**J3 — Record spending:** organizer creates vendor charge and partial payments → paid and due totals update across the organizer dashboard and that vendor's private portal; vendor cannot edit payments.

**J4 — Invite and RSVP:** organizer creates guest recipient and selects functions, limits, deadlines → copies URL or queues a Resend email → guest opens link without account → accepts or declines each invited function and enters headcount → counts update → organizer sees pending RSVPs.

**J5 — Remind:** organizer requests manual reminder, or daily cron evaluates eligible pending function invitations → outbox claims jobs and sends under quota → recipient opens the same link → accepted/declined response makes that function ineligible for future pending reminders.

**J6 — Share photos:** eligible guest uploads compressed photo → technical validation/finalization succeeds → photo appears immediately in that function's private gallery → organizer can move/delete → permissions update accordingly.

## 7. Quality, security and operations requirements

- **Isolation:** every management query and mutation includes server-derived tenant context; guest/vendor links receive narrowly scoped authorization. Automated tests must attempt cross-tenant access.
- **Custom auth:** passwords protected by Argon2id (or comparably accepted secure password hashing), generic login errors, login/signup throttling, secure opaque database sessions, `HttpOnly`, `Secure`, `SameSite` cookies, CSRF protection, rotation and revocation. No verification email during registration; do not infer identity solely from address.
- **Tokens:** guest/vendor/join tokens use cryptographically random entropy, hashing at rest, rotation/revocation, expiration as appropriate, no logging of secrets; short-lived cookie-scoped access after opening a private URL where possible.
- **Rate limiting:** server-side shared persistence across Vercel invocations; IP + account/link + wedding quotas, with strong limits for login, anonymous RSVP, uploads, discovery and email.
- **Files:** private R2 with short-lived upload/download URLs, MIME/signature/size checks, post-upload finalization, quarantine until technical validation is complete, ownership verification, storage quotas and cleanup of orphans.
- **External service failures:** graceful UI errors for Maps, Resend, R2 and MongoDB outages; no false success claims.
- **Reliability:** idempotent RSVP mutations and email-job claims; atomic updates, suitable transaction use for financial correctness, indexes, migrations, backup/restore procedure.
- **Observability:** structured application logs and an application-maintained audit collection; no mandatory third-party monitoring/observability service in v1. Never log email secrets, cookies or access-link tokens.
- **Performance and accessibility:** responsive guest/vendor mobile-first design, efficient desktop management, pagination and lazy-loaded photos, WCAG-informed contrast/forms, meaningful empty/error states; target good Core Web Vitals and test at intended load.
- **Service quotas and legal:** respect Resend quota; Maps billing/quota and attributions; free-tier usage caps; Vercel Hobby personal/noncommercial use; privacy policy and Terms including Google requirements; remove/export individual data when needed.

## 8. Out of scope by choice

No budgeting/planned allocation/forecasting; payment gateway; professional wedding-planner CRM; separate bride/groom budgets; private organizer records; guest or vendor login; Google OAuth; mandatory signup email verification; SMS/WhatsApp automation; native mobile apps; guest transport, accommodation, catering preferences, seating; complex invitation editor; user-hosted video; mandatory manual photo approval; external enterprise monitoring; marketplace bookings, quotes or payment fulfillment. Multiple wedding memberships support families helping in several celebrations, not a professional planner/client model.

## 9. Six-phase MVP release strategy

The six phases are sequential **engineering milestones**, not six public launches. Security and testing are continuous. A single public v1 release follows final acceptance.

| Phase                                          | Scope                                                                                                                                                                                                                 | Exit gate                                                                                                                                          |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Foundation & tenancy**                    | Next.js monolith; TypeScript; Mongo/Mongoose; custom auth/sessions; multiple wedding memberships and selector/switcher; manual/email admin invitation codes with controlled reveal; functions and settings foundation | Multi-wedding/tab isolation, per-wedding roles/revocation, code lifecycle and last-admin tests pass; existing wedding/functions CRUD remains valid |
| **2. Organizer operations & vendor discovery** | Shared dashboard; tasks List/Kanban/comments; actual expenses and payments; vendor directory and private vendor links; Google Places nearby/text search with quotas & attribution; venue coordinates                  | Payment totals correct; vendor access scoped; Places failures gracefully fall back to manual vendor entry                                          |
| **3. Guest invitation & RSVP**                 | Guest records, unique private links, invitations, themed baseline, function eligibility, RSVP limits/deadlines, dashboard counts                                                                                      | No-login link works; invalid/revoked links blocked; function isolation and RSVP validation pass                                                    |
| **4. Email delivery & daily jobs**             | Resend invitations; Mongo outbox; immediate small batches; Vercel daily cron; manual and automatic pending-RSVP reminders; settings, dedupe, retries, quotas                                                          | End-to-end delivery, no-duplicate and quota tests pass; pending-only reminder logic works                                                          |
| **5. Photos & visual experience**              | Editable predefined themes, compressed R2 uploads, immediate technical-validated publication, gallery permissions, organizer delete/retag, YouTube embeds, mobile polish                                              | Private media access and function reassignment tests pass; gallery and livestream work on mobile                                                   |
| **6. Production hardening & launch**           | Threat-model review, abuse and load tests, email/Places quota drills, backups and restore test, logs, accessibility, staging smoke tests, deployment & documentation                                                  | All critical release gates passed, no known critical security issues, live configuration and recovery validated                                    |

**Risk discipline:** Phase 2 vendor discovery is a paid-service dependency even if usage remains inside free monthly thresholds. If Maps billing is unavailable, the vendor-directory functionality remains usable; the Places search portion is feature-flagged off rather than blocking the whole release.

## 10. Production acceptance / release gates

- [ ] Two separate wedding tenants cannot read, update or enumerate each other's records, photos, guests or vendors.
- [ ] Signup/login/password reset and secure session revoke work without a third-party auth service or signup email confirmation.
- [ ] Single-use invitation codes delivered manually or by email control joining; admin-only reveal/management, recipient binding and invalid-state rejection work without relying on email delivery.
- [ ] Accounts select and switch among their weddings; independent tab context, per-wedding roles, revocation and last-admin guards pass isolation and concurrency tests.
- [ ] Functions, task list/Kanban, comments and vendor completion work together.
- [ ] Expenses and payments are accurate and never double counted.
- [ ] Nearby vendor search works within configured Places quotas, shows required attribution and stores only permitted references.
- [ ] Guest links work without accounts; per-function eligibility, headcount limits, RSVP deadlines and revocation are enforced server-side.
- [ ] Personalized emails contain correct private links; queued/failed/sent states and retries are accurate; pending-only reminders run daily within quotas.
- [ ] Photo upload produces private, technically validated media that is immediately visible only to eligible invited functions; organizer deletion/retag works.
- [ ] Unauthorized users cannot retrieve private R2 objects or reveal signed media URLs through API routes.
- [ ] Basic logs and audit events work without leaking credentials; backups can be restored.
- [ ] Google Places billing guardrails, privacy policy and Terms are ready; Vercel plan use aligns with product operation.
- [ ] All critical flows pass browser-based end-to-end tests on mobile and desktop.

## 11. Approved implementation direction and remaining limits

The following implementation direction is approved: the RSVP deadline defaults at the function level with an optional per-invitation override; an authorized organizer correction after a deadline is audited. Each invitation has a separate maximum and guest-upload permission per function. Once-daily automatic reminders default off. Management accounts may join several weddings and explicitly select their working context. Admin invitation codes are short-lived, single-use and privately shareable manually or by email; authorized reveal is the narrow exception to ordinary secret-free responses. Management invitation links remain unsupported. Valid photos publish immediately only **after** technical validation. Email/password is the only management sign-in method. Google Places discovery data remains live rather than a permanent listing cache, except permitted place IDs; organizer-entered venue coordinates do not require geocoding. Exact operational limits and retention periods remain configurable and must be finalized before production.

## 12. External references and policy checks

- Google Places (New) pricing / required billing / field masks: https://developers.google.com/maps/documentation/places/web-service/usage-and-billing
- Google Places policies, storage and attribution: https://developers.google.com/maps/documentation/places/web-service/policies
- Nearby Search (New): https://developers.google.com/maps/documentation/places/web-service/nearby-search
- Google Maps India pricing/eligibility: https://developers.google.com/maps/billing-and-pricing/india
- Vercel Cron Hobby limits: https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing
- Resend plan quotas: https://resend.com/pricing
- Cloudflare R2 pricing: https://developers.cloudflare.com/r2/pricing/
- OWASP password storage: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- OWASP sessions: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html

**End of Product Requirements Document — Make My Event v1.0**
