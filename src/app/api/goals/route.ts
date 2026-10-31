import { z } from "zod";
import { getSession } from "@/lib/session";
import { createGoal, GoalError } from "@/server/goals";
import { allow } from "@/server/rate-limit";

/** Background work queued here runs after the response (inline jobs); give it room. */
export const maxDuration = 300;

/**
 * Creates a goal from the start wizard: the JD, the resume file and the
 * timeline. Multipart, because resumes are files.
 */
const MAX_BYTES = 8 * 1024 * 1024;
const fields = z.object({
  companyName: z.string().trim().min(2).max(100),
  roleTitle: z.string().trim().min(2).max(120),
  jobDescription: z.string().trim().min(150, "Paste the full job description.").max(20_000),
  interviewDate: z
    .string()
    .trim()
    .max(20)
    .transform((v) => (v ? new Date(`${v}T09:00:00`) : null))
    .refine(
      (d) => d === null || (!Number.isNaN(d.getTime()) && d.getTime() > Date.now() - 86_400_000),
      "Pick a date from today on.",
    ),
  minutesPerDay: z.coerce.number().int().min(15).max(180),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Log in again." }, { status: 401 });
  if (!(await allow(`goal:${session.user.id}`, 10, 3600)))
    return Response.json(
      { error: "That's a lot of new goals. Try again in an hour." },
      { status: 429 },
    );
  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "Couldn't read the form." }, { status: 400 });
  const parsed = fields.safeParse(
    Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")),
  );
  if (!parsed.success)
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Check the form." },
      { status: 400 },
    );
  const file = form.get("resume");
  if (!(file instanceof File) || file.size === 0)
    return Response.json({ error: "Add your resume (PDF or Word)." }, { status: 400 });
  if (file.size > MAX_BYTES)
    return Response.json({ error: "Resumes up to 8 MB." }, { status: 400 });
  const name = file.name.toLowerCase();
  const fileType = name.endsWith(".pdf") ? "pdf" : name.endsWith(".docx") ? "docx" : null;
  if (!fileType) return Response.json({ error: "Upload a PDF or .docx resume." }, { status: 400 });

  try {
    const id = await createGoal({
      user: { id: session.user.id, name: session.user.name, email: session.user.email },
      ...parsed.data,
      resume: { bytes: new Uint8Array(await file.arrayBuffer()), fileType },
    });
    return Response.json({ id });
  } catch (error) {
    if (error instanceof GoalError) return Response.json({ error: error.message }, { status: 400 });
    console.error("[goals] create failed", error);
    return Response.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
