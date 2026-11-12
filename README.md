# Make My Event

Make My Event is a responsive wedding and event organizer for individuals and families. The application includes authentication, multiple wedding memberships, wedding setup/details, functions and organizing-team invitations by manual code or optional email. See [project status](docs/PROJECT_STATUS.md) for implemented behavior and verification, and [the PRD](docs/PRD.md) for the six-phase product scope.

After sign-in, open `/weddings` to create, join or select a wedding. Management pages use `/weddings/{weddingId}/...`; role/access checks use that exact wedding. Team admins can generate a manual invitation without Resend setup, reveal/copy its active code and share it with the intended recipient. Joining is available even when the account belongs to other weddings. See [the feature contract and migration plan](docs/MULTI_WEDDING_AND_INVITATION_CODES_PLAN.md).

For an existing pre-multi-wedding database, stop old app writers first and run `node scripts/migrate-multi-wedding.mjs` to inspect, then `node scripts/migrate-multi-wedding.mjs --apply` for the guarded migration before restarting the new version. It creates an ignored private EJSON/gzip snapshot in `.local-backups/`, preserves records, removes only the recognized old unique active-user index and migrates recoverable invitation ciphertext. Keep the invitation encryption secret stable. Never commit/share backups. After multiple memberships exist, do not roll back to the old index/app without deliberate reconciliation. Manual invitation mode needs `INVITATION_CODE_SECRET`, but no Resend credentials or verified domain; actual email still requires a valid Resend sender.

## Local setup

Use Node.js 24 and pnpm 10.11.0. From this existing repository:

```powershell
node --version
pnpm --version
pnpm install
pnpm dev
```

Open the URL printed by Next.js (normally `http://localhost:3000`). The scaffold homepage needs no environment variables or external service accounts. `.env.example` will gain documented placeholders as integrations are implemented; put real values in an ignored local `.env.local` file.

Local development uses Webpack (`next dev --webpack`) to avoid repeated Turbopack rebuilds/reloads observed on the Windows G: workspace. Production builds retain the existing `pnpm build` command.

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

The public landing page and management account registration, sign-in, session restoration and sign-out are implemented. Wedding management, guests, finance, vendors, email and media remain future increments.

## Authentication tests

Run `pnpm test` to run the validation tests, build the app, and execute the API and browser suite. Use `pnpm test:unit` for validation alone or `pnpm test:auth` for the built application tests.

The authentication suite starts its own Next.js production server on port 3100 and a temporary local MongoDB replica set. It overrides the application's database URI for that server. Test fixtures clear only the temporary database's account, session and rate-limit records before and after each test.

The first run downloads a MongoDB binary and requires network access. Browser tests use installed Microsoft Edge by default. To use Playwright Chromium, run `pnpm exec playwright install chromium` and set `PLAYWRIGHT_CHANNEL=chromium`. Test configuration and scenarios live in `playwright.config.ts` and `src/modules/auth/tests/`.

If automatic MongoDB download is interrupted, you can set `MONGOMS_SYSTEM_BINARY` to a compatible local `mongod` executable before running the suite. The tests pin MongoDB 8.2.6 for reproducibility. Browser traces, screenshots and video recording are disabled to keep entered credentials out of those artifacts.
