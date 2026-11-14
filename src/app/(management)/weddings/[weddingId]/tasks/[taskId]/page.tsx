import { OperationsPage } from "@/modules/operations/operations-page";
import { notFound } from "next/navigation";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ taskId: string }>;
  searchParams: Promise<{ commentId?: string }>;
}) {
  const { taskId } = await params;
  if (!/^[a-f0-9]{24}$/.test(taskId)) notFound();
  const { commentId } = await searchParams;
  if (commentId && !/^[a-f0-9]{24}$/.test(commentId)) notFound();
  return (
    <OperationsPage
      area="tasks"
      taskId={taskId}
      {...(commentId ? { commentId } : {})}
    />
  );
}
