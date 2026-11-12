# Multiple weddings and manual invitation codes — design draft

**Status:** Stitch reference generated and translated into the multi-wedding/manual-code implementation on 12 November 2026. Actual selector, scoped workspace and invitation flows were exercised in Chrome at 390px and 1440px. Review-state compositions below describe the design reference, not extra application controls.

Stitch project `2696754814529935110`; screen `69c051db0a31421fb2ff8f54eb5f5e4c`, titled **Multi-Wedding Workspace & 12-Character Code Invitation Lifecycle — Make My Event**. This is a new revision of the approved lifecycle composition `51040f9faaa840aeb8a96c9dbebbd237`; existing design exports remain intact. Desktop composition was requested; responsive implementation checks are recorded in PROJECT_STATUS.md. No generated application code was downloaded or installed.

## Requested review states

1. Your weddings selector after sign-in: multiple cards with independent role labels, one-card state, zero-wedding empty state, Create wedding, Join with code, bounded search, loading, access removed and recoverable error.
2. Scoped wedding-header switcher: current wedding marked, other wedding titles/roles, View all weddings and Join with code; unsaved changes confirmation before switching. One tab's selection does not change another tab.
3. Team invitation method: required recipient email, role and expiry, Share code manually versus Send email. Manual creation works without a domain or Resend. Optional email retains editable default subject/body.
4. Private code dialog: centered, masked by default, explicit Show code/Copy code, recipient/role/expiry summary, copy success/failure, expiry/invalid-state feedback and legacy missing-ciphertext replacement guidance. Codes remain revealable after email acceptance while active.
5. Join with code while already in other weddings: signed-in email, switch account, case-sensitive 12-character input, generic invalid/expired/wrong-account feedback, already-member guidance and success with Open this wedding/View all weddings.
6. Per-wedding roles/removal: last-admin protection, no global logout on removal from one wedding, no rights inherited from another wedding.

## Product and implementation constraints

- Keep the canonical ivory/forest/copper colors, Manrope/Newsreader typography and existing connected-moments brand. Use Pavithra and Manish for the primary sample; additional names are sample data only.
- All dialogs use the existing viewport-centering, 16px minimum margins, internal scrolling, 48% charcoal dimming and restrained 4px blur. Do not restore top-left browser-default positioning.
- Codes are 12-character case-sensitive single-use credentials, not public links, six-digit PINs or QR invitation URLs. Show no secret in tables, search previews, logs, ordinary API metadata or browser persistence. Copy is intentional; reveal is admin-only in the selected wedding, with masked/cleared in-memory display.
- Generated prototype review tabs demonstrate states; do not ship those controls. Generated sample locations and search-by-location copy are not new product scope: selector search is over accessible wedding title/couple/host names, not Google Places or unavailable wedding-location fields. No planner/client model, budget features or invented permissions.
- Canonical behavior, API/context handling, encryption lifecycle, migration and acceptance gates come from [the implementation plan](../docs/MULTI_WEDDING_AND_INVITATION_CODES_PLAN.md), not generated prototype code or prose. Secret values in design examples must remain fictional.

The design is ready for user review in Stitch. Generation success and returned design descriptions are the evidence available in this planning pass; actual desktop/mobile routes, focus, geometry and overflow are not claimed as verified until implementation.
