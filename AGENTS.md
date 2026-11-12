# Make My Event development guidance

## Resuming work and recording progress

- Read `docs/PROJECT_STATUS.md` when resuming development. When a major feature or milestone is added or materially changes, update its entry in the same change. Record what works, how it was verified, and any outstanding work.
- Deliver one reviewable user action at a time. For example, treat signing in, creating a wedding and inviting another organizer as separate increments. Follow the phase order in the PRD when selecting the next feature.
- Give each major feature a status, a short description of the user-visible behavior, verification evidence and remaining dependencies. Update an existing entry when its behavior changes. Distinguish static previews, working integrations and features awaiting review so the next contributor can pick up at the right point.

## Design and source documents

- Use the Stitch MCP server for UI design work. Follow `design/IMPLEMENTATION_TOKENS.md` when translating Stitch designs into application styles.

- Read `docs/PRD.md`, `docs/System_Design.md`, `docs/Database_Design.md`, `docs/API_Design.md`, and `design/IMPLEMENTATION_TOKENS.md` before changing the affected area. Product behavior follows PRD; architecture follows System Design; stored data and collection names follow Database Design; HTTP contracts follow API Design; visual tokens follow the implementation token document.
- Use Stitch for layout and composition. Write copy for families planning their own wedding and check sample data against the product rules. For example, a family invitation can represent several attendees, so label recipient counts and headcounts explicitly.
- Review responsive UI through its actual route at desktop and mobile widths. Check wrapping, horizontal overflow, keyboard focus and the destinations of navigation links. Record the sizes and checks actually exercised.

## Architecture and access

- Keep one Next.js App Router, Node.js, TypeScript modular monolith. Place REST handlers in `src/app/api/v1`; put feature models, validation, repositories, services, DTOs and feature tests together under `src/modules/<feature>`. Add shared server code only when used.
- A wedding is a tenant. Derive `weddingId` from a validated server-side management membership or narrow guest/vendor capability. Scope every wedding-owned query and mutation accordingly; verify referenced records belong to the same wedding. Never trust a client-supplied ID as authority.
- Management accounts may have multiple wedding memberships, with independent roles and explicit per-tab wedding selection. Follow `docs/MULTI_WEDDING_AND_INVITATION_CODES_PLAN.md` and current PROJECT_STATUS evidence. Tenant-owned management requests require X-Wedding-Id, validated against that exact active membership/wedding. Never select a tenant using the first membership, treat a client ID as authority or let one tab's switch retarget another tab's writes. Only that wedding's admins manage membership, preserving its final active admin; removing membership must not log the account out of unrelated weddings. Serialize critical mutations with membership changes.
- Management invitations support manual generation without Resend and optional email. Only a validated selected-wedding admin may explicitly reveal/copy an active recipient-bound code; ordinary responses, logs and outbox rows remain secret-free. Retain encrypted code through its active lifetime, including after email acceptance, and clear it on consume/revoke/reissue/expiry cleanup. Preserve existing records and use the guarded backup/migration script for legacy indexes/ciphertext; never reintroduce the single-active-user index or regenerate unrecoverable codes silently.
- Guests and vendors have no accounts. Revocable private links grant narrow access. Guest function eligibility is separate from historical RSVP status. Keep tokens and signed URLs out of logs, outbox rows and ordinary responses.
- Finance tracks actual paid expenses, vendor charges, partial payments and outstanding balances; no budgeting. Validated photos publish without human approval. Google Places discovery results are live; persist permitted place IDs and organizer-maintained vendor data only.

## Implementation and verification

- Follow the user’s focused-testing preference: add meaningful tests alongside each feature and run only the tests affected by the change during normal development. Do not defer all test writing until the end, and do not run the entire application suite automatically after every feature, small edit or fix.
- For small visual changes, use focused browser checks. For authentication, tenant access, security or shared business-logic changes, broaden checks to the affected consumers as needed. Reserve full-suite runs for major milestones, merge/release checkpoints or demonstrated wider regression risk; briefly state why a broader run is needed. Avoid repeating passing checks unless subsequent changes or failures justify it.
- Record what was actually verified and any deferred coverage in `docs/PROJECT_STATUS.md`. Documentation-only updates need only focused document/format checks, not application tests or builds.
- Use strict TypeScript, `@/*` aliases, ESLint and Prettier. Name feature folders and source files in kebab case, with Next.js reserved filenames unchanged. Validate untrusted input at boundaries, return safe DTOs and stable error codes, and keep business rules in services.
- Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck` and `pnpm build` for scaffold changes. Add meaningful tenant, role and capability tests with the relevant feature phase. Preserve existing docs, design exports and Git history; do not commit secrets.
- Before using a Next.js API, read the relevant version-matched guide under `node_modules/next/dist/docs/`. The project maintains this file directly; `agentRules: false` prevents development runs from rewriting it.

- Include standard form interactions as part of feature delivery, including accessible password visibility controls, autocomplete, validation feedback, loading states and prevention of duplicate submissions. Verify these interactions during review.
