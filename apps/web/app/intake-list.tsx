import { formatDate, formatUsd, type IntakeDto } from "@app/backend/contract";
import { IntakeDetails } from "./intake-details";
import { DATA_ENGINEERING_TAG, formatSent, humanize, slug } from "./intake-utils";

/** First 3 sentences, capped so a long run-on sentence can't blow up the card. */
function excerpt(text: string, maxSentences = 3, maxChars = 280) {
  const sentences = text.trim().split(/(?<=[.!?])\s+/).slice(0, maxSentences).join(" ");
  return sentences.length > maxChars ? `${sentences.slice(0, maxChars).trimEnd()}…` : sentences;
}

function IntakeCard({ intake }: { intake: IntakeDto }) {
  const area = intake.tags[0];
  const isDataEngineering = area !== undefined && slug(area) === DATA_ENGINEERING_TAG;
  const urgent = intake.priority === "urgent";
  const highFindings = intake.risks.filter((r) => r.severity === "high").length;

  return (
    <li className={`intake ${urgent ? "intake-urgent" : ""}`}>
      <div className="intake-head">
        <h3>{intake.title}</h3>
        <time dateTime={intake.createdAt}>{formatSent(intake.createdAt)}</time>
      </div>
      <p className="intake-by">
        {intake.name} · {intake.company}
      </p>
      <p className="intake-desc">{excerpt(intake.description)}</p>
      <ul className="chips" aria-label="Tags">
        {area ? (
          <li className={`chip ${isDataEngineering ? "chip-de" : "chip-subject"}`}>{humanize(area)}</li>
        ) : (
          <li className="chip chip-muted">Awaiting AI analysis</li>
        )}
        {urgent && <li className="chip chip-urgent">Urgent</li>}
        <li className="chip chip-industry">{intake.industry}</li>
      </ul>
      <p className="intake-meta">
        {formatUsd(intake.budget)} · Due {formatDate(intake.timeline)}
      </p>
      <div className="intake-foot">
        {highFindings > 0 && (
          <span className="sev sev-high">{highFindings} high-severity {highFindings === 1 ? "finding" : "findings"}</span>
        )}
        <IntakeDetails intake={intake} />
      </div>
    </li>
  );
}

export function IntakeList({ intakes, title = "Submitted projects" }: { intakes: IntakeDto[]; title?: string }) {
  if (intakes.length === 0) {
    return (
      <section className="card panel empty" aria-live="polite">
        <div className="empty-icon" aria-hidden>🌱</div>
        <h2>No intakes yet</h2>
        <p>Do you want to create some? Fill in the form below and your first project will show up here.</p>
      </section>
    );
  }

  return (
    <section className="card panel">
      <h2>
        {title} <span className="count">{intakes.length}</span>
      </h2>
      <ul className="intakes">
        {intakes.map((intake) => (
          <IntakeCard key={intake.id} intake={intake} />
        ))}
      </ul>
    </section>
  );
}
