import Image from "next/image";
export function BrandLockup({ mark = true }: { mark?: boolean }) {
  return (
    <span className="brand-lockup">
      {mark && <Image src="/brand-mark.png" alt="" width={36} height={36} />}
      <span className="brand-wordmark">Make My Event</span>
    </span>
  );
}
