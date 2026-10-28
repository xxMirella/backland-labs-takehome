"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  editIntakeSchema,
  isValidIsoDate,
  projectSchema,
  registerSchema,
  type CustomerIntakeDto,
} from "@app/backend/contract";
import { localToday, maskUsd, toDigits } from "./format";

const ACCOUNT_FIELDS = ["name", "email", "company", "password"] as const;
const FIELDS = ["name", "email", "company", "password", "title", "description", "budget", "timeline", "industry"] as const;
type Field = (typeof FIELDS)[number];
type Values = Record<Field, string>;
type Errors = Partial<Record<Field, string>>;

const EMPTY: Values = { name: "", email: "", company: "", password: "", title: "", description: "", budget: "", timeline: "", industry: "" };

export type FormMode = "register" | "member" | "edit";

/** `budget` is kept as raw digits in state; the API wants a number (or nothing when empty). */
const toPayload = (values: Values, mode: FormMode) => {
  const { name, email, company, password, ...project } = values;
  const body = { ...project, budget: values.budget === "" ? undefined : Number(values.budget) };
  // Signed-in users are identified by their session: never send (or trust) account fields.
  return mode === "register" ? { ...body, name, email, company, password } : body;
};

const fieldsFor = (mode: FormMode) => (mode === "register" ? FIELDS : FIELDS.filter((f) => !(ACCOUNT_FIELDS as readonly string[]).includes(f)));

/** `originalTimeline`: when editing, a date that was not touched is never rejected for being in the past. */
function validate(values: Values, mode: FormMode, originalTimeline?: string): Errors {
  const schema = mode === "register" ? registerSchema : mode === "edit" ? editIntakeSchema : projectSchema;
  const result = schema.safeParse(toPayload(values, mode));
  const fieldErrors = result.success
    ? {}
    : (result.error.flatten().fieldErrors as Partial<Record<Field, string[]>>);
  const errors: Errors = Object.fromEntries(
    fieldsFor(mode).flatMap((f) => (fieldErrors[f]?.[0] ? [[f, fieldErrors[f][0]]] : [])),
  );
  // The server tolerates "yesterday" for timezones; the browser knows the user's real today.
  const untouched = mode === "edit" && values.timeline === originalTimeline;
  if (!errors.timeline && !untouched && isValidIsoDate(values.timeline) && values.timeline < localToday()) {
    errors.timeline = "Delivery date can't be in the past";
  }
  return errors;
}

const fromIntake = (i: CustomerIntakeDto): Values => ({
  ...EMPTY,
  title: i.title,
  description: i.description,
  budget: String(i.budget),
  timeline: i.timeline,
  industry: i.industry,
});

type Props = {
  mode?: FormMode;
  /** Edit mode: the intake being changed. */
  initial?: CustomerIntakeDto;
  onDone?: () => void;
  onCancel?: () => void;
};

