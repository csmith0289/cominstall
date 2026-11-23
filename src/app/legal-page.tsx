import type { ReactNode } from "react";
import { LEGAL_TEXT_IS_DRAFT, TERMS_VERSION } from "@/legal";

// The frame of /terms and /privacy: open to everyone, signed in or not, with a DRAFT banner until the final text is in.
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="narrow legal">
      <h1>{title}</h1>
      {LEGAL_TEXT_IS_DRAFT && (
        <p className="draft-banner" role="note">
          DRAFT: this text is a draft and isn&apos;t final yet.
        </p>
      )}
      <p className="muted">Version {TERMS_VERSION}</p>
      {children}
    </main>
  );
}
