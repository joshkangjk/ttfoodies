import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Use service role to bypass RLS — this is a server-side route
const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * POST /api/share
 * Called by the iOS Shortcut to deposit a TikTok URL into the share_inbox.
 * Body: { url: string, share_token: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, share_token } = body;

    if (!url || !share_token) {
      return NextResponse.json(
        { error: "Missing url or share_token" },
        { status: 400 }
      );
    }

    // Look up the user by their share_token
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("share_token", share_token)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "Invalid share token" },
        { status: 401 }
      );
    }

    // Insert into share_inbox
    const { error: insertError } = await supabase
      .from("share_inbox")
      .insert({
        user_id: profile.id,
        url: url,
        processed: false,
      });

    if (insertError) {
      return NextResponse.json(
        { error: "Failed to queue share" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 }
    );
  }
}

/**
 * GET /api/share?user_id=<uuid>
 * Called by the PWA on focus to check for pending shares.
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user_id");

  if (!userId) {
    return NextResponse.json(
      { error: "Missing user_id" },
      { status: 400 }
    );
  }

  // Fetch unprocessed shares
  const { data, error } = await supabase
    .from("share_inbox")
    .select("*")
    .eq("user_id", userId)
    .eq("processed", false)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  if (data && data.length > 0) {
    // Mark as processed immediately
    await supabase
      .from("share_inbox")
      .update({ processed: true })
      .eq("id", data[0].id);

    return NextResponse.json({ url: data[0].url });
  }

  return NextResponse.json({ url: null });
}
