import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function createToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const name = String(body.name || "").trim();
    const phone = String(body.phone || "").trim();
    const email = String(body.email || "").trim();

    if (!name || !phone || !email) {
      return NextResponse.json(
        {
          error: "Name, phone number and email are required."
        },
        {
          status: 400
        }
      );
    }

    const shareToken = createToken();
    const adminToken = createToken(32);

    const supabase = getSupabaseAdmin();

    const { error } = await supabase
      .from("tracking_invites")
      .insert({
        share_token: shareToken,
        admin_token: adminToken,
        name,
        phone,
        email
      });

    if (error) {
      throw error;
    }

    const baseUrl = (
      process.env.APP_BASE_URL ||
      new URL(request.url).origin
    ).replace(/\/$/, "");

    const inviteUrl =
      `${baseUrl}/share/${shareToken}`;

    const dashboardUrl =
      `${baseUrl}/dashboard/${adminToken}`;

    return NextResponse.json({
      inviteUrl,
      dashboardUrl
    });

  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error: "Could not create tracking invitation."
      },
      {
        status: 500
      }
    );
  }
}
