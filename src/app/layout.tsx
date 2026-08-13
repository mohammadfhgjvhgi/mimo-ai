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

// P6-5: Security headers
export const headers = () => {
  return {
    "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:; frame-src 'self';",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  };
};

export const metadata: Metadata = {
  title: "MiMo AI — Engineering Intelligence Platform",
  description: "Autonomous AI engineering system with 12 agents, 15 tools, and 69 skills. Plan, research, build, test, and deliver.",
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
