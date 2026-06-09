import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Remote Browser",
  description: "Remote browser control system — stream and interact with a headless Chromium instance",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
