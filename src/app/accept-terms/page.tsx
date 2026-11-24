import Link from "next/link";
import { redirect } from "next/navigation";
import { needsTermsAcceptance, PRIVACY_PATH, TERMS_PATH } from "@/legal";
import { getSignedInUser } from "../session";
import { AcceptTermsForm } from "./form";

// Where requireUser() sends a User who hasn't accepted the current terms of use, before anything else.
export default async function AcceptTermsPage() {
  const user = await getSignedInUser();
  if (!user) redirect("/sign-in");
  if (!needsTermsAcceptance(user)) redirect("/");
  return (
    <main className="narrow">
      <h1>Accept the terms of use</h1>
      <p>
        {user.termsVersion
          ? "The terms of use have changed since you last accepted them. Please read them and accept them again to carry on."
          : "Before you start, please read the terms of use and the privacy notice."}
      </p>
      <ul>
        <li>
          <Link href={TERMS_PATH} target="_blank">
            Terms of use
          </Link>
        </li>
        <li>
          <Link href={PRIVACY_PATH} target="_blank">
            Privacy notice
          </Link>
        </li>
      </ul>
      <AcceptTermsForm />
    </main>
  );
}
