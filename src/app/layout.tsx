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
  title: "MiMo AI — Engineering Intelligence Platform",
  description: "Autonomous AI engineering system with 10 agents, 6 tools, and 69 skills. Plan, research, build, test, and deliver.",
  keywords: ["MiMo AI", "AI Engineering", "Autonomous Agents", "Multi-Agent", "Next.js", "TypeScript"],
  authors: [{ name: "MiMo AI" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "MiMo AI — Engineering Intelligence Platform",
    description: "Autonomous AI engineering system",
    siteName: "MiMo AI",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "MiMo AI",
    description: "Autonomous AI engineering system",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
