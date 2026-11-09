# Make My Event

Make My Event is a responsive wedding and event organizer for individuals and families. This repository currently contains the project design documents and a minimal Next.js application shell. Product features will be developed incrementally across the six phases in [the PRD](docs/PRD.md).

## Local setup

Use Node.js 24 and pnpm 10.11.0. From this existing repository:

```powershell
node --version
pnpm --version
pnpm install
pnpm dev
```

Open the URL printed by Next.js (normally `http://localhost:3000`). The scaffold homepage needs no environment variables or external service accounts. `.env.example` will gain documented placeholders as integrations are implemented; put real values in an ignored local `.env.local` file.

## Checks

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
```

`pnpm format` applies Prettier formatting. Do not commit real secrets or generated build output.

ESLint 9 is temporarily retained because dependencies in the current Next.js lint configuration do not yet consistently declare ESLint 10 support. Upgrade ESLint and its plugins together after peer compatibility is verified; do not force an unsupported major version.

## Architecture and documents

This is one TypeScript Next.js App Router application. Future REST Route Handlers live under `src/app/api/v1`; feature services, Mongoose models, repositories and validation live together under `src/modules/<feature>`. Shared server security, database and provider code is added under `src/server` when required. Client code must never treat a supplied wedding ID as authorization.

Read the documents in this order for decisions: [PRD](docs/PRD.md) for product behavior; [System Design](docs/System_Design.md) for architecture; [Database Design](docs/Database_Design.md) for persistence; [API Design](docs/API_Design.md) for endpoint contracts; and [implementation tokens](design/IMPLEMENTATION_TOKENS.md) for visual styling. The original Stitch files under `design/` are preserved as references.

The homepage is a framework and design-token check, not the full marketing experience. Authentication, wedding management, guests, finance, vendors, email, and media are not implemented yet.
