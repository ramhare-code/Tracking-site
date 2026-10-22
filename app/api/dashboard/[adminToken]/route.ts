import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

export async function GET(
  _request: Request,
  context: {
    params: Promise<{
      adminToken: string;
    }>;
  }
) {
  const { adminToken } = await context.params;

  const supabase = getSupabaseAdmin();

  const { data: invite, error } = await supabase
    .from("tracking_invites")
    .select("id,name,status,expires_at")
    .eq("admin_token", adminToken)
    .maybeSingle();

  if (error || !invite) {
    return NextResponse.json(
      {
        error: "Dashboard not found."
      },
      {
        status: 404
      }
    );
  }

  const { data: latest } = await supabase
    .from("location_updates")
    .select(
      "latitude,longitude,accuracy_m,speed_mps,heading,captured_at"
    )
    .eq("invite_id", invite.id)
    .order("captured_at", {
      ascending: false
    })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    name: invite.name,
    consentStatus: invite.status,
    expiresAt: invite.expires_at,
    latest: latest || null
  });
}
