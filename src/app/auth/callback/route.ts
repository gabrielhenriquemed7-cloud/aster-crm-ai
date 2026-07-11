import { NextResponse, type NextRequest } from "next/server";
import { getRequestOrigin } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = getRequestOrigin(request);
  const code = searchParams.get("code");
  const requestedNext = searchParams.get("next");
  const next = requestedNext?.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/dashboard";
  if (code) {
    const supabase = await createClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        const { error: inviteError } = await supabase.rpc("accept_my_clinic_invites");
        if (inviteError) return NextResponse.redirect(`${origin}${next}?error=invite_acceptance`);
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth_callback`);
}
