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
- One management user has at most one active wedding membership in v1. All admins and organizers within one wedding share operational and financial records. Only admins change membership and roles; preserve the last active admin.
- Guests and vendors have no accounts. Revocable private links grant narrow access. Guest function eligibility is separate from historical RSVP status. Keep tokens and signed URLs out of logs, outbox rows and ordinary responses.
- Finance tracks actual paid expenses, vendor charges, partial payments and outstanding balances; no budgeting. Validated photos publish without human approval. Google Places discovery results are live; persist permitted place IDs and organizer-maintained vendor data only.

## Implementation and verification

- Use strict TypeScript, `@/*` aliases, ESLint and Prettier. Name feature folders and source files in kebab case, with Next.js reserved filenames unchanged. Validate untrusted input at boundaries, return safe DTOs and stable error codes, and keep business rules in services.
- Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck` and `pnpm build` for scaffold changes. Add meaningful tenant, role and capability tests with the relevant feature phase. Preserve existing docs, design exports and Git history; do not commit secrets.
- Before using a Next.js API, read the relevant version-matched guide under `node_modules/next/dist/docs/`. The project maintains this file directly; `agentRules: false` prevents development runs from rewriting it.
