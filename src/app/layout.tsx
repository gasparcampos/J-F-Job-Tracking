import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Job Tracker - Machine Shop Management System",
  description: "Professional job tracking system for machine shops. Manage your jobs with a Kanban board, drag & drop, and full tracking.",
  keywords: ["Job Tracker", "Machine Shop", "Kanban", "Management", "Tracking", "Jobs"],
  authors: [{ name: "J&F Machine Shop" }],
  icons: {
    icon: "/logo.svg",
  },
  // Chrome's auto-translate rewrites text nodes behind React's back, which
  // crashes the page on the next update (e.g. saving a note on the floor).
  other: { google: "notranslate" },
  openGraph: {
    title: "Job Tracker - Machine Shop Management System",
    description: "Manage your jobs with a Kanban board and full tracking",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" translate="no" className="notranslate" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
