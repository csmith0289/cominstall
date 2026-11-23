import type { Metadata } from "next";
import Link from "next/link";
import { PRIVACY_PATH } from "@/legal";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = { title: "Terms of use – Com-Install Job Cards" };

// DRAFT wording, until the user supplies the agreed final text (ticket 11). Bump TERMS_VERSION in src/legal when the
// final text goes in, so every User accepts it.
export default function TermsPage() {
  return (
    <LegalPage title="Terms of use">
      <h2>1. Who these terms are for</h2>
      <p>
        Com-Install Job Cards is a private app run for Com-Install Ltd. Only Users with an account may use it: Engineers and Admins
        invited by an Admin. By ticking &ldquo;I have read and accept the terms of use&rdquo; you agree to these terms.
      </p>
      <h2>2. What the app is for</h2>
      <p>
        Use the app only for Com-Install work: recording the jobs you do on Vehicles as Job Cards, and, for Admins, tracking Job Cards
        and managing Users. Don&apos;t use it for anything else.
      </p>
      <h2>3. Your account</h2>
      <ul>
        <li>Keep your password to yourself and don&apos;t share your account.</li>
        <li>Tell an Admin straight away if you think someone else has used your account, or if you lose a phone that is signed in.</li>
        <li>An Admin can change your Role or deactivate your account, for example when you leave Com-Install.</li>
      </ul>
      <h2>4. What you enter</h2>
      <ul>
        <li>Make each Job Card accurate and complete: the Vehicle, Customer, mileage, Work Carried Out and Parts Used.</li>
        <li>Only enter the Customer details the job needs. Don&apos;t enter anything unrelated to the job.</li>
        <li>Customer and job details are confidential to Com-Install. Don&apos;t copy them out of the app except to send a Job Card PDF as part of your work.</li>
      </ul>
      <h2>5. Support</h2>
      <p>
        The app&apos;s developer supports it under a confidentiality agreement with Com-Install. They can see the data in the app to fix
        problems, and every change they make is recorded in the Audit Log.
      </p>
      <h2>6. Availability</h2>
      <p>
        We aim to keep the app working, but it may sometimes be unavailable, for example for updates. If it is, record the job on a paper
        job card and enter it later.
      </p>
      <h2>7. Changes to these terms</h2>
      <p>
        If these terms change, the app asks you to read and accept them again before you carry on. How your information is handled is set
        out in the <Link href={PRIVACY_PATH}>privacy notice</Link>.
      </p>
    </LegalPage>
  );
}
