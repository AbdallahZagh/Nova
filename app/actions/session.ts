"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * @deprecated Supabase sets its own session cookies automatically.
 * Kept so existing call sites don't break — this is a no-op.
 */
export async function establishSession() {}

/** Sign out from Supabase and redirect to login. */
export async function clearSession() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
