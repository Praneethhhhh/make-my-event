import Link from "next/link";
import LandingDetails from "./landing-details";
import "./landing.css";

const schedule = [
  ["Day 1 • 4:00 PM", "Engagement", "Completed"],
  ["Day 2 • 11:00 AM", "Haldi & Mehendi", "Completed"],
  ["Day 2 • 7:00 PM", "Sangeet Gala", "Up next"],
  ["Day 3 • 4:30 PM", "Sunset Pheras", "Upcoming"],
  ["Day 4 • 8:00 PM", "Royal Reception", "Upcoming"],
];

function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark" aria-hidden="true" />
      Make My Event
    </span>
  );
}

function EventCreationStatus() {
  return (
    <Link className="landing-button primary" href="/register">
      Create an account
    </Link>
  );
}

function GuestInvitation() {
  return (
    <aside
      className="guest-card"

      aria-label="Sample guest invitation"
    >
      <div className="between">
        <Brand />
        <small>Guest Portal</small>
      </div>
      <h3>Dear Rohan &amp; Family</h3>
      <p>You are joyfully invited to celebrate with us.</p>
      {[
        ["Sangeet Gala", "Tonight • Jagmandir Island"],
        ["Sunset Pheras", "Tomorrow • Zenana Mahal"],
      ].map(([name, location]) => (
        <div className="guest-function between" key={name}>
          <div>
            <strong>{name}</strong>
            <small>{location}</small>
          </div>
          <span className="badge">Attending</span>
        </div>
      ))}
      <div className="between guest-foot">
        <span>↗ Venue Directions</span>
        <small>Party of 2</small>
      </div>
    </aside>
  );
}

function WeddingPreview() {
  return (
    <section
      className="wedding-preview"
      id="preview"
      aria-label="Sample wedding workspace"
    >
      <div className="workspace-card">
        <div className="preview-header between">
          <div>
            <div className="celebration-title">
              <h2>Pavithra &amp; Manish&apos;s Celebration</h2>
              <span className="badge">Active Itinerary</span>
            </div>
            <ul className="metadata">
              <li>Feb 18–21, 2027</li>
              <li>Udaipur Palace, Rajasthan</li>
              <li>{schedule.length} functions scheduled</li>
            </ul>
          </div>
          <div className="sync">
            <small>Sample wedding</small>
            <b>AM</b>
          </div>
        </div>
        <dl className="metrics">
          <div>
            <dt>Next Function</dt>
            <dd>Sangeet Gala</dd>
            <dd className="note accent">Tonight, 7:00 PM IST</dd>
          </div>
          <div>
            <dt>Sangeet attendance</dt>
            <dd>
              195 <small>people attending</small>
            </dd>
            <dd>
              <span className="note">12 invitations awaiting a reply</span>
            </dd>
          </div>
          <div>
            <dt>Actual expenses paid</dt>
            <dd>₹14,50,000</dd>
            <dd className="note">Includes 8 vendor advances</dd>
          </div>
          <div>
            <dt>Wedding tasks</dt>
            <dd>3 Pending</dd>
            <dd className="note accent">Sound Check &amp; Floral Sign-off</dd>
          </div>
        </dl>
        <div className="between schedule-heading">
          <h3>Wedding schedule</h3>
          <small>All times in IST</small>
        </div>
        <ol className="schedule">
          {schedule.map(([time, name, status]) => (
            <li
              key={name}
              className={status === "Up next" ? "active-cue" : undefined}
            >
              <small>{time}</small>
              <strong>{name}</strong>
              <small>{status}</small>
            </li>
          ))}
        </ol>
      </div>
      <GuestInvitation />
    </section>
  );
}

export default function HomePage() {
  return (
    <div className="landing">
      <header className="masthead">
        <div className="masthead-inner">
          <Brand />
          <nav aria-label="Main navigation">
            <a href="#features">Features</a>
            <a href="#how-it-works">How It Works</a>
            <a href="#guest-experience">Guest Experience</a>
            <Link href="/sign-in">Sign In</Link>
          </nav>
          <EventCreationStatus />
        </div>
      </header>
      <main>
        <section className="hero" aria-labelledby="hero-title">
          <p className="eyebrow">For families planning a wedding</p>
          <h1 id="hero-title">One place to plan, organize and celebrate.</h1>
          <p className="intro">
            Plan your wedding with your family. Share the schedule, collect
            RSVPs, and keep track of tasks and payments together.
          </p>
          <div className="hero-actions">
            <EventCreationStatus />
            <a className="landing-button secondary" href="#features">
              Explore Features
            </a>
          </div>
          <p className="reassurance">
            <span aria-hidden="true">✓</span> Simple for organizers. Effortless
            for guests.
          </p>
        </section>
        <WeddingPreview />
        <LandingDetails />
        <section className="closing">
          <h2>Make room for the moments that matter.</h2>
          <p>Bring everyone planning your wedding together.</p>
          <EventCreationStatus />
        </section>
      </main>
      <footer className="landing-footer">
        <Brand />
        <a href="#features">Features</a>
        <a href="#how-it-works">How It Works</a>
        <a href="#guest-experience">Guest Experience</a>
      </footer>
    </div>
  );
}
