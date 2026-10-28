import { getStats, listIntakesFor } from "@app/backend";
import { currentUser } from "../lib/http";
import { AuthPanel } from "./auth-panel";
import { CustomerList } from "./customer-list";
import { IntakeForm } from "./intake-form";
import { IntakeList } from "./intake-list";
import { IntakeStats } from "./intake-stats";
import { LogoutButton } from "./logout-button";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [user, stats] = await Promise.all([currentUser(), getStats()]);

  // Visitors only see the counts plus the way in; project details need a login.
  if (!user) {
    return (
      <main className="page">
        <IntakeStats stats={stats} />
        <AuthPanel />
      </main>
    );
  }

  const listing = await listIntakesFor(user); // newest first; customers only get what they sent

  return (
    <main className="page page-with-topbar">
      <header className="card topbar">
        <p>
          Signed in as <strong>{user.name}</strong>
          {user.isAdmin && <span className="chip chip-de">Team</span>}
        </p>
        <LogoutButton />
      </header>
      <IntakeStats stats={stats} />
      {listing.scope === "all" ? (
        <IntakeList intakes={listing.intakes} title="All projects" />
      ) : (
        <CustomerList intakes={listing.intakes} />
      )}
      <section className="card">
        <p className="eyebrow">Got another one?</p>
        <h1>Submit a new project</h1>
        <p className="lead">
          We&rsquo;ll use the details from your account. Fields marked with <span className="req">*</span> are required.
        </p>
        <IntakeForm mode="member" />
      </section>
    </main>
  );
}
