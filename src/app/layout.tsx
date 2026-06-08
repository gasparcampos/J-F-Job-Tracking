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
  title: "Job Tracker - Sistema de Gestión de Taller",
  description: "Sistema profesional de seguimiento de trabajos para talleres. Gestiona tus trabajos con tablero Kanban, drag & drop y tracking completo.",
  keywords: ["Job Tracker", "Taller", "Kanban", "Gestión", "Tracking", "Trabajos"],
  authors: [{ name: "Tu Nombre" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "Job Tracker - Sistema de Gestión de Taller",
    description: "Gestiona tus trabajos con tablero Kanban y tracking completo",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
