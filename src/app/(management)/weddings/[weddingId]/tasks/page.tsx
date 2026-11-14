import { OperationsPage } from "@/modules/operations/operations-page";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const { scope } = await searchParams;
  const taskScope =
    scope === "open" || scope === "overdue" || scope === "mine"
      ? scope
      : undefined;
  return (
    <OperationsPage
      key={taskScope ?? "all"}
      area="tasks"
      {...(taskScope ? { taskScope } : {})}
    />
  );
}
