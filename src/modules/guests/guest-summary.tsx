"use client";
import { UiIcon } from "@/modules/experience/ui-icon";
import { functionColor } from "@/modules/functions/function-colors";
import type { GuestSummary } from "./guest-types";
import "./guests.css";
export function GuestResponses({
  data,
  choose,
}: {
  data: GuestSummary;
  choose?: (id: string) => void;
}) {
  return (
    <section className="guest-summary" aria-label="Guest responses by function">
      <header>
        <h2>Responses by function</h2>
        <span>
          {data.totalRecipients} invitation{" "}
          {data.totalRecipients === 1 ? "recipient" : "recipients"}
        </span>
      </header>
      {data.functions.map((f) => (
        <div className="guest-summary-row" key={f.id}>
          <strong style={{ borderLeftColor: functionColor(f.color).hex }}>
            {f.name}
          </strong>
          <dl>
            <div>
              <dt>Invited</dt>
              <dd>{f.invited}</dd>
            </div>
            <div>
              <dt>Accepted</dt>
              <dd>{f.accepted}</dd>
            </div>
            <div>
              <dt>Declined</dt>
              <dd>{f.declined}</dd>
            </div>
            <div>
              <dt>Pending</dt>
              <dd>{f.pending}</dd>
            </div>
            <div className="guest-people">
              <dt>People attending</dt>
              <dd>{f.people}</dd>
            </div>
          </dl>
          {choose && (
            <button className="guest-text-button" onClick={() => choose(f.id)}>
              View guests <UiIcon name="arrow-up-right" />
            </button>
          )}
        </div>
      ))}
      {!data.functions.length && (
        <p className="guest-summary-empty">
          Add a function to see guest responses here.
        </p>
      )}
    </section>
  );
}
