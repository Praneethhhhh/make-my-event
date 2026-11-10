# Make My Event project status

Last reviewed on 10 November 2026. The scaffold is complete and the public landing page is implemented for desktop and mobile review. Development is at the start of the PRD’s foundation and tenancy phase.

## Project scaffold — complete

The repository runs a single Next.js App Router application with strict TypeScript. The root layout loads Manrope and Newsreader. Global CSS and shared color, spacing and typography guidance give future screens a common starting point. Tailwind, ESLint, Prettier and the pnpm scripts for formatting, linting, type checking and production builds are configured.

The scaffold was exercised through its normal homepage route. The development server returned HTTP 200 and the expected page heading, and the initial scaffold was reviewed in the browser. For local setup, use Node.js 24 and pnpm 10.11.0, run `pnpm install` and `pnpm dev`, then open the address printed by Next.js. The public page can be reviewed without configuring database or provider credentials.

## Public landing page — implemented, ready for review

- **Visitor experience.** The header and hero introduce the product to families. Visitors can jump to Features, How It Works and Guest Experience, browse examples of wedding tasks and payments, and expand questions about access and privacy.
- **Wedding preview.** Aarav and Meera’s sample itinerary spans five functions. The Sangeet example distinguishes people attending from invitations awaiting a reply. A guest invitation shows the schedule and venue information available to one family.
- **Design and verification.** The page follows the Stitch landing-page composition and the repository’s ivory, forest and copper palette. TypeScript and lint passed. At 1440px the organizer preview and guest card overlap. At 390px they stack, and browser checks found no horizontal overflow at either width.
- **Handoff.** The preview uses static examples. Sign In opens /sign-in, and Create an account opens the registration form. The implementation lives in `src/app/(marketing)/`, with the hero and preview in `page.tsx` and the remaining sections in `landing-details.tsx`.

## Management registration, sign-in and sign-out — implemented

The homepage links to `/register`. The form collects a display name, email and password. The registration service normalizes the email, hashes the password with Argon2id and writes the user and session together in a MongoDB transaction. A valid session identifies the account on refresh. Registration grants no wedding membership.

Formatting, lint, TypeScript and the production build passed. The development Atlas connection was verified. API checks passed for registration, session restoration, duplicate email rejection, incorrect password rejection, sign-out revocation and subsequent sign-in. The earlier integration-test account and its sessions were subsequently removed. This review used validation-only API calls and created no test accounts. Sign-in renders at 390px and 1440px without horizontal overflow. Database credentials belong in the ignored .env.local file.

## Where development resumes

Foundation and tenancy is underway. Accounts can register, sign in, restore a session and sign out. Wedding creation and the first admin membership are the next increment, followed by admin-issued team invitations and function setup. Both account forms provide accessible Show/Hide password controls and password-manager autocomplete. Browser checks at 390px and 1440px confirmed that toggling preserves the entered value and introduces no horizontal overflow. Whitespace-only names are rejected before submission. Password recovery remains pending. The phase exit criteria include cross-wedding isolation, role enforcement and protection of the last active admin.

Later phases cover organizer operations and vendor discovery, guest invitations and RSVPs, email delivery, photos and livestreams, and production readiness. Use the [PRD release strategy](PRD.md#9-six-phase-mvp-release-strategy) for the scope and exit criteria of each phase.

### Account validation and interaction review

New account passwords require 15–128 characters and a zxcvbn strength score of at least 3. The browser and API share the policy and field validation. Names retain the documented 1–120 character limit, must contain a letter, and reject control characters. Email addresses are trimmed and normalized to lowercase. Existing accounts retain their original sign-in credentials.

The review identified and corrected CSRF token replacement across tabs and a shared rate bucket outside Vercel. Self-hosted production must configure TRUSTED_CLIENT_IP_HEADER and have its proxy overwrite that header. Vercel uses its platform client-address header.

Password and identity regression checks cover weak inputs, normalized values, unknown privileged fields and older login credentials. API checks verified CSRF reuse and weak-password rejection without creating accounts. Form entrance and focus transitions respect reduced-motion preferences. Formatting, lint, TypeScript and the production build passed. Three automated validation regression tests passed. Password Show/Hide preserves typed input at 390px and 1440px on both forms, with no horizontal overflow.

### Automated authentication suite — passing

The saved suite includes three validation tests, eight API/database integration tests and five browser tests. The integration suite exercises a production Next.js build on port 3100 against a temporary local MongoDB replica set. Each test clears its temporary account, session and throttle records; the development Atlas database is separate.

API coverage includes normalized identity and Argon2id storage, safe response fields, secure cookie flags, concurrent duplicate registration, generic login failures, session rotation, logout replay, expiry, disabled accounts, CSRF/origin checks, malformed and oversized requests, unknown fields, and source/email throttling. Browser coverage includes registration through homepage navigation, session persistence on refresh, sign-in/out, password visibility, field errors and keyboard focus, reduced motion, and recovery after network failure without duplicate submissions. The browser cases run at 390px and 1440px in Microsoft Edge.

All 16 tests passed on 10 November 2026. Testing exposed and corrected error text being included in name/email accessible labels. Formatting, lint, TypeScript and production build checks accompany the suite. Run `pnpm test` for everything, `pnpm test:unit` for validation or `pnpm test:auth` for API and browser checks. See README for first-run MongoDB and browser setup. Password recovery, wedding membership and cross-tenant tests belong to their upcoming feature increments.

A manual Google Chrome validation pass also exercised empty, malformed, weak, oversized, duplicate and successful account flows, session refresh, incorrect and correct sign-in, password visibility and sign-out. It exposed stale field/general errors and an internal oversized-email message. The shared form now clears affected errors when the user edits an input, and the shared schema returns product-ready email-length copy. Unit and browser regressions cover these corrections at 390px and 1440px.

The authentication review was subsequently closed with four hardening changes. Production management sessions now use the required `__Host-mme_session` cookie with Secure, HttpOnly, SameSite=Lax, Path=/ and no Domain; local HTTP development retains the unprefixed cookie. Registration applies its persistent source limit before password-strength estimation, including invalid-password attempts, then applies the normalized-email limit after validation. Fixed-window registration and login throttles return an exact `Retry-After` value. Finally, the live password hint and submitted schema use the same normalized name and email inputs, so a password related to personal details is never presented as acceptable before submission. The production build and all three unit, eight API/database and five browser tests passed after these changes.
