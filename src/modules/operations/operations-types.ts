export type Task = {
  id: string;
  revision: number;
  title: string;
  description: string;
  functionId: string | null;
  assigneeType: "USER" | "VENDOR" | "UNASSIGNED";
  assigneeUserId: string | null;
  assigneeVendorId: string | null;
  vendorId?: string | null;
  ownerName?: string;
  ownerActive?: boolean;
  functionName?: string;
  vendorName?: string;
  mentions?: {
    userId: string;
    field: "title" | "description";
    start: number;
    end: number;
  }[];
  status: "TODO" | "IN_PROGRESS" | "COMPLETED";
  priority: "LOW" | "NORMAL" | "HIGH";
  dueAt: string | null;
};
export type Vendor = {
  id: string;
  revision: number;
  name: string;
  category: string;
  phones: string[];
  email?: string;
  color?: string;
  internalNotes: string;
  status: "ACTIVE" | "INACTIVE";
};
export type Financial = {
  id: string;
  revision: number;
  description?: string;
  category?: string;
  amountPaise: number;
  vendorId?: string;
  chargeId?: string;
  functionId?: string | null;
  paidAt?: string;
  status: string;
  notes?: string;
  voidReason?: string;
};
export type Notice = {
  id: string;
  taskId: string;
  commentId: string | null;
  kind?: "ASSIGNED" | "TASK_MENTION" | "ASSIGNED_MENTION";
  actorName: string;
  taskTitle: string;
  createdAt: string;
  readAt: string | null;
  available: boolean;
  excerpt: string;
};
export type Comment = {
  id: string;
  revision: number;
  authorUserId: string;
  authorName: string;
  body: string;
  createdAt: string;
  mentionedUserIds: string[];
  mentionNames?: string[];
  mentionRanges?: { userId: string; start: number; end: number }[];
};
export type Overview = {
  userId: string;
  role: "ADMIN" | "ORGANIZER";
  timeZone: string;
  title: string;
  displayName: string;
};
export const money = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    value / 100,
  );
export const statuses = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
} as const;
