import type { Metadata } from "next";
import Link from "next/link";
import { TERMS_PATH } from "@/legal";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = { title: "Privacy notice – Com-Install Job Cards" };

// DRAFT wording, until the user supplies the agreed final text (ticket 11). The Job Card PDF footer links here.
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy notice">
      <h2>Who is responsible for your information</h2>
      <p>
        Com-Install Ltd decides how the information in Com-Install Job Cards is used. To ask about it, or to use any of your rights below,
        contact an Admin at Com-Install.
      </p>
      <h2>What the app holds</h2>
      <ul>
        <li>About Users: name, email address, Role, whether the account is active, when you last signed in, and when you accepted the terms of use.</li>
        <li>About jobs: Job Cards (date, Vehicle and Reg, Customer, mileage, Work Carried Out and Parts Used), and which Engineer each belongs to.</li>
        <li>About Customers: the business or person a Vehicle belongs to, and the contact details entered for them.</li>
        <li>The Audit Log: who changed a Job Card&apos;s Status, reassigned it, or changed a User, and when.</li>
      </ul>
      <p>The app doesn&apos;t record your location, IP address or device, and uses only the cookie that keeps you signed in.</p>
      <h2>Why</h2>
      <p>
        To record the work done on Vehicles, run Com-Install&apos;s business, send Customers their Job Card PDFs, and keep a record of who
        changed what. Com-Install relies on its legitimate interests, and on its contracts with its staff and Customers.
      </p>
      <h2>Who else sees it</h2>
      <ul>
        <li>Admins at Com-Install see every Job Card and every User. Engineers see only their own Job Cards.</li>
        <li>The app&apos;s developer, who supports it under a confidentiality agreement with Com-Install.</li>
        <li>The services that run the app: hosting, the database and email delivery, each acting only on Com-Install&apos;s instructions.</li>
      </ul>
      <h2>How long it is kept</h2>
      <p>Job Cards are kept as Com-Install&apos;s business records. A User who leaves is deactivated, and their Job Cards stay.</p>
      <h2>Your rights</h2>
      <p>
        Under UK data protection law you can ask to see the information held about you, and ask for it to be corrected or deleted. You
        can also complain to the Information Commissioner&apos;s Office (ico.org.uk).
      </p>
      <p>
        See also the <Link href={TERMS_PATH}>terms of use</Link>.
      </p>
    </LegalPage>
  );
}
