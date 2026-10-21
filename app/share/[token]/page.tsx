"use client";

import {
  use,
  useEffect,
  useRef,
  useState
} from "react";

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

  const watchId = useRef<number | null>(null);

  useEffect(() => {
    fetch(`/api/invites/${token}`)
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

  function startSharing() {
    if (!navigator.geolocation) {
      setMessage("This browser does not support location access.");
      return;
    }

    setMessage(
      "Your phone will now ask for location permission."
    );

    watchId.current =
      navigator.geolocation.watchPosition(
        async (position) => {
          setSharing(true);
          setAccuracy(position.coords.accuracy);

          setMessage("Location sharing is active.");

          await fetch(
            `/api/invites/${token}/location`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                speed: position.coords.speed,
                heading: position.coords.heading
              })
            }
          );
        },

        (error) => {
          setSharing(false);

          if (error.code === error.PERMISSION_DENIED) {
            setMessage(
              "Location permission was denied. No location is being shared."
            );
          } else {
            setMessage(
              `Location unavailable: ${error.message}`
            );
          }
        },

        {
          enableHighAccuracy: true,
          maximumAge: 5000,
          timeout: 15000
        }
      );
  }

  async function stopSharing() {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(
        watchId.current
      );

      watchId.current = null;
    }

    setSharing(false);

    try {
      await setConsent("revoke");
      setMessage(
        "Location sharing has been stopped."
      );
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

      setMessage(
        "You chose not to share your location."
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not save your choice."
      );
    }
  }

  return (
    <main className="shell">
      <section className="card">
        <h1>Location Request</h1>

        <p className="muted">
          {invite
            ? `${invite.name}, this page is requesting permission to share this phone's location.`
            : "Checking invitation..."}
        </p>

        <div className="consent">
          <b>Your permission is required</b>

          <p>
            Pressing Agree does not automatically
            bypass your phone settings.
            Your browser will separately ask
            whether this website may access your location.
          </p>
        </div>

        {message && (
          <div className="notice">
            {message}
          </div>
        )}

        {invite &&
          [
            "pending",
            "disagreed",
            "revoked"
          ].includes(invite.status) && (
            <div
              className="row"
              style={{
                marginTop: 18
              }}
            >
              <button
                className="btn btn-primary"
                onClick={agreeAndStart}
              >
                Agree
              </button>

              <button
                className="btn btn-ghost"
                onClick={disagree}
              >
                Disagree
              </button>
            </div>
          )}

        {invite?.status === "agreed" &&
          !sharing && (
            <button
              className="btn btn-primary"
              style={{
                marginTop: 18
              }}
              onClick={startSharing}
            >
              Start Sharing
            </button>
          )}

        {sharing && (
          <>
            <div className="notice success">
              Live location sharing is active
              {accuracy !== null
                ? ` • Accuracy ±${Math.round(
                    accuracy
                  )} m`
                : ""}
            </div>

            <button
              className="btn btn-danger"
              style={{
                marginTop: 18
              }}
              onClick={stopSharing}
            >
              Stop Sharing
            </button>
          </>
        )}

        <p
          className="muted"
          style={{
            marginTop: 20
          }}
        >
          If this phone is switched off,
          loses internet, or stops sending
          location updates, the dashboard
          can only show the last successfully
          received location.
        </p>
      </section>
    </main>
  );
}
