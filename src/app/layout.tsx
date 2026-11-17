import { themeScript } from "@/modules/experience/theme-script";
import type { Metadata } from "next";
import { Manrope, Newsreader } from "next/font/google";
import "./globals.css";
import { ExperienceMotion } from "@/modules/experience/experience-motion";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });
const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
});

export const metadata: Metadata = {
  title: "Make My Event",
  description: "A thoughtful home for organizing your celebration.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${manrope.variable} ${newsreader.variable}`}
    >
      <head>
        <script
          id="mme-theme-init"
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
      </head>
      <body>
        <ExperienceMotion>{children}</ExperienceMotion>
      </body>
    </html>
  );
}
