import type { StatsDto } from "@app/backend/contract";

/** Counts only: visible to everyone, no project or personal data. */
export function IntakeStats({ stats }: { stats: StatsDto }) {
  return (
    <section className="card panel" aria-label="Intakes overview">
      <h2>Intakes</h2>
      <dl className="stats">
        <div className="stat">
          <dt>Total intakes</dt>
          <dd>{stats.total}</dd>
        </div>
        <div className={`stat ${stats.urgent > 0 ? "stat-urgent" : ""}`}>
          <dt>Urgent</dt>
          <dd>{stats.urgent}</dd>
        </div>
      </dl>
    </section>
  );
}
