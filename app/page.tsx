"use client";

import { FormEvent, useState } from "react";

export default function HomePage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setLoading(true);
    setError("");
    setResult(null);

    const form = new FormData(e.currentTarget);

    const body = {
      name: String(form.get("name") || ""),
      phone: String(form.get("phone") || ""),
      email: String(form.get("email") || "")
    };

    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data.error || "Could not create invitation."
        );
      }

      setResult(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell">
      <section className="card">
        <h1>Phone Tracking Invite</h1>

        <p className="muted">
          Enter the recipient details.
          Tracking starts only after they agree
          and allow browser location access.
        </p>

        <form className="form" onSubmit={submit}>
          <label>
            Name
            <input
              name="name"
              required
              placeholder="Recipient name"
            />
          </label>

          <label>
            Phone Number
            <input
              name="phone"
              required
              placeholder="+91..."
            />
          </label>

          <label>
            Email
            <input
              name="email"
              type="email"
              required
              placeholder="name@example.com"
            />
          </label>

          <button
            className="send"
            type="submit"
            disabled={loading}
          >
            {loading ? "..." : "→"}
          </button>
        </form>

        <div className="notice">
          Phone number and email are used only
          to send the permission request.
        </div>

        {error && (
          <div className="notice error">
            {error}
          </div>
        )}

        {result && (
          <div className="notice success">
            <b>Tracking invitation created.</b>

            <p>Permission link:</p>
            <div className="linkbox">
              {result.inviteUrl}
            </div>

            <p>Private dashboard:</p>
            <div className="linkbox">
              {result.dashboardUrl}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
