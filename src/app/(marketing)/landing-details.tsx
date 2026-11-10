const challenges = [
  [
    "☑",
    "Tasks across family chats",
    "Keep each job, its owner and its due date together, from the sound check to the final flower delivery.",
  ],
  [
    "✉",
    "Invitations awaiting a reply",
    "See which families have replied to each function and how many people are coming.",
  ],
  [
    "₹",
    "Part payments and advances",
    "See what you have paid each vendor and what remains due before the wedding.",
  ],
  [
    "◷",
    "Changing function schedules",
    "Give invited guests one place to find the latest time, venue and dress code.",
  ],
];

const features = [
  {
    title: "Wedding functions",
    copy: "Give each ceremony its own schedule, venue and guest list.",
    rows: [
      ["Haldi & Mehendi", "Courtyard East · 11:00 AM"],
      ["Sangeet Gala", "Jagmandir Island · 7:00 PM"],
    ],
  },
  {
    title: "Shared tasks",
    copy: "Give every family member on the organizing team a clear next step.",
    rows: [
      ["Sound check", "Kabir · To do"],
      ["Floral arrangements", "Meera · In progress"],
    ],
  },
  {
    title: "Invitations & RSVPs",
    copy: "Follow each family’s reply for the Sangeet.",
    rows: [
      ["Kabir & Priya Sen", "Accepted · 2 people"],
      ["Ananya Roy", "Pending"],
    ],
  },
  {
    title: "Actual expenses",
    copy: "Track vendor charges, partial payments and outstanding balances.",
    rows: [
      ["Floral decorations", "₹5,00,000 agreed"],
      ["Advance paid", "₹3,50,000"],
      ["Balance due", "₹1,50,000"],
    ],
  },
  {
    title: "Vendor directory",
    copy: "Keep contacts and responsibilities close to the functions they support.",
    rows: [
      ["Royal Decorators", "Flowers · Haldi & Mehendi"],
      ["Heritage Sound & Light", "Sound · Sangeet Gala"],
    ],
  },
];

const privacy = [
  [
    "Who can open a guest invitation?",
    "Each family receives a private link. Organizers can revoke the link if it needs to be replaced.",
  ],
  [
    "Which functions can guests see?",
    "Guests see the functions on their invitation. They can reply separately to each one and update their headcount until its RSVP deadline.",
  ],
  [
    "What does the organizing team share?",
    "Admins and organizers in the same wedding share tasks, guest records and finances. Only admins can invite team members or change their roles.",
  ],
  [
    "What can vendors see?",
    "A vendor’s private link shows their own assignments, function details and payment status.",
  ],
];

export default function LandingDetails() {
  return (
    <>
      <section className="landing-band muted">
        <div className="content-wrap">
          <h2>
            Big celebrations. Too many moving parts.
            <br />
            One simpler way.
          </h2>
          <div className="challenge-grid">
            {challenges.map(([icon, title, copy]) => (
              <article className="paper" key={title}>
                <span aria-hidden="true" className="challenge-icon">
                  {icon}
                </span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section id="features" className="landing-band">
        <div className="content-wrap">
          <h2 className="center-title">
            Everything important, thoughtfully organized.
          </h2>
          <div className="feature-grid">
            {features.map(({ title, copy, rows }) => (
              <article key={title} className="paper">
                <h3>{title}</h3>
                <p>{copy}</p>
                <dl className="feature-sample">
                  {rows.map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section id="guest-experience" className="landing-band muted">
        <div className="content-wrap invitation-layout">
          <div>
            <h2>
              A personal invitation.
              <br />A beautiful experience.
            </h2>
            <p>
              One private link brings each family to the functions they’re
              invited to.
            </p>
            <ul className="guest-benefits">
              <li>Reply to each invitation</li>
              <li>Check the dress code</li>
              <li>Find venue directions</li>
              <li>View function photos</li>
            </ul>
          </div>
          <article className="invitation-paper">
            <div className="invitation-letter">
              <span className="brand-mark" aria-hidden="true" />
              <small>Wedding invitation</small>
              <h3>The Sen Family</h3>
              <p>Aarav &amp; Meera’s celebration</p>
            </div>
            <div className="invitation-event">
              <small>Tonight · 7:00 PM IST</small>
              <strong>Sangeet Gala</strong>
              <p>Jagmandir Island, Udaipur</p>
              <p>Dress code · Emerald &amp; copper</p>
              <span className="badge">Attending · 2 people</span>
            </div>
          </article>
        </div>
      </section>
      <section id="how-it-works" className="landing-band">
        <div className="content-wrap">
          <h2 className="center-title">
            From the first plan to the final toast.
          </h2>
          <ol className="step-grid">
            {[
              [
                "Create & schedule",
                "Add your wedding dates, invite your organizing team and set up each function.",
              ],
              [
                "Coordinate & track",
                "Assign tasks, record vendor advances and see what’s still due.",
              ],
              [
                "Invite & celebrate",
                "Send private invitations, collect replies and share photos from each function.",
              ],
            ].map(([title, copy], i) => (
              <li className="paper" key={title}>
                <span className="step-number">0{i + 1}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <section className="landing-band muted">
        <div className="privacy-wrap">
          <h2 className="center-title">
            Thoughtful experiences. Private by design.
          </h2>
          {privacy.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
