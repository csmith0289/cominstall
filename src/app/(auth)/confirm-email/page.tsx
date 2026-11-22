import Link from "next/link";
import { getSignedInUser } from "../../session";
import { ResendConfirmationForm } from "../account-forms";

type Props = { searchParams: Promise<Record<string, string | undefined>> };

// Where the "Confirm your email" link lands. Better Auth has already confirmed the address, or added `error`.
export default async function ConfirmEmailPage({ searchParams }: Props) {
  const { error } = await searchParams;
  const user = await getSignedInUser();
  if (error) {
    return (
      <main className="narrow">
        <h1>That link didn't work</h1>
        <p role="alert" className="error">
          {error === "TOKEN_EXPIRED" ? "The link has expired: each link works for 1 hour." : "The link isn't valid."}
        </p>
        {user && !user.emailVerified ? (
          <ResendConfirmationForm />
        ) : (
          <p>
            <Link href="/sign-in">Sign in</Link> and send a new link from the banner at the top of the page.
          </p>
        )}
      </main>
    );
  }
  return (
    <main className="narrow">
      <h1>Email address confirmed</h1>
      <p>Thank you.</p>
      <p>{user ? <Link href="/">Go to My Jobs</Link> : <Link href="/sign-in">Sign in</Link>}</p>
    </main>
  );
}
