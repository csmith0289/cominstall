import Link from "next/link";
import { PRIVACY_PATH, TERMS_PATH } from "@/legal";
import { signIn } from "../actions";
import { AuthForm } from "../auth-form";

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function SignInPage({ searchParams }: Props) {
  const { reset } = await searchParams;
  return (
    <main className="narrow">
      <h1>Sign in</h1>
      {reset === "done" && <p role="status">Your password is changed. Sign in with your new password.</p>}
      <AuthForm action={signIn} submitLabel="Sign in" />
      <p>
        <Link href="/forgot-password">Forgot your password?</Link>
      </p>
      <p>
        Been invited? Open the link in your invitation email to set up your account.
      </p>
      <p className="muted">
        Setting up the app as its first Admin? <Link href="/sign-up">Create your account</Link>
      </p>
      <p>
        Read the <Link href={TERMS_PATH}>terms of use</Link> and the <Link href={PRIVACY_PATH}>privacy notice</Link>.
      </p>
    </main>
  );
}
