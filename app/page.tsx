"use client";

import { FormEvent, useEffect, useState } from "react";

type SavedInvite = {
  name: string;
  dashboardUrl: string;
  inviteUrl: string;
  createdAt: string;
};

const STORAGE_KEY = "tracking-invites";

function loadSaved(): SavedInvite[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

export default function HomePage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [phone, setPhone] = useState("");
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState<SavedInvite[]>([]);

  useEffect(() => {
    setSaved(loadSaved());
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setLoading(true);
    setError("");
    setResult(null);
    setCopied(false);

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
      setPhone(body.phone);

      // Remember the private dashboard link on this device.
      const next = [
        {
          name: body.name,
          dashboardUrl: data.dashboardUrl,
          inviteUrl: data.inviteUrl,
          createdAt: new Date().toISOString()
        },
        ...loadSaved()
      ].slice(0, 20);

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      setSaved(next);

      // If neither email nor SMS could be sent automatically,
      // open the phone's share sheet so the link can be sent in one tap.
      const anySent = (data.delivery || []).some((d: any) => d.sent);
      if (!anySent && typeof navigator !== "undefined" && (navigator as any).share) {
        (navigator as any)
          .share({ title: "Location request", text: data.shareText })
          .catch(() => {});
      }
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
          The permission link is sent automatically to the phone
          number (SMS) and email you enter. Phone number and email
          are used only to send the permission request.
        </div>

        {error && (
          <div className="notice error">
            {error}
          </div>
        )}

        {result && (
          <div className="notice success">
            <b>Tracking invitation created.</b>

            {(result.delivery || []).map((d: any) => (
              <p key={d.channel} style={{ margin: "6px 0" }}>
                {d.sent ? "✓" : "•"} {d.detail}
              </p>
            ))}

            <p>Send the permission link:</p>
            <div className="row">
              <a
                className="btn btn-primary"
                href={`https://wa.me/${phone.replace(/[^\d]/g, "")}?text=${encodeURIComponent(result.shareText)}`}
                target="_blank"
                rel="noreferrer"
              >
                WhatsApp
              </a>
              <a
                className="btn btn-ghost"
                href={`sms:${phone}?body=${encodeURIComponent(result.shareText)}`}
              >
                SMS
              </a>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => {
                  navigator.clipboard
                    ?.writeText(result.inviteUrl)
                    .then(() => setCopied(true));
                }}
              >
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>

            <div className="linkbox">{result.inviteUrl}</div>

            <p>Your private dashboard (opens the live location):</p>
            <a
              className="btn btn-primary"
              href={result.dashboardUrl}
              style={{ display: "inline-block" }}
            >
              Open dashboard
            </a>
            <div className="linkbox">{result.dashboardUrl}</div>
          </div>
        )}

        {saved.length > 0 && (
          <div className="notice">
            <b>Your dashboards on this device</b>
            {saved.map((item) => (
              <p key={item.dashboardUrl} style={{ margin: "8px 0" }}>
                <a href={item.dashboardUrl}>{item.name}</a>{" "}
                <span className="muted">
                  • {new Date(item.createdAt).toLocaleDateString()}
                </span>
              </p>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
