# Team invitation lifecycle

**Baseline implementation record:** This describes the implemented email-first/single-wedding UI before the 12 November multi-wedding/manual-code amendment. The new planned design and overrides are recorded in [MULTI_WEDDING_DESIGN.md](MULTI_WEDDING_DESIGN.md); do not copy the baseline's no-code-sharing or global-session-revocation behavior into the new implementation.

Stitch project: `2696754814529935110`. The approved initial Team composition is screen `d76bdc56af424672bb0eefe55c66ffaa`; the complete lifecycle refinement generated on 12 November 2026 is `51040f9faaa840aeb8a96c9dbebbd237` (Team & Invitations — Email-Code Lifecycle).

The implementation retains the approved ivory/white/forest palette, editorial heading, compact member roster and separate invitation panel. On narrow screens, the roster, pending invitations and invite panel stack. The email composer is a modal opened after validating the recipient; subject and message start with editable family-friendly defaults. The summary identifies recipient, role and expiry. A fixed notice explains that code and acceptance instructions are added automatically.

Modal positioning correction: all team dialogs use explicit viewport-fixed insets and automatic margins, with fit-content height and a maximum height of the viewport minus 32px. The email composer is at most 620px wide; other confirmation dialogs retain their 480px maximum. Overflow scrolls inside the dialog. The backdrop uses charcoal at 48% opacity and a restrained 4px blur. This corrects the top-left placement caused by relying on browser dialog margins under the global CSS reset; it does not change the approved form composition.

The join route presents the signed-in recipient email, case-sensitive code field, invalid/expired feedback and account switching. Team admins have role and removal dialogs, with last-admin protection explained beside disabled actions. Removing access retains contributions and revokes sessions. Existing active/pending, empty, solo-admin, loading and recoverable-error states remain functional states rather than a design-review switcher in the shipped app.

Product/security rules override generated Stitch examples: use the application's random **12-character** code, not the design generator's illustrative six-character code; no capability invitation links, automatic acceptance, clipboard sharing, invented planning roles or run-of-show feature claims. Follow `IMPLEMENTATION_TOKENS.md` for styles and the PRD/API/database documents for behavior.
