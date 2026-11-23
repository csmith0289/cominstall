"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDatabase } from "@/db";
import { acceptTerms } from "@/legal";
import { isOperator } from "@/operator";
import { getSignedInUser } from "../session";

export type AcceptTermsState = { error?: string };

export async function accept(_state: AcceptTermsState, form: FormData): Promise<AcceptTermsState> {
  const user = await getSignedInUser();
  if (!user) redirect("/sign-in");
  if (form.get("agree") !== "on") return { error: "Tick the box to accept the terms of use." };
  await acceptTerms(await getDatabase(), { userId: user.id, asOperator: isOperator(user) });
  // The header was drawn without My Jobs and Admin: draw it again.
  revalidatePath("/", "layout");
  redirect("/");
}
