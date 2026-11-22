import Link from "next/link";
import { ForgotPasswordForm } from "../account-forms";

export default function ForgotPasswordPage() {
  return (
    <main className="narrow">
      <h1>Forgot your password?</h1>
      <p>Enter the email address you signed up with, and we'll email you a link to choose a new password.</p>
      <ForgotPasswordForm />
      <p>
        <Link href="/sign-in">Back to sign in</Link>
      </p>
    </main>
  );
}
