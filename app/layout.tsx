import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { ThemeInit } from "@/components/providers/ThemeInit";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ToastProvider } from "@/components/ui/Toast";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nova - Taskflow",
  description: "Task management workspace",
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
};

const themeScript = `
(function () {
  try {
    var isLight = localStorage.getItem("theme") === "light";
    var root = document.documentElement;
    root.classList.toggle("light", isLight);
    root.setAttribute("data-theme", isLight ? "light" : "dark");
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-main font-sans text-primary">
        <Script id="theme-init" strategy="beforeInteractive">
          {themeScript}
        </Script>
        <ThemeProvider>
          <ToastProvider>
            <ThemeInit />
            {children}
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
