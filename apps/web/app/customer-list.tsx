import { formatDate, formatUsd, type CustomerIntakeDto } from "@app/backend/contract";
import { EditIntake } from "./edit-intake";
import { formatSent } from "./intake-utils";

/** What a customer sees of their own projects: exactly what they sent, nothing derived by the team or the AI. */
export function CustomerList({ intakes, title = "Your projects" }: { intakes: CustomerIntakeDto[]; title?: string }) {
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
          <li key={intake.id} className="intake">
            <div className="intake-head">
              <h3>{intake.title}</h3>
              <time dateTime={intake.createdAt}>{formatSent(intake.createdAt)}</time>
            </div>
            <p className="intake-desc intake-desc-full">{intake.description}</p>
            <p className="intake-meta">
              {intake.industry} · {formatUsd(intake.budget)} · Due {formatDate(intake.timeline)}
            </p>
            <div className="intake-foot">
              <EditIntake intake={intake} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
