---
name: Warm Editorial SaaS
colors:
  surface: '#f1fcfa'
  surface-dim: '#d1dcda'
  surface-bright: '#f1fcfa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#ebf6f4'
  surface-container: '#e5f0ee'
  surface-container-high: '#dfeae8'
  surface-container-highest: '#dae5e3'
  on-surface: '#141d1c'
  on-surface-variant: '#404946'
  inverse-surface: '#283231'
  inverse-on-surface: '#e8f3f1'
  outline: '#707976'
  outline-variant: '#c0c8c5'
  surface-tint: '#36675c'
  primary: '#0b4138'
  on-primary: '#ffffff'
  primary-container: '#28594f'
  on-primary-container: '#9bcec1'
  inverse-primary: '#9ed1c4'
  secondary: '#825339'
  on-secondary: '#ffffff'
  secondary-container: '#fdbe9e'
  on-secondary-container: '#794b32'
  tertiary: '#363b36'
  on-tertiary: '#ffffff'
  tertiary-container: '#4d524c'
  on-tertiary-container: '#c0c5bd'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#baeddf'
  primary-fixed-dim: '#9ed1c4'
  on-primary-fixed: '#00201b'
  on-primary-fixed-variant: '#1d4f45'
  secondary-fixed: '#ffdbca'
  secondary-fixed-dim: '#f7b999'
  on-secondary-fixed: '#321201'
  on-secondary-fixed-variant: '#673c24'
  tertiary-fixed: '#dfe4dc'
  tertiary-fixed-dim: '#c3c8c0'
  on-tertiary-fixed: '#181d18'
  on-tertiary-fixed-variant: '#434842'
  background: '#f1fcfa'
  on-background: '#141d1c'
  surface-variant: '#dae5e3'
typography:
  display-lg:
    fontFamily: Newsreader
    fontSize: 48px
    fontWeight: '400'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Newsreader
    fontSize: 36px
    fontWeight: '400'
    lineHeight: 44px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Newsreader
    fontSize: 32px
    fontWeight: '500'
    lineHeight: 40px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Newsreader
    fontSize: 24px
    fontWeight: '500'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Manrope
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.005em
  body-lg:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Manrope
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  label-lg:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Manrope
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Manrope
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  margin: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system balances 70% structured, high-velocity SaaS productivity with 30% bespoke celebration warmth. It is engineered for event planners, luxury hospitality directors, and enterprise experience coordinators who balance complex run-of-show logistics with refined, client-facing presentation.

The aesthetic direction is **Warm Editorial SaaS**:
- Grounded, architectural layout rhythm inspired by high-end physical stationery, event itineraries, and archival binders.
- High-density productivity UI operating over serene, tactile paper-like tones rather than sterile blue-grey software slates.
- Purposeful restraint: celebration is communicated through dignified typography, generous spatial balance, and fine metallic-copper detailing rather than frivolous confetti, gradients, or saturated pastels.

## Colors

The palette relies on high-contrast, organic pigments to evoke tailored craftsmanship while maintaining strict WCAG AAA legibility across complex operational tables and scheduling views.

- **Primary Canvas & Backgrounds**: Warm Ivory (`#F7F5F0`) anchors marketing surfaces, outer frame layouts, and macro dashboard canvas backdrops. Crisp Pure White (`#FFFFFF`) is strictly reserved for interactive cards, work surfaces, data tables, and modal dialogues to retain crisp readability.
- **Primary Brand Accent**: Deep Forest Green (`#28594F`). Used for primary interactive actions, high-priority state indicators, active timeline markers, and brand anchors. Never tint this into pastel, mint, or cyan washes.
- **Secondary Accent**: Muted Copper (`#B98265`). Applied deliberately and sparingly: milestones, VIP designations, status badges, and refined hairline accents.
- **Secondary Surface / Grouping**: Sage Grey (`#DFE4DC`). Deployed for subtle inset panels, segmented control tracks, inactive state containers, and nested schedule blocks.
- **Typography & Form Controls**: Deep Charcoal (`#202A29`) provides high-contrast structural text; Secondary Slate Charcoal (`#5A6664`) supports metadata, table headers, breadcrumbs, and subtle counts.
- **Borders & Dividers**: Hairline Warm Sandstone (`#E6E4DC`) defines structural limits without generating visual noise.

## Typography

The typographic hierarchy pairs humanistic editorial charm with precise, legible technical execution:

- **Editorial Headings (`Newsreader`)**: Reserved exclusively for top-level event titles, executive portfolio metrics, welcome banners, and public-facing proposal documents. It introduces celebration, warmth, and classic hospitality.
- **Operational Interface (`Manrope`)**: Powers all functional UI: complex data grids, budget spreadsheets, timeline gantt charts, badge labels, navigation menus, and form inputs. Manrope's geometric yet approachable letterforms ensure high legibility under dense administrative conditions.
- **Application Rule**: Never mix serifs into operational data cells, form controls, tabs, or modal action buttons. Maintain tabular figures (`font-variant-numeric: tabular-nums`) across all numerical metrics, guest counts, and monetary values.

