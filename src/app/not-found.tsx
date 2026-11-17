import { ThemeControl } from "@/modules/experience/theme-control";
import Link from "next/link";
import { BrandLockup } from "@/modules/experience/brand-lockup";
import { UiIcon } from "@/modules/experience/ui-icon";
export default function NotFound() {
  return (
    <main className="ui-empty-page">
      <div className="public-theme">
        <ThemeControl />
      </div>
      <section className="ui-empty-card">
        <Link href="/weddings" aria-label="Make My Event — Your weddings">
          <BrandLockup />
        </Link>
        <p className="ui-eyebrow">PAGE NOT FOUND</p>
        <h1>This page isn’t here.</h1>
        <p>Return to your weddings to keep planning.</p>
        <Link href="/weddings" className="ui-return">
          <UiIcon name="arrow-left" /> Your weddings
        </Link>
      </section>
    </main>
  );
}
