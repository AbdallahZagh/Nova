"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE } from "@/lib/auth";

const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

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

export async function clearSession() {
  await clearSessionCookie();
  redirect("/");
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE);
}
