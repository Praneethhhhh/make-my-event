export type GuestFunction = {
  id: string;
  name: string;
  color: string;
  startsAt: string;
  endsAt: string | null;
  venue: {
    name: string;
    address: string;
    city: string;
    state: string;
    mapUrl: string;
    latitude: number | null;
    longitude: number | null;
  };
  invitationId?: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED";
  attendeeCount: number;
  revision: number;
  respondedAt?: string | null;
  deadlineAt: string;
  deadlineOverrideAt?: string | null;
  maxAttendees?: number;
  eligibilityStatus?: string;
};
export type Invitation = {
  guestId: string | null;
  displayName: string;
  personalMessage: string;
  coupleNames: { first: string; second: string };
  title: string;
  timeZone: string;
  startsOn: string;
  endsOn: string;
  serverTime: string;
  functions: GuestFunction[];
};
export type Guest = {
  id: string;
  displayName: string;
  personalMessage: string;
  revision: number;
  status: string;
  linkActive: boolean;
  functions: GuestFunction[];
};
export type GuestSummary = {
  totalRecipients: number;
  functions: {
    id: string;
    name: string;
    color: string;
    invited: number;
    accepted: number;
    declined: number;
    pending: number;
    people: number;
  }[];
};

export type GuestManagementContext = Omit<
  Invitation,
  "guestId" | "displayName" | "personalMessage" | "serverTime"
> & { displayName: string };
