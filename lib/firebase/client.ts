"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAnalytics, isSupported as isAnalyticsSupported } from "firebase/analytics";
import {
  getMessaging,
  isSupported as isMessagingSupported,
  type Messaging,
} from "firebase/messaging";

export const firebaseConfig = {
  apiKey: "AIzaSyBUEy__b06cgrwtEyni1Qbi-4Ubkw-nhXw",
  authDomain: "nova-taskflow.firebaseapp.com",
  projectId: "nova-taskflow",
  storageBucket: "nova-taskflow.firebasestorage.app",
  messagingSenderId: "579731140205",
  appId: "1:579731140205:web:2c175c9859217795a65964",
  measurementId: "G-YSXMHEVG3C",
};

export const FIREBASE_VAPID_KEY =
  "LBureKTt2M3z2zYkp-9NjdnIbj24ftislT7wGW6NHfI";

export function getFirebaseApp(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export async function initFirebaseAnalytics() {
  if (typeof window === "undefined") return null;
  if (!(await isAnalyticsSupported())) return null;
  return getAnalytics(getFirebaseApp());
}

export async function getFirebaseMessaging(): Promise<Messaging | null> {
  if (typeof window === "undefined") return null;
  if (!(await isMessagingSupported())) return null;
  return getMessaging(getFirebaseApp());
}
