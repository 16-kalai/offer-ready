import { z } from "zod";

/** Bump when the consent wording changes; stored with each workspace for audit. */
export const CONSENT_VERSION = "2026-10-26";

/** Accepts "acme.com" or "https://acme.com/careers"; stores the origin. Empty means none. */
const website = z
  .string()
  .trim()
  .max(200)
  .transform((value, ctx) => {
    if (!value) return null;
    try {
      const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
      if (!url.hostname.includes(".")) throw new Error();
      return url.origin;
    } catch {
      ctx.addIssue({ code: "custom", message: "That doesn't look like a website. Try acme.com." });
      return z.NEVER;
    }
  });

/** One schema per step, so the form checks each answer before moving on; the server checks all. */
export const onboardingFields = {
  companyName: z
    .string()
    .trim()
    .min(2, "Enter your company's name.")
    .max(100, "That's a bit long."),
  senderName: z
    .string()
    .trim()
    .min(2, "Enter the name candidates will see.")
    .max(80, "That's a bit long."),
  replyToEmail: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
  website,
  consent: z.literal("yes", { message: "Please confirm to continue." }),
};

export const onboardingSchema = z.object(onboardingFields);
export type OnboardingInput = z.input<typeof onboardingSchema>;
