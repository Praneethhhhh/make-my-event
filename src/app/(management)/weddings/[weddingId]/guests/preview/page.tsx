import { InvitationPreview } from "@/modules/guests/invitation-preview";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ recipient?: string }>;
}) {
  const { recipient } = await searchParams;
  return <InvitationPreview {...(recipient ? { recipient } : {})} />;
}
