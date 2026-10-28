"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/logout", { method: "POST" });
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <button type="button" className="button small secondary" onClick={logout} disabled={busy}>
      {busy ? "Logging out…" : "Log out"}
    </button>
  );
}
