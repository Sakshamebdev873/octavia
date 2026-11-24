import type { Metadata, Viewport } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Flowlet", template: "%s · Flowlet" },
  description: "Mini webhook automation service",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <nav aria-label="Main">
            <Link href="/flows" className="brand">
              Flowlet
            </Link>
            <Link href="/flows">Flows</Link>
            <Link href="/flows/new" className="button button-primary button-small">
              New flow
            </Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
