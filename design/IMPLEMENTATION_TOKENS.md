# Make My Event — Canonical Implementation Tokens

**Status:** Approved visual direction consolidated for implementation. The original Stitch exports in `design/` remain source references. This file governs application styling when their generated CSS or prose disagree.

## Brand and usage

Make My Event serves individuals and families organizing their own celebrations. Use the existing custom, four-part connected-moments symbol shown in `design/logo/screen.png`; do not replace it with a generic icon or redesign it during scaffolding. Obtain or prepare a production-ready transparent/vector asset in a separate visual implementation task. The reference screenshot itself is not a final transparent web logo.

The interface combines a calm editorial welcome with dense, legible operational work. All admins and organizers of one wedding see the same operational and financial records. UI copy says *actual expenses*, *payments* and *outstanding balances*, not budgets. Live Google Places results may show permitted ratings with attribution; saved internal vendor records must not retain Google ratings or reviews.

## Semantic colors

| Token | Value | Usage |
|---|---|---|
| `--color-canvas` | `#F7F5F0` | Marketing and management canvas, warm ivory |
| `--color-surface` | `#FFFFFF` | Cards, forms, dialogs and work areas |
| `--color-surface-muted` | `#DFE4DC` | Inset groups and quiet status backgrounds |
| `--color-text` | `#202A29` | Primary text, charcoal |
| `--color-text-muted` | `#5A6664` | Secondary text and metadata |
| `--color-primary` | `#28594F` | Main actions, focus and active navigation |
| `--color-primary-hover` | `#1E433B` | Main action hover |
| `--color-accent` | `#B98265` | Restrained copper accent |
| `--color-accent-text` | `#825339` | Deeper copper for small text on ivory |
| `--color-border` | `#E6E4DC` | Fine dividers and card borders |
| `--color-border-strong` | `#D5D3CB` | Structural dividers and controls |
| `--color-success` | `#2D7A5D` | Confirmed or successful state |
| `--color-warning` | `#C88228` | Pending or attention state |
| `--color-danger` | `#B53D35` | Errors and destructive actions |

These values consolidate the warm ivory/forest/copper prose and screenshots. The mint `#F1FCFA` and `#0B4138` values in generated Stitch frontmatter and CDN configuration are reference-export discrepancies, not a second application palette. Use the deeper copper token for small text; check contrast in each actual component context.

## Typography and spacing

- `Manrope` is the default UI font for navigation, forms, tables, controls and body copy. Use tabular numerals for dates, counts and money.
- `Newsreader` is reserved for hero titles, invitation titles and selected large section headings. Never use it for dense data or inputs.
- Type scale: display 48/56 desktop and 36/44 mobile; section heading 32/40 desktop and 28/36 mobile; subsection 24/32; body 16/24; compact body 14/20; label 12/16. Font size/line-height pairs are in pixels.
- Spacing follows an 8px rhythm: `4`, `8`, `16`, `24`, `32`, `40`, `48`. Standard page margin is 32px desktop, 24px tablet and 16px mobile. Main management content has a 1440px maximum width.
- Control radius: 8px. Card and panel radius: 12px. Large feature panel radius: 16px. Pills and circular avatar treatments use full rounding.
- Use a 1px border plus subtle ambient shadow for cards; avoid heavy gradients and decorative shadows. Provide visible keyboard focus, responsive layouts and meaningful empty/error states.

## Core component guidance

Function-specific accents use a controlled palette: Forest `#28594F`, Copper `#B98265`, Marigold `#C18B2D`, Rose `#AE6473`, Plum `#80618D` and Slate `#607D8B`. These decorate only the function card’s top border and small title marker; surfaces remain white and status text retains its semantic styling. The required selector uses named radio swatches, a selected check indicator and visible keyboard focus, with no default on a new function. The implementation palette lives in `src/modules/functions/function-colors.ts` and does not replace brand or status tokens.

- Primary button: forest background, white text, Manrope semibold, 8px radius; hover uses `--color-primary-hover`.
- Secondary button: white surface, charcoal text, strong border.
- Input: white surface, fine border, charcoal text, forest focus ring.
- Work card: white surface, fine border, 12px radius, compact spacing.
- Marketing and invitation sections may use more whitespace and Newsreader display text; management views favor Manrope and clear data hierarchy.
- Status labels must use text as well as color. Do not label a provider-accepted email as delivered.

The scaffold implements these semantic CSS custom properties in `src/styles/tokens.css`. Tailwind utility use should reference the same tokens. Do not load Tailwind from a CDN in production.
