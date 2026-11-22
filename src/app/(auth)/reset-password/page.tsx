import Link from "next/link";
import { ResetPasswordForm } from "../account-forms";

type Props = { searchParams: Promise<Record<string, string | undefined>> };

// Opened from the link in the password reset email.
export default async function ResetPasswordPage({ searchParams }: Props) {
  const { token } = await searchParams;
  return (
    <main className="narrow">
      <h1>Choose a new password</h1>
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <p role="alert" className="error">
          This link is missing its code. Open the link from your email again, or ask for a new one.
        </p>
      )}
      <p>
        <Link href="/forgot-password">Ask for a new link</Link>
      </p>
    </main>
  );
}