export function IntakeForm({ mode = "register", initial, onDone, onCancel }: Props) {
  const router = useRouter();
  const check = (v: Values) => validate(v, mode, initial?.timeline);
  const [values, setValues] = useState<Values>(initial ? fromIntake(initial) : EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [serverError, setServerError] = useState("");
  const [created, setCreated] = useState<{ title: string } | null>(null);

  function update(field: Field, value: string) {
    const next = { ...values, [field]: value };
    setValues(next);
    if (submitted) setErrors(check(next));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setServerError("");
    const found = check(values);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      document.getElementById(fieldsFor(mode).find((f) => found[f])!)?.focus();
      return;
    }

    setSending(true);
    try {
      const editing = mode === "edit" && initial;
      const res = await fetch(editing ? `/api/intakes/${initial.id}` : mode === "register" ? "/api/register" : "/api/intakes", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(toPayload(values, mode)),
      });
      if (editing && res.ok) {
        onDone?.();
        router.refresh();
      } else if (editing && res.status === 404) {
        setServerError("We couldn't find this project any more. Please reload the page.");
      } else if (res.status === 201) {
        const body = (await res.json()) as { title: string } | { intake: { title: string } };
        setCreated("intake" in body ? body.intake : body);
        router.refresh(); // the server re-renders: new session (if any) and the updated list
      } else if (res.status === 409) {
        // An account with this email already exists.
        setErrors({ email: "An account with this email already exists. Please log in instead." });
        document.getElementById("email")?.focus();
      } else if (res.status === 400) {
        setErrors(check(values));
        setServerError("Some fields need your attention.");
      } else if (res.status === 401) {
        setServerError("Your session has expired. Please log in again.");
        router.refresh();
      } else if (res.status === 429) {
        setServerError("Too many attempts. Please try again later.");
      } else {
        setServerError("Something went wrong on our side. Please try again.");
      }
    } catch {
      setServerError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  function reset() {
    setValues(EMPTY);
    setErrors({});
    setSubmitted(false);
    setCreated(null);
  }

  if (created) {
    return (
      <div className="success" role="status">
        <div className="success-icon" aria-hidden>✓</div>
        <h2>Thank you!</h2>
        <p>We received &ldquo;{created.title}&rdquo; and will review it soon.</p>
        <button type="button" className="button secondary" onClick={reset}>
          Send another project
        </button>
      </div>
    );
  }

  const props = (f: Field) => ({
    id: f,
    name: f,
    value: values[f],
    "aria-invalid": errors[f] ? true : undefined,
    "aria-describedby": errors[f] ? `${f}-error` : undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      update(f, e.target.value),
  });

  const error = (f: Field) =>
    errors[f] ? (
      <p className="error" id={`${f}-error`} role="alert">
        {errors[f]}
      </p>
    ) : null;

  return (
    <form onSubmit={onSubmit} noValidate>
      {mode === "register" && (
      <fieldset className="group">
        <legend>About you</legend>
        <div className="row">
          <div className="field">
            <label htmlFor="name">Your name <span className="req">*</span></label>
            <input {...props("name")} type="text" autoComplete="name" placeholder="Ana Silva" />
            {error("name")}
          </div>
          <div className="field">
            <label htmlFor="email">Email <span className="req">*</span></label>
            <input {...props("email")} type="email" autoComplete="email" placeholder="ana@company.com" />
            {error("email")}
          </div>
        </div>
        <div className="field">
          <label htmlFor="company">Company <span className="req">*</span></label>
          <input {...props("company")} type="text" autoComplete="organization" placeholder="Acme Inc." />
          {error("company")}
        </div>
        <div className="field">
          <label htmlFor="password">Password <span className="req">*</span></label>
          <input {...props("password")} type="password" autoComplete="new-password" placeholder="At least 8 characters" />
          {error("password")}
          <p className="hint">This creates your account, so you can come back and follow your projects.</p>
        </div>
      </fieldset>
      )}

      <fieldset className="group">
        <legend>Your project</legend>
      <div className="field">
        <label htmlFor="title">Project title <span className="req">*</span></label>
        <input {...props("title")} type="text" placeholder="e.g. Booking app for my studio" />
        {error("title")}
      </div>

      <div className="field">
        <label htmlFor="description">What do you need? <span className="req">*</span></label>
        <textarea {...props("description")} rows={5} placeholder="Goals, who it's for, anything that matters…" />
        {error("description")}
      </div>

      <div className="row">
        <div className="field">
          <label htmlFor="budget">Budget (USD) <span className="req">*</span></label>
          <input
            {...props("budget")}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="$25,000"
            value={maskUsd(values.budget)}
            onChange={(e) => update("budget", toDigits(e.target.value))}
          />
          {error("budget")}
        </div>
        <div className="field">
          <label htmlFor="timeline">Timeline (desired delivery date) <span className="req">*</span></label>
          <input {...props("timeline")} type="date" min={localToday()} />
          {error("timeline")}
        </div>
      </div>

      <div className="field">
        <label htmlFor="industry">Industry <span className="req">*</span></label>
        <input {...props("industry")} type="text" placeholder="e.g. Healthcare, Retail, Education" />
        {error("industry")}
      </div>
      </fieldset>

      {serverError && <p className="banner" role="alert">{serverError}</p>}

      <div className="form-actions">
        {onCancel && (
          <button type="button" className="button secondary" onClick={onCancel} disabled={sending}>
            Cancel
          </button>
        )}
        <button type="submit" className="button" disabled={sending}>
          {mode === "edit" ? (sending ? "Saving…" : "Save changes") : sending ? "Sending…" : "Send my project"}
        </button>
      </div>
    </form>
  );
}
