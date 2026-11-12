import { WeddingScope } from "@/modules/weddings/wedding-scope";
import { notFound } from "next/navigation";
import "@/modules/weddings/wedding.css";
import "@/modules/team/team.css";
export default async function WeddingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ weddingId: string }>;
}) {
  const { weddingId } = await params;
  if (!/^[a-f0-9]{24}$/.test(weddingId)) notFound();
  return (
    <WeddingScope key={weddingId} weddingId={weddingId}>
      {children}
    </WeddingScope>
  );
}
