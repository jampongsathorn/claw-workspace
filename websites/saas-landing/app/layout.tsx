import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nova — Put your busywork on autopilot",
  description:
    "Nova is the AI workflow platform that connects your tools, automates the repetitive work, and keeps your team focused on the decisions that matter.",
  keywords: [
    "AI workflows",
    "automation platform",
    "AI agents",
    "SaaS",
    "productivity",
  ],
  openGraph: {
    title: "Nova — Put your busywork on autopilot",
    description:
      "The AI workflow platform for teams who would rather build than babysit processes.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#05060a",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
