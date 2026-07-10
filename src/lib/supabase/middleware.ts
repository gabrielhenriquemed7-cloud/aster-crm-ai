import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  const isAuthRoute = request.nextUrl.pathname.startsWith("/login") || request.nextUrl.pathname.startsWith("/signup") || request.nextUrl.pathname.startsWith("/forgot-password") || request.nextUrl.pathname.startsWith("/reset-password") || request.nextUrl.pathname.startsWith("/auth/");
  const isOnboardingRoute = request.nextUrl.pathname.startsWith("/onboarding");

  if (!user && !isAuthRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && ["/login", "/signup", "/forgot-password"].includes(request.nextUrl.pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }
  if (user && !isOnboardingRoute && !request.nextUrl.pathname.startsWith("/auth/")) {
    const { data: profile, error: profileError } = await supabase.from("profiles").select("active_clinic_id").eq("id", user.id).maybeSingle();
    const { data: membership, error: membershipError } = profile?.active_clinic_id
      ? await supabase.from("clinic_members").select("id").eq("user_id", user.id).eq("clinic_id", profile.active_clinic_id).eq("status", "active").maybeSingle()
      : { data: null, error: null };
    if (!profileError && !membershipError && (!profile?.active_clinic_id || !membership)) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/onboarding";
      redirectUrl.search = "";
      return NextResponse.redirect(redirectUrl);
    }
  }
  return response;
}
