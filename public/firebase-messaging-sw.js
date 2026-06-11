/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBUEy__b06cgrwtEyni1Qbi-4Ubkw-nhXw",
  authDomain: "nova-taskflow.firebaseapp.com",
  projectId: "nova-taskflow",
  storageBucket: "nova-taskflow.firebasestorage.app",
  messagingSenderId: "579731140205",
  appId: "1:579731140205:web:2c175c9859217795a65964",
  measurementId: "G-YSXMHEVG3C",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notification = payload.notification || {};
  const data = payload.data || {};
  const title = notification.title || data.title || "Nova Taskflow";
  const body =
    notification.body ||
    data.body ||
    data.message ||
    "You have a new workspace notification.";

  self.registration.showNotification(title, {
    body,
    icon: notification.icon || "/logo.png",
    badge: "/logo.png",
    tag: data.notificationId || data.id || "nova-taskflow-notification",
    data: {
      url: data.url || data.link || "/dashboard",
      notificationId: data.notificationId || data.id || null,
    },
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((client) => client.url.includes(url));
        if (existing) return existing.focus();
        return self.clients.openWindow(url);
      }),
  );
});
