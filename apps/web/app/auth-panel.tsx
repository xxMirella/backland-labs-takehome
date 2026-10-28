"use client";

import { useState } from "react";
import { IntakeForm } from "./intake-form";
import { LoginForm } from "./login-form";

/** Visitors either submit a project (which also creates their account) or log in to an existing one. */
export function AuthPanel() {
  const [tab, setTab] = useState<"register" | "login">("register");

  return (
    <section className="card">
      <div className="tabs" role="tablist" aria-label="Get started">
        <button
          type="button"
          role="tab"
          id="tab-register"
          aria-selected={tab === "register"}
          aria-controls="panel-register"
          className="tab"
          onClick={() => setTab("register")}
        >
          Submit a project
        </button>
        <button
          type="button"
          role="tab"
          id="tab-login"
          aria-selected={tab === "login"}
          aria-controls="panel-login"
          className="tab"
          onClick={() => setTab("login")}
        >
          I have an account
        </button>
      </div>

      {tab === "register" ? (
        <div role="tabpanel" id="panel-register" aria-labelledby="tab-register">
          <p className="eyebrow">Let&rsquo;s build something together</p>
          <h1>Tell us about your project</h1>
          <p className="lead">
            Share a few details and we&rsquo;ll get back to you. Submitting also creates your account, so you can follow your
            projects. Fields marked with <span className="req">*</span> are required.
          </p>
          <IntakeForm mode="register" />
        </div>
      ) : (
        <div role="tabpanel" id="panel-login" aria-labelledby="tab-login">
          <p className="eyebrow">Welcome back</p>
          <h1>Log in</h1>
          <p className="lead">See the projects you sent and what we found.</p>
          <LoginForm />
        </div>
      )}
    </section>
  );
}
