import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

export async function GET(
  _request: Request,
  context: {
    params: Promise<{
      token: string;
    }>;
  }
) {
  try {
    const { token } = await context.params;

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("tracking_invites")
      .select("name,status,expires_at,created_at")
      .eq("share_token", token)
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

    if (
      new Date(data.expires_at).getTime() <
      Date.now()
    ) {
      return NextResponse.json(
        {
          error: "This invitation has expired."
        },
        {
          status: 410
        }
      );
    }

    return NextResponse.json({
      name: data.name,
      status: data.status,
      expires_at: data.expires_at,
      created_at: data.created_at
    });

  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error: "Could not load invitation."
      },
      {
        status: 500
      }
    );
  }
}
