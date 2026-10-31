import { Plus } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { requireSession } from "@/lib/session";
import { AccountMenu } from "./account-menu";

/** The signed-in app: a quiet top bar, then the page. */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await requireSession();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-ink/95 text-white backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/dashboard" aria-label="Your goals">
            <Logo tone="dark" />
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/start"
              className="hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white sm:inline-flex"
            >
              <Plus className="size-4" /> New target job
            </Link>
            <AccountMenu name={session.user.name} email={session.user.email} />
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
