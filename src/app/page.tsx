import { redirect } from "next/navigation";
import { getSignedInUser } from "./session";

export default async function HomePage() {
  redirect((await getSignedInUser()) ? "/jobs" : "/sign-in");
}
