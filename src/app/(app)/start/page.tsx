import type { Metadata } from "next";
import { StartWizard } from "./start-wizard";

/** Background work queued here runs after the response (inline jobs); give it room. */
export const maxDuration = 300;

export const metadata: Metadata = { title: "New target job" };

export default function StartPage() {
  return (
    <main className="relative">
      <div className="bg-aurora pointer-events-none absolute inset-x-0 top-0 h-[420px] opacity-60" />
      <div className="relative mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <StartWizard />
      </div>
    </main>
  );
}
