# Phase 2 design references

**14 November 2026 product decision:** Vendors have no application access: no portal, private URLs, capability sessions, self-service task completion or vendor/photographer uploads. Administrators and organizers maintain vendor contacts, responsibilities, task status, charges and payments internally. Guest invitation access is unchanged. Google Places discovery remains deferred. Any earlier design exports or historical test notes describing vendor access are superseded.


Generated through Stitch on 13 November 2026 in project `2696754814529935110` before translating the UI. Initial generation session `1062395014955071881` supplied Tasks & Operations, Overview Dashboard, Notification Center & Popover and Manual Vendors Directory & Profile. A subsequent generation supplied the dedicated finance ledger.

- Tasks/List/Kanban/detail: [Stitch screen](https://stitch.google.com/projects/2696754814529935110?node-id=53fed24d31564e49b9bfafa809861e3b). Reference `tasks.png` and `tasks.html` downloaded and visually inspected.
- Finance: [Stitch screen](https://stitch.google.com/projects/2696754814529935110?node-id=22fc319dd67d4943884cd2e51a55c39c). Reference `finance.png` and `finance.html` downloaded and visually inspected.
- Dashboard: [Stitch screen](https://stitch.google.com/projects/2696754814529935110?node-id=7f101ab1c57b444388c9569ec8dcc05a).
- Notifications: [Stitch screen](https://stitch.google.com/projects/2696754814529935110?node-id=e5c90f604a2d41da81fc88c12247d1a3).
- Manual vendors: [Stitch screen](https://stitch.google.com/projects/2696754814529935110?node-id=70ce3c67a9714f9788864c0fdc00af47).

All five generated reference screenshots were visually inspected. Companion HTML and PNG files are retained here; prototype controls and invented sample capabilities are design reference only.

Implementation uses the canonical ivory/forest/copper tokens and existing grouped account menu. Generated sample copy is not product authority: no SMS, cue broadcasting, stage management, attachments, approval/signature workflow, fabricated verification, budget totals, download buttons or fake live-sync indicators. Use LOW/NORMAL/HIGH priorities and TODO/IN_PROGRESS/COMPLETED statuses. Mention notifications are in-app only. Bell opens unread notifications with All history. Vendor records are manual; no discovery calls, keys or billing. Vendor portal access was removed on 14 November. Preserved exports are historical references only; no portal controls may be implemented from them. Actual application records replace all Stitch sample metrics. Mobile columns stack and controls wrap; avoid drag-only Kanban interaction.
