"use server";

import { clearSession } from "@/app/actions/session";

/** Server-only cookie clear + redirect. Client should call logout API first. */
export async function logout() {
  await clearSession();
}
