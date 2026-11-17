# Guest invitations — design review

Requested on 14 November 2026. The initial design-only milestone is complete; implementation was subsequently authorized and is now locally verified, awaiting user review.

## Product scope

- Both wedding administrators and organizers may create/edit invitations for an individual or family label. A recipient represents an invitation, not necessarily one attending person.
- Manually share one personalized private link per recipient. No guest email fields, guest Resend delivery or guest reminders. Existing organizing-team email invitations are unaffected.
- Select one, several or all active functions. Configure a private maximum headcount per selected function, including the named recipient. The implemented editable default is four, including the named recipient.
- Use one common premium, image-free wedding invitation theme. Names, schedule and venues come from existing wedding/function records. Optional small original geometric pixel/voxel flowers/hearts are decoration, not raster images or copyrighted game assets.
- Management master preview shows all active functions; recipient preview applies eligibility and personalization. Preview controls must not submit guest responses.
- Public recipient view shows only invited functions, personalized greeting/message, date/time/time zone, per-function countdown, inline venue/address and Google Maps directions. No guest account is required; no directory, other recipients or internal caps are disclosed.
- Guests accept/decline each function and enter headcount when accepting. Named recipient is included; declined contributes zero. Save per function with loading, success and failure states. Invited functions stay visible after declining. Existing deadlines and manager correction requirements are retained for design review.
- Management overview and existing Dashboard show per-function invited recipients, accepted/declined/pending recipient counts and attending people separately. Never sum repeated function attendees into a unique wedding headcount.

## Requested screens

1. Guest invitations dashboard and searchable/paginated directory; populated, empty, filtered-empty, loading and error states. A compact per-function summary integrates into the existing wedding Dashboard.
2. Add/edit recipient panel with function selection, per-function maximums, optional welcome message and deadline controls; validation, draft/saving/error states.
3. Recipient details and manual link sharing; explicit reveal/copy feedback, edit, preview, replacement/revocation confirmation and response overview.
4. Organizer master invitation preview, reusing the same guest presentation and displaying all or recipient-specific functions without submitting RSVPs.
5. Personalized single-page guest invitation; inline venue expansion, per-function countdown/RSVP/headcount, deadline/start/end states and unavailable-link/loading/error states.

## Visual direction and generation

Use Stitch project 2696754814529935110 and its existing design system. Canonical implementation tokens override generated palette discrepancies. Ivory/forest/copper, Manrope interface and Newsreader names, fine borders, restrained motion, no photographs/raster images or text-heavy panels. Desktop screens are requested with 390px adaptation guidance. No live route or browser verification is implied by a design export.

Detailed generation prompts are preserved in MANAGEMENT_PROMPT.md and INVITATION_PROMPT.md. Generation results and deviations will be recorded after inspection. Mock data uses Pavithra and Manish, 18–20 February 2027, Asia/Kolkata. Invitation counts are recipient counts; accepted headcounts count people.

## Review links and actual verification

- [Guest invitation page](https://stitch.google.com/projects/2696754814529935110?node-id=28670170c7664dad9783f22af5c113e2)
- [Organizer preview](https://stitch.google.com/projects/2696754814529935110?node-id=1f87d2f5d8ee4664ad8a71fc764bf9d0)
- [Dashboard and directory](https://stitch.google.com/projects/2696754814529935110?node-id=be27540abb554ecf89595a919590a361)
- [Add/edit recipient](https://stitch.google.com/projects/2696754814529935110?node-id=f5963f783cf143558236ec0432b5fa53)
- [Recipient details and link sharing](https://stitch.google.com/projects/2696754814529935110?node-id=783bbe726e964a889524aa37ca957d87)

All five initial screen screenshots were visually inspected. The initial guest/preview drafts exposed a global party-cap badge and the preview used old navigation. A Stitch edit returned DOM-operation events but raw exports/screenshots remained unchanged, so two fresh screens were generated and visually inspected instead. The FINAL-labelled public and organizer screens linked above supersede guest-page.html and organizer-preview.html; they remain drafts awaiting user approval, not production-ready or tested features. final-guest-page.html and final-organizer-preview.html are their current exports. Both have zero img elements and no global party-allocation/max badges. The public screen has small geometric corner flowers, a heart accent, a short greeting, three dated/countdown/RSVP sections and inline venue/map details; the manager preview uses the grouped sidebar. The other three exports are the original management drafts, with the requested cleanup captured in REFINEMENT_PROMPT.md and STITCH_REFINEMENTS.json.

Paired directory empty/filter/loading/error states and guest response/deadline/unavailable states were requested and included as prototype/reviewer variants across the drafts. This does not verify their interactions or claim every state was rendered individually. Desktop screenshots were inspected; mobile adaptation notes are design guidance, not an actual mobile route check. No application tests/build were run because no application code changed.

## Implementation boundaries after approval

Reviewer state-switcher controls, diagnostic/handoff cards, generated token IDs, generic capacity-per-ceremony copy, invented family surnames, valet/amenity notes and branding substitutes are not product requirements. Use existing brand assets, actual function colors and actual wedding data. Keep private caps per function in management only; raw placeholder token snippets must not become ordinary response fields. Maximum defaults remain a product decision; four is sample data. A master preview must not submit guest RSVPs. No link-open tracking, email/reminders, export tools, calendar files, galleries, livestream or new theme editor is added by these drafts. Management counts and private-link revocation semantics will need explicit service/API validation during implementation. This review changes neither current database collections nor deployed behavior.


Implementation authorized on 14 November 2026. The shared invitation, management directory/editor/details and preview translate these references using existing product tokens. Reviewer bars and simulated state controls are excluded. See docs/GUEST_INVITATIONS_IMPLEMENTATION_PLAN.md and PROJECT_STATUS.md for implementation decisions and actual browser verification; the initial design-only limitations above describe that earlier milestone.
