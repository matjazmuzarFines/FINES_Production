import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "Fines - Production",
  description: "FINES d.o.o. - proizvodnja in skladišče",
};

export const viewport: Viewport = {
  themeColor: "#ca5010",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="sl" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
