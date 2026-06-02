"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE } from "@/lib/auth";

const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

/** Mark the browser session as authenticated (middleware gate). */
export async function establishSession() {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE, "authenticated", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

/** Clear session cookie and redirect to login. */
export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE);
  redirect("/");
}
