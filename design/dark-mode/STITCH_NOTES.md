### Make My Event — Dark Mode Desktop Workspace Reference

I have created the desktop dark mode reference screen (**Make My Event — Dark Mode Desktop Workspace Reference**) establishing the design tokens, surface hierarchy, and contrast ratios for the workspace while strictly preserving the established desktop architecture:

---

### 1. Palette & Surface Tokens
- **Canvas Base (`#121a17`)**: Deep desaturated forest/charcoal background providing high perceived depth without harsh pure-black eye fatigue.
- **Raised Panels (`#1b2621`)**: Primary card surfaces and the 224px sidebar, separated by subtle borders (`#35453c`).
- **Elevated Surfaces (`#22312b`)**: Inset wells, table headers, and active card segments.
- **Accessible Typography**: Warm ivory (`#eeeae2`) for headlines and active copy; muted sage (`#b1bdb4`) for body labels; dim sage (`#839287`) for secondary metadata.
- **Accents**: Mint primary (`#9ad5be`) with dark contrast foreground (`#0e241c`), restrained copper (`#d7ad91`), and ceremony border markers (Mehndi: `#e09867`, Sangeet: `#b592c9`, Wedding: `#70b99c`).

---

### 2. Workspace Shell & Header
- **Canonical 72px Header**: Features the original four-part connected floral brand mark with Newsreader title-case wordmark, Pavithra & Manish active wedding indicator, notification bell with unread copper badge, and user avatar.
- **Appearance Chooser**: Integrated in the top-right header displaying **Light**, **Dark** (with clear selected indicator and border), and **System**. A secondary small inline reference shows the same chooser following **System (Auto)**.
- **224px Grouped Sidebar**: Strictly grouped by *Planning* (Dashboard, Functions, Tasks), *People* (Team, Vendors, Guests & RSVPs active with badge 30), and *Management* (Finance, Wedding details), ending with private link status.

---

### 3. Guest Directory & Headcounts
- **Accurate Function Responses**: Highlights 30 invitation recipients (individual/family records) distinct from ceremony headcounts (Mehndi: 28 people, Sangeet: 50 people, Wedding: 42 people).
- **Directory Table**: Clean rows featuring family parties, ceremony tags, response status, and one-click private link copying without automated guest email controls.
- **Recoverable Error Banner**: Discreet warning alerting organizers that background indexing for two family entries is delayed, paired with a direct *"Retry sync"* action (no disruptive loading spinners).
- **Empty / Inactive Function Guidance**: An informative notice pointing to *"Go to Functions"* if an additional ceremony needs to be scheduled before invitation caps can be assigned.

---

### 4. Right-Side "Invite Guest" Editor
- **Readable Form Fields**: High-contrast inputs for recipient name and optional personalized welcome message.
- **Ceremony Limits**: Independent attendee caps per function (*Mehndi: 4, Sangeet: 6, Vedic Wedding: 5*) with ceremony border accent strips.
- **Confidential Private Link Box**: Masked entropy token with quick-copy control.
- **Accessible Touch Boundaries**: 44px minimum action buttons in the drawer footer.
