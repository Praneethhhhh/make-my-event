import { FunctionsPage } from "@/modules/functions/functions-page";
import { TeamPage } from "@/modules/team/team-page";
import { WorkspaceDashboard } from "@/modules/operations/workspace-dashboard";
import { OperationsPage } from "@/modules/operations/operations-page";
import { FinancePage } from "@/modules/operations/finance-page";
import { GuestsPage } from "@/modules/guests/guest-management";
import { WeddingSetup } from "@/modules/weddings/wedding-setup";
import { WeddingClientProvider } from "@/modules/weddings/wedding-scope";

const wedding = {
  id: "example",
  title: "Pavithra & Manish",
  coupleNames: { first: "Pavithra", second: "Manish" },
  startsOn: "2027-02-18",
  endsOn: "2027-02-21",
  timeZone: "Asia/Kolkata",
  revision: 1,
};
const user = { id: "example-admin", displayName: "Kavya" };
const context = {
  ...wedding,
  displayName: user.displayName,
  userId: user.id,
  role: "ADMIN",
};
const haldi = {
  id: "haldi",
  name: "Haldi",
  startsAt: "2027-02-18T04:30:00Z",
  endsAt: null,
  color: "marigold",
  venue: { name: "Family courtyard" },
  revision: 1,
};
const guestResponses = {
  totalRecipients: 1,
  functions: [
    { ...haldi, invited: 1, accepted: 1, declined: 0, pending: 0, people: 3 },
  ],
};
const list = (items: unknown[]) => ({
  items,
  total: items.length,
  nextCursor: null,
});
const task = {
  id: "flowers",
  title: "Confirm Haldi flowers",
  description: "",
  priority: "NORMAL",
  status: "TODO",
  ownerName: "Kavya",
  assigneeType: "USER",
  assigneeUserId: user.id,
  functionId: haldi.id,
  functionName: "Haldi",
};
const records: Record<string, unknown> = {
  "auth/me": { user },
  wedding: { wedding, role: "ADMIN" },
  functions: { functions: [haldi] },
  members: {
    members: [
      { ...user, role: "ADMIN", isYou: true, email: "kavya@example.invalid" },
    ],
  },
  "member-invitations": { invitations: [] },
  operations: context,
  tasks: list([task]),
  vendors: list([
    {
      id: "florist",
      name: "Courtyard Florals",
      category: "Decor",
      phones: [],
      status: "ACTIVE",
      internalNotes: "",
    },
  ]),
  notifications: {
    ...list([
      {
        id: "notice",
        taskId: task.id,
        kind: "ASSIGNED",
        actorName: "Manish",
        taskTitle: task.title,
        createdAt: "2027-02-15T10:00:00Z",
        available: true,
        readAt: null,
        excerpt: "",
      },
    ]),
    unreadCount: 1,
  },
  "guests/context": { ...context, functions: [haldi] },
  "guests/summary": guestResponses,
  guests: list([
    {
      id: "rao-family",
      displayName: "Rao family",
      status: "ACTIVE",
      linkActive: true,
      revision: 1,
      personalMessage: "",
      functions: [
        {
          ...haldi,
          status: "ACCEPTED",
          attendeeCount: 3,
          eligibilityStatus: "ACTIVE",
        },
      ],
    },
  ]),
  "finance/summary": { actualPaid: 0, outstanding: 0 },
  "finance/expenses": list([]),
  "finance/payments": list([]),
};
const previewClient = {
  weddingId: wedding.id,
  readOnlyPreview: true,
  prefix: "/weddings",
  markDirty: () => {},
  markClean: () => {},
  fetch: async (input, init) => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      "https://example.invalid",
    );
    const key = url.pathname.replace(/^\/api\/v1\//, "");
    if ((init?.method ?? "GET") !== "GET" || !(key in records))
      return Response.json(
        { error: { message: "Unavailable in the tour." } },
        { status: 403 },
      );
    if (key === "operations" && url.searchParams.get("view") === "choices")
      return Response.json({ data: list([]) });
    const data =
      key === "operations" && url.searchParams.get("view") === "dashboard"
        ? {
            ...context,
            guestResponses,
            summary: {
              open: 1,
              mine: 1,
              overdue: 0,
              actualPaid: 0,
              outstanding: 0,
              activeVendors: 1,
            },
          }
        : records[key];
    return Response.json({ data });
  },
} satisfies {
  weddingId: string;
  readOnlyPreview: boolean;
  prefix: string;
  markDirty: () => void;
  markClean: () => void;
  fetch: typeof fetch;
};
export default function TourWorkspace({ section }: { section: string }) {
  const screens: Record<string, React.ReactNode> = {
    Dashboard: <WorkspaceDashboard />,
    Functions: <FunctionsPage />,
    Team: <TeamPage />,
    Tasks: <OperationsPage area="tasks" />,
    Notifications: <OperationsPage area="notifications" />,
    Guests: <GuestsPage />,
    Vendors: <OperationsPage area="vendors" />,
    Finance: <FinancePage />,
    "Wedding details": <WeddingSetup editing />,
  };
  return (
    <WeddingClientProvider value={previewClient}>
      <div inert key={section} data-tour-workspace>
        {screens[section]}
      </div>
    </WeddingClientProvider>
  );
}
