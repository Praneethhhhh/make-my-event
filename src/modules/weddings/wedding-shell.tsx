import Image from "next/image";

export function WeddingHeader({ displayName }: { displayName: string }) {
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (
    <header className="wedding-header">
      <div className="wedding-brand">
        <Image src="/brand-mark.png" alt="" width={36} height={36} />
        <div>
          <strong>MAKE MY EVENT</strong>
          <span>FAMILY PLANNER</span>
        </div>
      </div>
      <div
        className="wedding-account"
        aria-label={`Signed in as ${displayName}`}
      >
        <span aria-hidden="true">{initials || "ME"}</span>
        <div>
          <strong>{displayName}</strong>
          <small>Family organizer</small>
        </div>
      </div>
    </header>
  );
}
