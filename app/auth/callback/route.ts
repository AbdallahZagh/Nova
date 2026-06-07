import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Handles Supabase auth redirects:
 *  - Email confirmation after sign-up  → redirect to /dashboard
 *  - Password reset link               → redirect to /forgot-password?step=reset
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  // Exchange failed — send back to login with an error flag
  return NextResponse.redirect(new URL("/?error=auth_callback", origin));
}
