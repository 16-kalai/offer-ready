import {
  BadgeCheck,
  CalendarCheck,
  ExternalLink,
  GitBranch,
  Quote,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LogoMark } from "@/components/logo";
import { getSession } from "@/lib/session";
import { publicPack } from "@/server/packs";
import { ContactButton, TrackedLink, TrackedVideo, Tracker } from "./tracker";

export async function generateMetadata({ params }: PageProps<"/p/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const data = await publicPack(slug);
  if (!data?.pack.publishedAt || !data.pack.kit)
    return { title: "Proof Page", robots: { index: false } };
  return {
    title: { absolute: `${data.pack.kit.claim} · ${data.name.split(" ")[0]}` },
    description: data.pack.kit.evidencePoints.join(" · "),
    robots: { index: false, follow: false },
  };
}

const embed = (url: string | null) => {
  if (!url) return null;
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  const loom = url.match(/loom\.com\/share\/([\w]+)/);
  if (loom) return `https://www.loom.com/embed/${loom[1]}`;
  return null;
};

export default async function ProofPage({ params, searchParams }: PageProps<"/p/[slug]">) {
  const { slug } = await params;
  const { r } = await searchParams;
  const data = await publicPack(slug);
  if (!data?.pack.kit) notFound();
  const session = await getSession();
  const isOwner = session?.user.id === data.goal.ownerId;
  if (!data.pack.publishedAt && !isOwner) notFound();
  const { pack, project, goal, defended } = data;
  const kit = pack.kit;
  if (!kit) notFound();
  const first = data.name.split(" ")[0];
  const code = typeof r === "string" ? r.slice(0, 20) : null;
  const iframe = embed(pack.videoUrl);
  // A hosted upload (Vercel Blob) or any direct video file plays in our own tracked player.
  const direct =
    pack.videoUrl &&
    (/\.(webm|mp4|mov)(\?|$)/i.test(pack.videoUrl) ||
      pack.videoUrl.includes(".blob.vercel-storage.com"))
      ? pack.videoUrl
      : null;
  const track = Boolean(pack.publishedAt) && !isOwner;

  return (
    <div className="min-h-dvh bg-background">
      {track && <Tracker slug={slug} code={code} />}
      {!pack.publishedAt && (
        <div className="bg-warning/20 py-2 text-center text-sm font-medium">
          Preview: only you can see this until you publish.
        </div>
      )}
      {isOwner && pack.publishedAt && (
        <div className="bg-secondary py-2 text-center text-sm text-secondary-foreground">
          You're viewing your own page; your visits aren't counted.
        </div>
      )}
      <div className="relative">
        <div className="bg-aurora pointer-events-none absolute inset-x-0 top-0 h-[480px] opacity-60" />
        <main className="relative mx-auto max-w-3xl px-4 pt-12 pb-20 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-full bg-ink text-sm font-semibold text-white">
              {data.name
                .split(" ")
                .map((p) => p[0])
                .slice(0, 2)
                .join("")}
            </div>
            <div>
              <div className="font-semibold">{data.name}</div>
              <div className="text-sm text-muted-foreground">
                Proof of work for {goal.roleTitle}, {goal.companyName}
              </div>
            </div>
          </div>

          <h1 className="mt-8 text-[30px] font-semibold leading-tight tracking-tight sm:text-[38px]">
            {kit.claim}
          </h1>

          {defended && (
            <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-proof/30 px-3.5 py-1.5 text-sm font-semibold text-proof-foreground">
              <BadgeCheck className="size-4" /> Defended on record ·{" "}
              {defended.at.toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </div>
          )}

          <div className="mt-8 overflow-hidden rounded-3xl bg-ink shadow-2xl shadow-primary/20">
            {pack.videoKey ? (
              <TrackedVideo src={`/api/p/${slug}/video`} slug={slug} code={code} track={track} />
            ) : direct ? (
              <TrackedVideo src={direct} slug={slug} code={code} track={track} />
            ) : iframe ? (
              <iframe
                src={iframe}
                title="Walkthrough"
                className="aspect-video w-full"
                allow="fullscreen; picture-in-picture"
              />
            ) : pack.videoUrl ? (
              <a
                href={pack.videoUrl}
                target="_blank"
                rel="noreferrer"
                className="grid aspect-video place-items-center text-white"
              >
                Watch the walkthrough <ExternalLink className="ml-2 inline size-4" />
              </a>
            ) : (
              <div className="grid aspect-video place-items-center text-white/60">
                Video coming soon
              </div>
            )}
          </div>

          <ul className="mt-8 grid gap-3 sm:grid-cols-3">
            {kit.evidencePoints.map((p) => (
              <li key={p} className="surface p-4 text-sm">
                <Sparkles className="mb-2 size-4 text-primary" />
                {p}
              </li>
            ))}
          </ul>

          <div className="mt-6 flex flex-wrap gap-3">
            {project.demoUrl && (
              <TrackedLink
                href={project.demoUrl}
                slug={slug}
                code={code}
                kind="build"
                track={track}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm"
              >
                <ExternalLink className="size-4" /> Open the live build
              </TrackedLink>
            )}
            {project.repoUrl && (
              <TrackedLink
                href={project.repoUrl}
                slug={slug}
                code={code}
                kind="build"
                track={track}
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-background px-5 text-sm font-medium"
              >
                <GitBranch className="size-4" /> Read the code
              </TrackedLink>
            )}
            {pack.contactUrl && (
              <ContactButton
                href={pack.contactUrl}
                slug={slug}
                code={code}
                track={track}
                label={`Talk to ${first}`}
              />
            )}
          </div>

          {defended && (
            <section className="surface mt-10 p-6">
              <div className="flex items-center gap-2 font-semibold">
                <ShieldCheck className="size-5 text-primary" /> How {first} defended it
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                An AI interviewer questioned {first} on this project, including a twist that changed
                the constraints. Scores are on reasoning, backed by what they said.
              </p>
              <div className="mt-5 space-y-3">
                {defended.skills
                  .filter((s) => s.quote)
                  .slice(0, 3)
                  .map((s) => (
                    <div key={s.name} className="rounded-xl bg-muted/60 p-4">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{s.name}</span>
                        <span className="text-muted-foreground">{s.score}/4</span>
                      </div>
                      <p className="mt-2 flex gap-2 text-sm italic">
                        <Quote className="mt-0.5 size-3.5 shrink-0 text-primary" />"{s.quote}"
                      </p>
                    </div>
                  ))}
              </div>
            </section>
          )}

          <section className="mt-10 space-y-5">
            <h2 className="text-lg font-semibold">The problem</h2>
            <p className="text-[15px] leading-relaxed text-muted-foreground">
              {project.idea.problem}
            </p>
            {project.summary && (
              <>
                <h2 className="text-lg font-semibold">What I built and found</h2>
                <p className="text-[15px] leading-relaxed text-muted-foreground">
                  {project.summary}
                </p>
              </>
            )}
            {project.trail.length > 0 && (
              <>
                <h2 className="text-lg font-semibold">Where I overruled the AI</h2>
                <ul className="space-y-2">
                  {project.trail.map((t) => (
                    <li key={t.at} className="rounded-xl border border-border/80 p-4 text-sm">
                      <span className="text-muted-foreground">The AI suggested {t.aiSaid}.</span> I{" "}
                      {t.iDid}, because {t.why}.
                    </li>
                  ))}
                </ul>
              </>
            )}
            {project.idea.evidence.some((e) => e.url) && (
              <>
                <h2 className="text-lg font-semibold">Public evidence I started from</h2>
                <ul className="space-y-1.5 text-sm">
                  {project.idea.evidence
                    .filter((e) => e.url)
                    .map((e) => (
                      <li key={e.claim}>
                        <a
                          href={e.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-start gap-1.5 text-primary hover:underline"
                        >
                          <ExternalLink className="mt-0.5 size-3.5 shrink-0" /> {e.claim}
                        </a>
                      </li>
                    ))}
                </ul>
              </>
            )}
            <p className="text-xs text-muted-foreground">
              Based on public information only. {first} doesn't work for {goal.companyName} and this
              isn't affiliated with them.
            </p>
          </section>

          <footer className="mt-14 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <LogoMark className="size-5" /> Practised and defended on Offer Ready
            <CalendarCheck className="size-3.5" />
          </footer>
        </main>
      </div>
    </div>
  );
}
