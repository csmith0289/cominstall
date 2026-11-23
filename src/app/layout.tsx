import type { Metadata, Viewport } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { needsTermsAcceptance, PRIVACY_PATH, TERMS_PATH } from "@/legal";
import { signOut } from "./(auth)/actions";
import { getSignedInUser } from "./session";
import "./globals.css";

export const metadata: Metadata = {
  title: "Job Cards – Com-Install",
  description: "Com-Install Ltd job cards",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#1f1f1f" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getSignedInUser();
  const needsTerms = !!user && needsTermsAcceptance(user);
  return (
    <html lang="en-GB">
      <body>
        <header className="site-header">
          <Link href="/" className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/cominstall-logo.jpg" alt="Com-Install" width={56} height={46} />
            <span>Job Cards</span>
          </Link>
          {user && (
            <nav>
              {/* Until the current terms are accepted, the only way on is to accept them (or sign out). */}
              {!needsTerms && <Link href="/jobs">My Jobs</Link>}
              {!needsTerms && user.role === "admin" && <Link href="/admin">Admin</Link>}
              <form action={signOut}>
                <button type="submit" className="link">
                  Sign out
                </button>
              </form>
            </nav>
          )}
        </header>
        {children}
        <footer className="site-footer">
          <Link href={TERMS_PATH}>Terms of use</Link>
          <Link href={PRIVACY_PATH}>Privacy notice</Link>
        </footer>
      </body>
    </html>
  );
}
