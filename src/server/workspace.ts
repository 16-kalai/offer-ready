import "server-only";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db/client";
import { type Workspace, workspaces } from "@/db/schema";
import { requireSession } from "@/lib/session";
import { CONSENT_VERSION } from "@/lib/workspace";

export const getWorkspace = cache(async (ownerId: string): Promise<Workspace | null> => {
  const [row] = await db()
    .select()
    .from(workspaces)
    .where(eq(workspaces.ownerId, ownerId))
    .limit(1);
  return row ?? null;
});

/** Signed in and onboarded, or redirected to the step that is missing. */
export async function requireWorkspace() {
  const session = await requireSession();
  const workspace = await getWorkspace(session.user.id);
  if (!workspace) redirect("/onboarding");
  return { ...session, workspace };
}

/** Idempotent: a double submit or a retry updates the same row. */
export async function saveWorkspace(
  ownerId: string,
  input: { companyName: string; senderName: string; replyToEmail: string; website: string | null },
) {
  const values = { ...input, consentAt: new Date(), consentVersion: CONSENT_VERSION };
  await db()
    .insert(workspaces)
    .values({ ownerId, ...values })
    .onConflictDoUpdate({ target: workspaces.ownerId, set: values });
}
