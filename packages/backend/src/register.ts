import { createSession, registerUser } from "./auth";
import type { RegisterInput } from "./contract";
import { createIntake } from "./intakes";

/** Creates the account, signs the user in and saves their first intake. The caller schedules the AI analysis. */
export async function registerWithIntake({ password, ...intake }: RegisterInput) {
  const user = await registerUser({ name: intake.name, email: intake.email, company: intake.company, password });
  const session = await createSession(user.id);
  const created = await createIntake({ ...intake, email: user.email }, user.id);
  return { user, session, intake: created };
}
