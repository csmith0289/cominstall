import Link from "next/link";
import { signUp } from "../actions";
import { AuthForm } from "../auth-form";

export default function SignUpPage() {
  return (
    <main className="narrow">
      <h1>Create your account</h1>
      <p>Been invited? Open the link in your invitation email to set up your account.</p>
      <AuthForm action={signUp} submitLabel="Create account" askName />
      <p>
        Already have an account? <Link href="/sign-in">Sign in</Link>
      </p>
    </main>
  );
}
