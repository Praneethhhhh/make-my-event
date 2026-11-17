import { ThemeControl } from "@/modules/experience/theme-control";
import { UiIcon } from "@/modules/experience/ui-icon";
import { BrandLockup } from "@/modules/experience/brand-lockup";
import Image from "next/image";
import Link from "next/link";
import "./landing.css";
import { accountNavigation } from "@/modules/auth/account-navigation";
const ceremonies = [
  {
    day: "18",
    month: "FEB",
    name: "Haldi",
    time: "10:00 AM",
    place: "The courtyard",
    color: "#c18b2d",
  },
  {
    day: "19",
    month: "FEB",
    name: "Sangeet",
    time: "7:00 PM",
    place: "The garden",
    color: "#ae6473",
  },
  {
    day: "20",
    month: "FEB",
    name: "Wedding",
    time: "9:30 AM",
    place: "The mandap",
    color: "#28594f",
  },
];
export default async function HomePage() {
  const navigation = await accountNavigation();
  const cta =
    navigation.state === "guest" ? "Create your wedding" : navigation.label;
  return (
    <div className="landing">
      <header
        className={[
          "masthead",
          navigation.state === "guest" ? "" : "masthead-signed-in",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <Link
          href="/weddings"
          className="landing-brand"
          aria-label="Make My Event — Your weddings"
        >
          <BrandLockup />
        </Link>
        <nav aria-label="Main navigation">
          <a href="#preview">The experience</a>
          <a href="#features">Made for you</a>
        </nav>
        <div className="masthead-account-actions">
          <ThemeControl />
          {navigation.state === "guest" && (
            <Link href="/sign-in" className="masthead-sign-in">
              Sign in
            </Link>
          )}
          <Link className="landing-button primary" href={navigation.href}>
            {cta}
            <UiIcon name="arrow-up-right" />
          </Link>
        </div>
      </header>
      <main>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow">FOR THE MOMENTS THAT MATTER</p>
            <h1 id="hero-title">
              Every moment.
              <br />
              <em>Beautifully</em>
              <br />
              together.
            </h1>
            <p className="intro">
              A shared place for your family to plan the celebration.
            </p>
            <div className="hero-actions">
              <Link className="landing-button primary" href={navigation.href}>
                {cta}
                <UiIcon name="arrow-up-right" />
              </Link>
              <a href="#preview" className="text-link">
                Take a little look <UiIcon name="arrow-down" />
              </a>
            </div>
            <p className="reassurance">
              <UiIcon name="sparkle" /> Your people. Your plans. Your
              celebration.
            </p>
          </div>
          <div className="hero-visual">
            {/* Render the complete hero eagerly without optimizer/decode JavaScript. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="hero-artwork"
              src="/images/celebration-transparent.png"
              alt="Pixel-art couple celebrating beneath a leafy arch with confetti"
              width={1672}
              height={941}
              loading="eager"
              decoding="sync"
              fetchPriority="high"
            />
            <p className="artwork-caption">A little more being present.</p>
          </div>
        </section>
        <section
          id="preview"
          className="experience"
          aria-labelledby="preview-title"
        >
          <div className="experience-copy">
            <p className="eyebrow">ONE BEAUTIFUL SHARED SPACE</p>
            <h2 id="preview-title">
              All the days.
              <br />
              <em>One celebration.</em>
            </h2>
            <p>
              From the first Haldi to the final goodbye. Keep the times, places
              and people together.
            </p>
            <a href="#features" className="text-link">
              Thoughtfully simple <span aria-hidden="true">↘</span>
            </a>
            <figure className="palace-scene">
              <Image
                src="/images/palace-celebration.jpg"
                alt="A detailed voxel-art palace courtyard filled with a wedding celebration"
                width={1200}
                height={896}
                sizes="(max-width: 760px) 100vw, 40vw"
              />
            </figure>
          </div>
          <div
            className="sample-workspace"
            aria-label="Sample wedding workspace"
          >
            <div className="sample-top">
              <span className="sample-badge">ILLUSTRATIVE PREVIEW</span>
              <UiIcon name="sparkle" />
            </div>
            <h3>Pavithra &amp; Manish</h3>
            <p>18–21 February 2027 · Asia/Kolkata</p>
            <div className="sample-divider" />
            <div className="sample-timeline">
              {ceremonies.map((item) => (
                <div
                  className="sample-event"
                  key={item.name}
                  style={{ borderLeftColor: item.color }}
                >
                  <div className="sample-date">
                    <strong>{item.day}</strong>
                    <small>{item.month}</small>
                  </div>
                  <div>
                    <h4>{item.name}</h4>
                    <p>{item.place}</p>
                  </div>
                  <time>{item.time}</time>
                </div>
              ))}
            </div>
            <div className="sample-foot">
              <span className="mini-avatars" aria-hidden="true">
                <b>P</b>
                <b>M</b>
                <b>+1</b>
              </span>
              <span>Better, with your people.</span>
              <UiIcon name="arrow-up-right" />
            </div>
          </div>
        </section>
        <section
          className="features"
          id="features"
          aria-labelledby="features-title"
        >
          <p className="eyebrow">LESS TO JUGGLE. MORE TO ENJOY.</p>
          <h2 id="features-title">Made for your kind of together.</h2>
          <div className="feature-grid">
            {[
              [
                "01",
                "The whole celebration",
                "Every function, time and venue. In its own place.",
                "calendar",
              ],
              [
                "02",
                "Your people, together",
                "Invite family organizers. Give everyone the right access.",
                "users",
              ],
              [
                "03",
                "Every detail in place",
                "Directions, dress codes and little notes that matter.",
                "sparkle",
              ],
            ].map(([n, title, copy, icon]) => (
              <article key={n}>
                <div className="feature-ornament" aria-hidden="true">
                  <UiIcon
                    name={icon as "calendar" | "users" | "sparkle"}
                    size={30}
                  />
                </div>
                <small>{n}</small>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="closing">
          <div className="closing-copy">
            <p className="eyebrow">LET THE CELEBRATION BEGIN</p>
            <h2>
              Plan with love.
              <br />
              <em>Celebrate with everyone.</em>
            </h2>
            <Link className="landing-button light" href={navigation.href}>
              {cta}
              <UiIcon name="arrow-up-right" />
            </Link>
          </div>
          <div className="closing-artwork">
            <Image
              src="/images/wedding-transparent.png"
              alt="Pixel-art wedding couple beneath a decorated arch"
              width={1376}
              height={768}
              sizes="(max-width: 760px) 100vw, 35vw"
            />
          </div>
        </section>
      </main>
      <footer className="landing-footer">
        <Link href="/weddings" className="landing-brand">
          <BrandLockup />
        </Link>
        <p>A little more together.</p>
        <a href="#hero-title">
          Back to top <UiIcon name="arrow-up" />
        </a>
      </footer>
    </div>
  );
}
