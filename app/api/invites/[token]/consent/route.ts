import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      token: string;
    }>;
  }
) {
  const { token } = await context.params;
  const body = await request.json();

  const action = String(body.action || "");

  if (!["agree", "disagree", "revoke"].includes(action)) {
    return NextResponse.json(
      {
        error: "Invalid action."
      },
      {
        status: 400
      }
    );
  }

  const status =
    action === "agree"
      ? "agreed"
      : action === "disagree"
      ? "disagreed"
      : "revoked";

  const supabase = getSupabaseAdmin();

  const update: Record<string, string> = {
    status
  };

  if (action === "agree") {
    update.consented_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("tracking_invites")
    .update(update)
    .eq("share_token", token)
    .select("id,status")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      {
        error: "Invitation not found."
      },
      {
        status: 404
      }
    );
  }

  return NextResponse.json({
    status: data.status
  });
}
