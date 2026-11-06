"use client";

import {
  use,
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";

type Fix = {
  latitude: number;
  longitude: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  timestamp: number;
};

// How often the latest location is sent to the dashboard.
const SEND_INTERVAL_MS = 1000;

export default function SharePage({
  params
}: {
  params: Promise<{
    token: string;
  }>;
}) {
  const { token } = use(params);

  const [invite, setInvite] = useState<any>(null);
  const [message, setMessage] = useState("Loading invitation...");
  const [sharing, setSharing] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [lastSent, setLastSent] = useState<number | null>(null);
  const [sentCount, setSentCount] = useState(0);

  const watchId = useRef<number | null>(null);
  const sendTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const latestFix = useRef<Fix | null>(null);
  const sending = useRef(false);
  const active = useRef(false);
  const wakeLock = useRef<any>(null);

  useEffect(() => {
    fetch(`/api/invites/${token}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Could not load invitation.");
        }

        setInvite(data);
        setMessage("");
      })
      .catch((error) => {
        setMessage(error.message);
      });
  }, [token]);

  async function setConsent(
    action: "agree" | "disagree" | "revoke"
  ) {
    const response = await fetch(
      `/api/invites/${token}/consent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ action })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not update consent.");
    }

    setInvite((old: any) => ({
      ...old,
      status: data.status
    }));
  }

  async function requestWakeLock() {
    try {
      const nav = navigator as any;
      if (nav.wakeLock && document.visibilityState === "visible") {
        wakeLock.current = await nav.wakeLock.request("screen");
      }
    } catch {
      // Wake lock is optional; ignore if the browser refuses.
    }
  }

  function releaseWakeLock() {
    try {
      wakeLock.current?.release();
    } catch {}
    wakeLock.current = null;
  }

  const sendLatest = useCallback(async () => {
    const fix = latestFix.current;

    if (!fix || sending.current || !active.current) {
      return;
    }

    sending.current = true;

    try {
      // A phone standing still may not produce new fixes, so a recent
      // fix is re-sent with the current time as a "still here" heartbeat.
      const fresh = Date.now() - fix.timestamp < 60000;

      const response = await fetch(
        `/api/invites/${token}/location`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            latitude: fix.latitude,
            longitude: fix.longitude,
            accuracy: fix.accuracy,
            speed: fix.speed,
            heading: fix.heading,
            timestamp: fresh ? Date.now() : fix.timestamp
          }),
          keepalive: true
        }
      );

      if (response.status === 403 || response.status === 404) {
        // Sharing was stopped (or the invite removed) elsewhere.
        stopWatching();
        setInvite((old: any) =>
          old ? { ...old, status: "revoked" } : old
        );
        setMessage("Location sharing is no longer active.");
        return;
      }

      if (response.ok) {
        setLastSent(Date.now());
        setSentCount((n) => n + 1);
      }
    } catch {
      // Network hiccup: the next tick will try again.
    } finally {
      sending.current = false;
    }
  }, [token]);

  function stopWatching() {
    active.current = false;

    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }

    if (sendTimer.current) {
      clearInterval(sendTimer.current);
      sendTimer.current = null;
    }

    releaseWakeLock();
    setSharing(false);
  }

  const startSharing = useCallback(() => {
    if (!navigator.geolocation) {
      setMessage("This browser does not support location access.");
      return;
    }

    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
    }

    active.current = true;
    setMessage("Starting location sharing...");

    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        latestFix.current = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          speed: position.coords.speed,
          heading: position.coords.heading,
          timestamp: position.timestamp || Date.now()
        };

        setSharing(true);
        setAccuracy(position.coords.accuracy);
        setMessage("");
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          stopWatching();
          setMessage(
            "Location permission is blocked for this website. Allow location in your browser settings, then press Start Sharing."
          );
        } else {
          // Timeouts / weak signal: keep the watch running and retry.
          setMessage(`Waiting for GPS signal... (${error.message})`);
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 20000
      }
    );

    if (!sendTimer.current) {
      sendTimer.current = setInterval(sendLatest, SEND_INTERVAL_MS);
    }

    requestWakeLock();
  }, [sendLatest]);

  // Once permission has been given, sharing resumes automatically
  // every time this page is opened — no need to press Agree again.
  useEffect(() => {
    if (invite?.status === "agreed" && !active.current) {
      startSharing();
    }
  }, [invite?.status, startSharing]);

  // When the phone returns to this tab, restart GPS and the wake lock
  // (browsers pause both while the page is in the background).
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible" && active.current) {
        startSharing();
      }
    }

    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [startSharing]);

  useEffect(() => {
    return () => stopWatching();
  }, []);

  async function agreeAndStart() {
    try {
      await setConsent("agree");
      startSharing();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not start sharing."
      );
    }
  }

  async function stopSharing() {
    stopWatching();

    try {
      await setConsent("revoke");
      setMessage("Location sharing has been stopped.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not stop sharing."
      );
    }
  }

  async function disagree() {
    try {
      await setConsent("disagree");
      setMessage("You chose not to share your location.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not save your choice."
      );
    }
  }

  const agreed = invite?.status === "agreed";

  return (
    <main className="shell">
      <section className="card">
        <h1>Location Request</h1>

        <p className="muted">
          {invite
            ? agreed
              ? `${invite.name}, you agreed to share this phone's live location.`
              : `${invite.name}, this page is requesting permission to share this phone's location.`
            : "Checking invitation..."}
        </p>

        {!agreed && (
          <div className="consent">
            <b>Your permission is required</b>

            <p>
              <b>
                Once you approve, your location will always be shown
                on the requester&apos;s live map
              </b>{" "}
              — updated every second while this page is open, and the
              last known location at other times — until you press
              Stop Sharing.
            </p>

            <p>
              After you press Agree, your browser will ask whether this
              website may access your location. Your approval is
              remembered: whenever you open this link again, sharing
              resumes automatically without asking again.
            </p>
          </div>
        )}

        {message && <div className="notice">{message}</div>}

        {invite &&
          ["pending", "disagreed", "revoked"].includes(invite.status) && (
            <div className="row" style={{ marginTop: 18 }}>
              <button className="btn btn-primary" onClick={agreeAndStart}>
                Agree
              </button>

              <button className="btn btn-ghost" onClick={disagree}>
                Disagree
              </button>
            </div>
          )}

        {agreed && !sharing && (
          <button
            className="btn btn-primary"
            style={{ marginTop: 18 }}
            onClick={startSharing}
          >
            Start Sharing
          </button>
        )}

        {agreed && (
          <div className="consent">
            Your location is always shown to the requester until you
            press Stop Sharing.
          </div>
        )}

        {sharing && (
          <>
            <div className="notice success">
              <span className="pulse" /> Live location sharing is active
              {accuracy !== null ? ` • Accuracy ±${Math.round(accuracy)} m` : ""}
              {lastSent
                ? ` • ${sentCount} updates sent`
                : " • Connecting..."}
            </div>

            <button
              className="btn btn-danger"
              style={{ marginTop: 18 }}
              onClick={stopSharing}
            >
              Stop Sharing
            </button>
          </>
        )}

        <p className="muted" style={{ marginTop: 20 }}>
          Keep this page open for live updates. Phones pause websites
          that are in the background or when the screen is locked; in
          that case the dashboard shows the last location received and
          sharing resumes as soon as this page is opened again.
        </p>
      </section>
    </main>
  );
}
