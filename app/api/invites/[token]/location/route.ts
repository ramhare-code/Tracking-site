import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../../lib/supabaseAdmin";

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      token: string;
    }>;
  }
) {
  try {
    const { token } = await context.params;
    const body = await request.json();

    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);

    const accuracy =
      body.accuracy == null
        ? null
        : Number(body.accuracy);

    const speed =
      body.speed == null
        ? null
        : Number(body.speed);

    const heading =
      body.heading == null
        ? null
        : Number(body.heading);

    const capturedMs = Number(body.timestamp);
    const capturedAt =
      Number.isFinite(capturedMs) &&
      Math.abs(Date.now() - capturedMs) < 10 * 60 * 1000
        ? new Date(capturedMs).toISOString()
        : new Date().toISOString();

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return NextResponse.json(
        {
          error: "Invalid coordinates."
        },
        {
          status: 400
        }
      );
    }

    const supabase = getSupabaseAdmin();

    const {
      data: invite,
      error: inviteError
    } = await supabase
      .from("tracking_invites")
      .select("id,status")
      .eq("share_token", token)
      .maybeSingle();

    if (inviteError || !invite) {
      return NextResponse.json(
        {
          error: "Invitation not found."
        },
        {
          status: 404
        }
      );
    }

    if (invite.status !== "agreed") {
      return NextResponse.json(
        {
          error: "Location sharing is not active."
        },
        {
          status: 403
        }
      );
    }

    const { error } = await supabase
      .from("location_updates")
      .insert({
        invite_id: invite.id,
        latitude,
        longitude,
        accuracy_m:
          Number.isFinite(accuracy)
            ? accuracy
            : null,
        speed_mps:
          Number.isFinite(speed)
            ? speed
            : null,
        heading:
          Number.isFinite(heading)
            ? heading
            : null,
        captured_at: capturedAt
      });

    if (error) {
      console.error(error);

      return NextResponse.json(
        {
          error: "Could not save location."
        },
        {
          status: 500
        }
      );
    }

    return NextResponse.json({
      ok: true
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error: "Could not process location update."
      },
      {
        status: 500
      }
    );
  }
}
