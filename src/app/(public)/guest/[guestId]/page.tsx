import { GuestPage } from "@/modules/guests/guest-page";
export default async function Page({
  params,
}: {
  params: Promise<{ guestId: string }>;
}) {
  const { guestId } = await params;
  return <GuestPage id={guestId} />;
}
