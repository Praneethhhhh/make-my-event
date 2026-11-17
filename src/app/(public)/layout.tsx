import type { ReactNode } from "react";
export const metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