## Layout & Spacing

The layout operates on a strict 8px horizontal and vertical spatial baseline, ensuring alignment across schedules, calendars, and guest arrangement tables:

- **Grid Discipline**:
  - **Desktop (≥ 1280px)**: 12-column layout, 24px (`1.5rem`) gutters, with a maximum workspace width of 1440px. Outer margins adjust to 32px (`2rem`).
  - **Tablet (768px – 1279px)**: 8-column layout, 16px (`1rem`) gutters, 24px (`1.5rem`) outer margins. Multi-column forms collapse to 2 columns.
  - **Mobile (< 768px)**: 4-column fluid layout, 12px gutters, 16px outer margins. Data tables shift to stacked card views or horizontal swipe drawers.
- **Compositional Balance**:
  - The Warm Ivory canvas acts as the framing negative space around pure white modular tiles.
  - Spacing inside functional cards uses compact paddings (`space-md` to `space-lg`), while macro layout transitions use expanded intervals (`space-xl`) to establish breathing room between logistics views.

## Elevation & Depth

Visual hierarchy uses physical, tactile paper stacking instead of synthetic digital drop shadows:

- **Surface Layering**:
  - **Base Canvas (`#F7F5F0`)**: Lowest level; houses persistent sidebars, top headers, and breadcrumbs.
  - **Work Modules (`#FFFFFF`)**: Elevated via a single crisp outline (`1px solid #E6E4DC`) paired with an ultra-soft ambient contact shadow: `box-shadow: 0 1px 3px rgba(32, 42, 41, 0.04), 0 4px 12px rgba(32, 42, 41, 0.02)`.
  - **Floating Tooling & Overlays**: Modals, dropdown pickers, and run-of-show flyout inspectors use: `box-shadow: 0 12px 32px -4px rgba(32, 42, 41, 0.08), 0 4px 12px -2px rgba(32, 42, 41, 0.04)`, bordered by `#E6E4DC`.
- **Inset Wells**: Sub-groupings, filter bar tracks, and calendar non-working hours use flat `#DFE4DC` fills with no internal shadow, creating clear recessed zones.

## Shapes

The shape system is balanced between sharp executive precision and warm hospitality:

- Standard elements (buttons, inputs, status badges) use a base radius of 10px (`rounded-md`).
- Primary content containers, dashboard cards, modal viewports, and timeline panels utilize 14px (`rounded-lg`), creating an approachable silhouette while preserving layout density.
- Circular treatment (`rounded-full`) is reserved strictly for avatar portraits, user presence status dots, and icon-only secondary utilities.

## Components

### Buttons
- **Primary**: Background `#28594F`, text `#FFFFFF`, 10px border radius, font `Manrope` 14px weight 600. Hover state: `#1E433B`.
- **Secondary / Copper Milestone**: Background `#FFFFFF`, border `1px solid #B98265`, text `#B98265`. Hover state: `#B98265` with `#FFFFFF` text. Used for high-value actions (e.g., "Publish Itinerary", "Confirm VIP").
- **Tertiary / Subdued**: Background transparent, text `#5A6664`, hover background `#DFE4DC` (30% opacity), hover text `#202A29`.

### Chips & Badges
- **Status (Confirmed / On Track)**: Background `rgba(40, 89, 79, 0.1)`, text `#28594F`, border `1px solid rgba(40, 89, 79, 0.2)`.
- **Milestone / VIP**: Background `rgba(185, 130, 101, 0.12)`, text `#B98265`, border `1px solid rgba(185, 130, 101, 0.25)`.
- **Pending / Inactive**: Background `#DFE4DC`, text `#5A6664`, border `1px solid transparent`.
- Typography: 11px uppercase `Manrope`, 700 weight, letter spacing `0.04em`, 6px border radius.

### Input Fields & Controls
- **Inputs**: Background `#FFFFFF`, border `1px solid #E6E4DC`, text `#202A29`, placeholder `#5A6664`. Focus state: border `1.5px solid #28594F`, box shadow `0 0 0 3px rgba(40, 89, 79, 0.12)`.
- **Checkboxes & Radios**: 18px size, border `1.5px solid #E6E4DC`. Selected: fill `#28594F` with `#FFFFFF` glyph.

### Cards & Work Surfaces
- Pure White (`#FFFFFF`) containers over Warm Ivory (`#F7F5F0`) background.
- Border `1px solid #E6E4DC`, corner radius 14px.
- Internal headers feature an editorial section title (`Newsreader` 24px) paired with an interface meta action (`Manrope` 12px label).

### Specialized Domain Components
- **Run-of-Show Timelines**: Time indicator track in `#DFE4DC`, completed cues in `#28594F`, critical stage cue cards highlighted with a 3px left border in Muted Copper (`#B98265`).
- **Seating & Vendor Allocation Grids**: Pure white data row cells alternating with hairline `#E6E4DC` borders, with hover highlight in `rgba(223, 228, 220, 0.35)`.