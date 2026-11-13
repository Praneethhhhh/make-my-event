# Premium experience and wedding deletion — 13 November 2026

Scope authorized together by the user: redesign the landing page with Stitch, consolidate account navigation, reduce copy across existing routes, introduce restrained motion and deliver permanent administrator-only wedding deletion.

## Experience

- Preserve the connected-moments brand, ivory/forest/copper tokens and Manrope/Newsreader fonts. Use visual hierarchy and photography instead of long explanations. Keep field errors, security guidance and time-zone/date constraints wherever a decision needs them.
- Landing: photographic split hero, short editorial heading, labeled Pavithra/Manish sample schedule, three concise feature tiles, one closing action. Advertise implemented wedding/functions/team capabilities only.
- Workspace logo opens `/weddings`. Name/avatar opens the only account dropdown: current wedding and roles, wedding switching, Your weddings/Create/Join, then Sign out in separated groups. Escape, outside click and navigation close it; focus returns on Escape. Scope remains URL-local.
- Motion: short entrance/hover transitions and soft ambient light; no neon, pointer trails or continuously moving controls. Honor reduced motion.

## Permanent deletion contract

- `DELETE /api/v1/wedding`, exact `X-Wedding-Id`, authenticated active ADMIN, CSRF, mutation throttle. JSON requires current revision and exact confirmation title. A stale revision/title returns 409, organizer 403 and inaccessible tenant 404.
- Lock the active wedding in the same transaction used by profile, function and membership writes; recheck ADMIN inside it. Remove the wedding and all canonical wedding-owned rows atomically, including archived functions, memberships, invitations/ciphertext, outbox, audit and creation replay records. Preserve users, account sessions and unrelated weddings. No retained wedding audit row survives this explicit full-deletion action.
- The current application has no uploaded media integration. Refuse deletion if photo records exist rather than claiming external objects were removed; add real object cleanup before that future integration ships. Already sent email cannot be recalled, but deleted codes cannot be redeemed. Platform-wide anonymous quota counters remain operational data.
- Settings shows a separate administrator-only danger section. A centered modal requires exact title; Cancel/Escape preserve records, duplicate submissions are blocked, failure preserves confirmation, success clears dirty state and returns to the selector.

## Verification

Focused tenant/role/CSRF/revision/cascade tests, deletion versus protected-write concurrency, account-menu keyboard/navigation/sign-out, mobile/desktop landing and details, reduced motion and overflow. Broaden only across affected authentication/navigation consumers. Record actual outcomes and limitations in PROJECT_STATUS; never delete retained tester data for verification.

Deletion replay protection: creation idempotency rows become anonymous tombstones containing only their opaque key hash and deletion timestamp. Account, wedding and payload references are removed. This prevents an old creation retry from recreating an explicitly deleted wedding; a fresh creation key still permits a new wedding.
