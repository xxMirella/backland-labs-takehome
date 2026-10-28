"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { loginSchema } from "@app/backend/contract";

type Errors = { email?: string; password?: string };

export function LoginForm() {
  const router = useRouter();
  const [values, setValues] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [serverError, setServerError] = useState("");

  const validate = (v: typeof values): Errors => {
    const result = loginSchema.safeParse(v);
    if (result.success) return {};
    const fe = result.error.flatten().fieldErrors;
    return { email: fe.email?.[0], password: fe.password?.[0] };
  };

  function update(field: keyof typeof values, value: string) {
    const next = { ...values, [field]: value };
    setValues(next);
    if (submitted) setErrors(validate(next));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setServerError("");
    const found = validate(values);
    setErrors(found);
    if (found.email || found.password) {
      document.getElementById(found.email ? "login-email" : "login-password")?.focus();
      return;
    }

    setSending(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      if (res.ok) {
        router.refresh(); // the server now sees the session cookie and renders the signed-in page
      } else if (res.status === 401) {
        setServerError("Wrong email or password.");
        setValues((v) => ({ ...v, password: "" }));
        document.getElementById("login-password")?.focus();
      } else if (res.status === 429) {
        setServerError("Too many attempts. Please wait a few minutes and try again.");
      } else if (res.status === 400) {
        setErrors(validate(values));
        setServerError("Some fields need your attention.");
      } else {
        setServerError("Something went wrong on our side. Please try again.");
      }
    } catch {
      setServerError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="field">
        <label htmlFor="login-email">Email <span className="req">*</span></label>
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="ana@company.com"
          value={values.email}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? "login-email-error" : undefined}
          onChange={(e) => update("email", e.target.value)}
        />
        {errors.email && <p className="error" id="login-email-error" role="alert">{errors.email}</p>}
      </div>

      <div className="field">
        <label htmlFor="login-password">Password <span className="req">*</span></label>
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={values.password}
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={errors.password ? "login-password-error" : undefined}
          onChange={(e) => update("password", e.target.value)}
        />
        {errors.password && <p className="error" id="login-password-error" role="alert">{errors.password}</p>}
      </div>

      {serverError && <p className="banner" role="alert">{serverError}</p>}

      <button type="submit" className="button" disabled={sending}>
        {sending ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}
