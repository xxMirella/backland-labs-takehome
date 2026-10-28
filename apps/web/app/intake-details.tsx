"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  RISK_TYPE_LABELS,
  RISK_TYPES,
  daysBetween,
  formatDate,
  formatUsd,
  type IntakeDto,
  type Risk,
} from "@app/backend/contract";
import { DATA_ENGINEERING_TAG, formatSent, humanize, slug } from "./intake-utils";

const SEVERITY_ORDER: Record<Risk["severity"], number> = { high: 0, medium: 1, low: 2 };
// Budget first: it is the question the team asks first.
const GROUP_ORDER = ["budget", "missing_info", "risk"] as const satisfies readonly (typeof RISK_TYPES)[number][];
const GROUP_TITLES: Record<(typeof GROUP_ORDER)[number], string> = {
  budget: "Budget check",
  missing_info: "Missing information",
  risk: "Risks",
};

export function IntakeDetails({ intake }: { intake: IntakeDto }) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) dialog.showModal();
  }, [open]);

  const area = intake.tags[0];
  const analyzed = area !== undefined;
  const isDataEngineering = area !== undefined && slug(area) === DATA_ENGINEERING_TAG;
  const days = daysBetween(intake.createdAt.slice(0, 10), intake.timeline);

  return (
    <>
      <button type="button" className="button small secondary" onClick={() => setOpen(true)}>
        View details
      </button>

      {open && (
        <dialog
          ref={dialogRef}
          className="dialog"
          aria-labelledby={titleId}
          onClose={() => setOpen(false)}
          // The dialog element itself is only the target when the backdrop is clicked.
          onClick={(e) => e.target === dialogRef.current && dialogRef.current?.close()}
        >
          <div className="dialog-body">
            <header className="dialog-head">
              <div>
                <h2 id={titleId}>{intake.title}</h2>
                <p className="dialog-sub">Sent {formatSent(intake.createdAt)} · {intake.industry}</p>
              </div>
              <button type="button" className="icon-button" aria-label="Close details" onClick={() => dialogRef.current?.close()}>
                ✕
              </button>
            </header>

            <ul className="chips" aria-label="Tags">
              {area && (
                <li className={`chip ${isDataEngineering ? "chip-de" : "chip-subject"}`}>{humanize(area)}</li>
              )}
              {intake.priority === "urgent" && <li className="chip chip-urgent">Urgent</li>}
              <li className="chip chip-industry">{intake.industry}</li>
            </ul>
            <p className="intake-meta">
              {formatUsd(intake.budget)} · Due {formatDate(intake.timeline)} ({days} days after submission)
            </p>

            {intake.priority === "urgent" && intake.priorityReason && (
              <p className="dialog-urgent">{intake.priorityReason}</p>
            )}

            <section>
              <h3>Submitted by</h3>
              <p className="dialog-text">
                {intake.name}, {intake.company}
                <br />
                {intake.email.includes("@") ? <a href={`mailto:${intake.email}`}>{intake.email}</a> : intake.email}
              </p>
            </section>

            <section>
              <h3>Description</h3>
              <p className="dialog-text">{intake.description}</p>
            </section>

            {!analyzed ? (
              <p className="dialog-pending">The AI analysis isn&rsquo;t available for this intake yet.</p>
            ) : (
              <>
                {intake.summary && (
                  <section>
                    <h3>AI summary</h3>
                    <p className="dialog-text">{intake.summary}</p>
                  </section>
                )}

                {GROUP_ORDER.map((type) => {
                  const items = intake.risks
                    .filter((r) => r.type === type)
                    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
                  if (items.length === 0) return null;
                  return (
                    <section key={type}>
                      <h3>{GROUP_TITLES[type]}</h3>
                      <ul className="findings">
                        {items.map((r, i) => (
                          <li key={i}>
                            <span className={`sev sev-${r.severity}`}>{r.severity}</span>
                            <span className="finding-type">{RISK_TYPE_LABELS[r.type]}</span>
                            <span className="finding-msg">{r.message}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })}

                {intake.keyPoints.length > 0 && (
                  <section>
                    <h3>Key points</h3>
                    <ul className="key-points">
                      {intake.keyPoints.map((point, i) => (
                        <li key={i}>{point}</li>
                      ))}
                    </ul>
                  </section>
                )}

              </>
            )}
          </div>
        </dialog>
      )}
    </>
  );
}
