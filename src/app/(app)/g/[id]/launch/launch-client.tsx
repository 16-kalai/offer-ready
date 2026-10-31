"use client";

import { upload as uploadToBlob } from "@vercel/blob/client";
import {
  BadgeCheck,
  Camera,
  Check,
  CircleDashed,
  Copy,
  ExternalLink,
  Eye,
  Link2,
  Loader2,
  Mail,
  MessageSquareReply,
  PlayCircle,
  Rocket,
  Square,
  Users,
  Video,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Panel } from "@/components/coach/section";
import { VoiceOrb } from "@/components/coach/voice-orb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { LaunchKit } from "@/lib/coach/types";
import { cn } from "@/lib/utils";
import { createLink, markReplied, prepareLaunch, publishPack, savePack } from "../actions";

/** LinkedIn's mark (lucide no longer ships brand icons). */
function Linkedin({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
    </svg>
  );
}

type Channel = "post" | "dm" | "referral" | "resume" | "other";
type LinkRow = {
  id: string;
  code: string;
  channel: Channel;
  label: string;
  replied: boolean;
  opens: number;
  watched: number;
};
type View = {
  viewId: string;
  openedAt: string;
  watched: number;
  build: boolean;
  contact: boolean;
  label: string | null;
  channel: string | null;
};

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  return m < 1
    ? "just now"
    : m < 60
      ? `${m} min ago`
      : m < 1440
        ? `${Math.round(m / 60)} h ago`
        : `${Math.round(m / 1440)} d ago`;
};

export function StartLaunch({ goalId }: { goalId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="surface flex flex-col items-center px-6 py-14 text-center">
      <VoiceOrb size={96} state="speaking" />
      <Button
        size="lg"
        className="mt-8 h-12 gap-2 px-6"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await prepareLaunch(goalId);
            if (!r.ok) toast.error(r.error);
            router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}{" "}
        Write my launch kit
      </Button>
    </div>
  );
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      className="gap-1.5"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{" "}
      {done ? "Copied" : label}
    </Button>
  );
}

function GateItem({ ok, title, note }: { ok: boolean; title: string; note: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border p-4",
        ok ? "border-success/30 bg-success/5" : "border-border",
      )}
    >
      {ok ? (
        <BadgeCheck className="mt-0.5 size-5 shrink-0 text-success" />
      ) : (
        <CircleDashed className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
      )}
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{note}</div>
      </div>
    </div>
  );
}

/** Records a webcam walkthrough with the script as a teleprompter, then uploads it. */
function VideoRecorder({
  goalId,
  script,
  hosted,
  onUploaded,
}: {
  goalId: string;
  script: LaunchKit["script"];
  /** Upload straight to Vercel Blob (hosted), or through the app (local). */
  hosted: boolean;
  onUploaded: () => void;
}) {
  const preview = useRef<HTMLVideoElement>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const [state, setState] = useState<"idle" | "ready" | "recording" | "review" | "uploading">(
    "idle",
  );
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const total = script.reduce((a, b) => a + b.seconds, 0);
  // The teleprompter shows the beat the clock is in.
  const ends = script.map((_, i) => script.slice(0, i + 1).reduce((a, b) => a + b.seconds, 0));
  const beat = script[ends.findIndex((end) => end > seconds)] ?? script.at(-1);

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      for (const t of (preview.current?.srcObject as MediaStream | null)?.getTracks() ?? [])
        t.stop();
    },
    [],
  );

  async function open() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: true,
      });
      if (preview.current) {
        preview.current.srcObject = stream;
        preview.current.muted = true;
        await preview.current.play();
      }
      setState("ready");
    } catch {
      toast.error("Allow camera and microphone to record, or paste a Loom/YouTube link instead.");
    }
  }
  function record() {
    const stream = preview.current?.srcObject as MediaStream | null;
    if (!stream) return;
    const mime = ["video/webm;codecs=vp9,opus", "video/webm", "video/mp4"].find((m) =>
      MediaRecorder.isTypeSupported(m),
    );
    const r = new MediaRecorder(
      stream,
      mime ? { mimeType: mime, videoBitsPerSecond: 2_000_000 } : undefined,
    );
    chunks.current = [];
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    r.onstop = () => {
      const b = new Blob(chunks.current, { type: (r.mimeType || "video/webm").split(";")[0] });
      setBlob(b);
      setState("review");
      if (preview.current) {
        preview.current.srcObject = null;
        preview.current.src = URL.createObjectURL(b);
        preview.current.muted = false;
      }
      for (const t of stream.getTracks()) t.stop();
    };
    rec.current = r;
    r.start(1000);
    setSeconds(0);
    setState("recording");
    timer.current = setInterval(() => {
      setSeconds((s) => {
        if (s + 1 < 150) return s + 1;
        if (r.state === "recording") r.stop();
        return s;
      });
    }, 1000);
  }
  function stop() {
    if (timer.current) clearInterval(timer.current);
    rec.current?.state === "recording" && rec.current.stop();
  }
  async function upload() {
    if (!blob) return;
    setState("uploading");
    if (hosted) {
      try {
        const ext = blob.type.includes("mp4") ? "mp4" : "webm";
        const done = await uploadToBlob(`videos/${goalId}/walkthrough.${ext}`, blob, {
          access: "public",
          handleUploadUrl: `/api/goals/${goalId}/video/blob`,
          contentType: blob.type,
        });
        const r = await savePack(goalId, { videoUrl: done.url });
        if (!r.ok) throw new Error(r.error);
        toast.success("Video saved.");
        onUploaded();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Upload failed.");
        setState("review");
      }
      return;
    }
    const res = await fetch(`/api/goals/${goalId}/video`, {
      method: "POST",
      body: blob,
      headers: { "content-type": blob.type },
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      toast.error(body.error ?? "Upload failed.");
      setState("review");
      return;
    }
    toast.success("Video saved.");
    onUploaded();
  }

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl bg-ink">
        {/* biome-ignore lint/a11y/useMediaCaption: live camera preview */}
        <video
          ref={preview}
          playsInline
          className={cn("aspect-video w-full object-cover", state === "idle" && "hidden")}
          controls={state === "review"}
        />
        {state === "idle" && (
          <button
            type="button"
            onClick={open}
            className="grid aspect-video w-full place-items-center text-white/80 hover:text-white"
          >
            <span className="flex flex-col items-center gap-2">
              <Camera className="size-10" /> Turn on camera
            </span>
          </button>
        )}
        {state === "recording" && beat && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-5 text-white">
            <div className="text-xs font-semibold uppercase tracking-wider text-proof">
              {beat.beat}
            </div>
            <p className="mt-1 text-lg font-medium leading-snug">{beat.line}</p>
          </div>
        )}
        {state === "recording" && (
          <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-sm font-medium text-white">
            <span className="size-2 animate-pulse rounded-full bg-red-500" /> {clock(seconds)} /{" "}
            {clock(total)}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {state === "ready" && (
          <Button onClick={record} className="gap-2">
            <Video className="size-4" /> Start recording
          </Button>
        )}
        {state === "recording" && (
          <Button onClick={stop} variant="destructive" className="gap-2">
            <Square className="size-3.5 fill-current" /> Stop
          </Button>
        )}
        {(state === "review" || state === "uploading") && (
          <>
            <Button onClick={upload} disabled={state === "uploading"} className="gap-2">
              {state === "uploading" && <Loader2 className="size-4 animate-spin" />} Use this take
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setBlob(null);
                setState("idle");
              }}
              disabled={state === "uploading"}
            >
              Record again
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export function LaunchKitView(props: {
  goalId: string;
  companyName: string;
  kit: LaunchKit;
  slug: string;
  baseUrl: string;
  hostedUploads: boolean;
  published: boolean;
  hasVideo: boolean;
  videoUrl: string | null;
  contactUrl: string | null;
  defended: boolean;
  people: { title: string; why: string }[];
  links: LinkRow[];
  views: View[];
}) {
  const { goalId, kit, slug, baseUrl } = props;
  const router = useRouter();
  const [claim, setClaim] = useState(kit.claim);
  const [videoUrl, setVideoUrl] = useState(props.videoUrl ?? "");
  const [contact, setContact] = useState(props.contactUrl ?? "");
  const [label, setLabel] = useState("");
  const [busy, start] = useTransition();
  const pageUrl = `${baseUrl}/p/${slug}`;
  const linkFor = (channel: Channel) => {
    const l = props.links.find((x) => x.channel === channel);
    return l ? `${pageUrl}?r=${l.code}` : pageUrl;
  };
  const fill = (text: string, channel: Channel) => text.replaceAll("[link]", linkFor(channel));
  const gate = {
    defended: props.defended,
    video: props.hasVideo,
    claim: kit.sevenSecond.pass,
  };
  const canPublish = gate.defended && gate.video;
  const search = (q: string) =>
    `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(q)}`;

  function act(fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) {
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error ?? "Something went wrong.");
      else if (success) toast.success(success);
      router.refresh();
    });
  }

  const tracking = (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <Panel
        title="Tracked links"
        description="One per person or channel, so you know exactly who looked."
      >
        <div className="flex flex-wrap gap-2">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. DM to Payments EM"
            className="min-w-0 flex-1"
          />
          {(["dm", "post", "referral", "resume"] as const).map((c) => (
            <Button
              key={c}
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  const r = await createLink(goalId, {
                    channel: c,
                    label:
                      label ||
                      {
                        dm: "Direct message",
                        post: "LinkedIn post",
                        referral: "Referral",
                        resume: "Resume",
                      }[c],
                  });
                  if (r.ok) setLabel("");
                  return r;
                })
              }
            >
              + {c === "dm" ? "DM" : c[0].toUpperCase() + c.slice(1)}
            </Button>
          ))}
        </div>
        <div className="mt-4 space-y-2">
          {props.links.length === 0 && (
            <p className="text-sm text-muted-foreground">No links yet.</p>
          )}
          {props.links.map((l) => (
            <div
              key={l.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-border/80 p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{l.label}</div>
                <div className="truncate text-xs text-muted-foreground">
                  …/p/{slug}?r={l.code}
                </div>
              </div>
              <span className="text-xs text-muted-foreground">
                {l.opens} open{l.opens === 1 ? "" : "s"}
                {l.watched > 0 && ` · watched ${clock(l.watched)}`}
              </span>
              <span className="flex items-center gap-1.5 text-xs">
                <Switch
                  aria-label={`${l.label} replied`}
                  checked={l.replied}
                  onCheckedChange={(v) => act(() => markReplied(goalId, l.id, v))}
                />{" "}
                Replied
              </span>
              <CopyButton text={`${pageUrl}?r=${l.code}`} label="Link" />
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title={
          <span className="inline-flex items-center gap-2">
            <Eye className="size-4 text-primary" />
            Live activity
          </span>
        }
        description={props.published ? "Updates every few seconds." : "Starts once you publish."}
      >
        {props.views.length === 0 ? (
          <p className="text-sm text-muted-foreground">No views yet.</p>
        ) : (
          <ul className="space-y-2.5">
            {props.views.map((v) => (
              <li
                key={v.viewId}
                className="animate-rise flex items-start gap-3 rounded-xl bg-muted/50 p-3"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-proof/30">
                  <Eye className="size-4 text-proof-foreground" />
                </span>
                <div className="text-sm">
                  <div className="font-medium">
                    Opened{v.label ? ` from "${v.label}"` : " (direct link)"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {ago(v.openedAt)}
                    {v.watched > 0 && ` · watched ${clock(v.watched)}`}
                    {v.build && " · opened your build"}
                    {v.contact && " · tapped contact"}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );

  return (
    <div className="space-y-6">
      {props.published ? (
        <section className="surface relative overflow-hidden p-6">
          <div className="bg-aurora pointer-events-none absolute inset-0 opacity-50" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
            <Badge className="w-fit gap-1.5 bg-proof px-3 py-1.5 text-sm font-semibold text-proof-foreground">
              <BadgeCheck className="size-4" /> Live
            </Badge>
            <code className="flex-1 truncate rounded-lg bg-background/80 px-3 py-2 text-sm">
              {pageUrl}
            </code>
            <div className="flex gap-2">
              <CopyButton text={pageUrl} />
              <Button asChild size="sm" variant="outline" className="gap-1.5">
                <a href={`/p/${slug}`} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-3.5" /> View
                </a>
              </Button>
            </div>
          </div>
        </section>
      ) : null}
      {props.published && tracking}
      {!props.published && (
        <Panel
          title="Quality gate"
          description="Your page goes live only when it's worth a recruiter's 7 seconds."
        >
          <div className="grid gap-3 md:grid-cols-3">
            <GateItem
              ok={gate.defended}
              title="Defended on record"
              note={gate.defended ? "Your defense passed." : "Pass your defense interview."}
            />
            <GateItem
              ok={gate.video}
              title="2-minute video"
              note={gate.video ? "Video added." : "Record it below or paste a link."}
            />
            <GateItem ok={gate.claim} title="7-second test" note={kit.sevenSecond.note} />
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              className="gap-2"
              disabled={!canPublish || busy}
              onClick={() => act(() => publishPack(goalId), "Your Proof Page is live.")}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}{" "}
              Publish my Proof Page
            </Button>
            <Button asChild variant="ghost" className="gap-1.5">
              <a href={`/p/${slug}`} target="_blank" rel="noreferrer">
                <Eye className="size-4" /> Preview
              </a>
            </Button>
          </div>
        </Panel>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Your 7-second claim" description="The first line a recruiter reads.">
          <Textarea
            value={claim}
            onChange={(e) => setClaim(e.target.value)}
            className="min-h-[80px] text-[15px] font-medium"
            maxLength={130}
          />
          <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
            {kit.evidencePoints.map((p) => (
              <li key={p} className="flex gap-2">
                <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
                {p}
              </li>
            ))}
          </ul>
          <div className="mt-4 space-y-2">
            <Input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="Your LinkedIn or calendar link (for 'Talk to me')"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => act(() => savePack(goalId, { claim, contactUrl: contact }), "Saved.")}
            >
              Save
            </Button>
          </div>
        </Panel>

        <Panel
          title="Your 2-minute video"
          description="Record with the script as a teleprompter, or paste a Loom/YouTube link."
        >
          <Tabs defaultValue="record">
            <TabsList className="mb-3">
              <TabsTrigger value="record">Record here</TabsTrigger>
              <TabsTrigger value="script">Script</TabsTrigger>
              <TabsTrigger value="link">Paste a link</TabsTrigger>
            </TabsList>
            <TabsContent value="record">
              {props.hasVideo && !props.videoUrl && (
                <p className="mb-3 flex items-center gap-1.5 text-sm text-success">
                  <PlayCircle className="size-4" /> A video is saved. Record again to replace it.
                </p>
              )}
              <VideoRecorder
                goalId={goalId}
                script={kit.script}
                hosted={props.hostedUploads}
                onUploaded={() => router.refresh()}
              />
            </TabsContent>
            <TabsContent value="script">
              <ol className="space-y-3">
                {kit.script.map((b) => (
                  <li key={b.beat} className="rounded-xl border border-border/80 p-3.5">
                    <div className="flex justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <span>{b.beat}</span>
                      <span>{b.seconds}s</span>
                    </div>
                    <p className="mt-1 text-sm">{b.line}</p>
                  </li>
                ))}
              </ol>
            </TabsContent>
            <TabsContent value="link">
              <div className="space-y-2">
                <Input
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://www.loom.com/share/…"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => act(() => savePack(goalId, { videoUrl }), "Video link saved.")}
                >
                  Save link
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </Panel>
      </div>

      <Panel
        title={
          <span className="inline-flex items-center gap-2">
            <Users className="size-4 text-primary" />
            Who to reach at {props.companyName}
          </span>
        }
        description="Tag at most 3 people; message up to 5 directly. Direct notes get far more replies than public posts."
      >
        <div className="grid gap-3 md:grid-cols-2">
          {props.people.map((p) => (
            <a
              key={p.title}
              href={search(`${p.title} ${props.companyName}`)}
              target="_blank"
              rel="noreferrer"
              className="group flex items-start gap-3 rounded-xl border border-border/80 p-4 transition-colors hover:border-primary/40"
            >
              <Linkedin className="mt-0.5 size-4 shrink-0 text-[#0A66C2]" />
              <div>
                <div className="text-sm font-medium group-hover:text-primary">{p.title}</div>
                <div className="text-xs text-muted-foreground">{p.why}</div>
              </div>
            </a>
          ))}
          {kit.college && (
            <a
              href={search(`${props.companyName} ${kit.college}`)}
              target="_blank"
              rel="noreferrer"
              className="group flex items-start gap-3 rounded-xl border border-dashed border-primary/30 bg-secondary/40 p-4 transition-colors hover:border-primary/60"
            >
              <Linkedin className="mt-0.5 size-4 shrink-0 text-[#0A66C2]" />
              <div>
                <div className="text-sm font-medium group-hover:text-primary">
                  Seniors from {kit.college} at {props.companyName}
                </div>
                <div className="text-xs text-muted-foreground">
                  Your warmest route to a referral.
                </div>
              </div>
            </a>
          )}
        </div>
      </Panel>

      <Panel
        title="Messages in your voice"
        description="Each uses its own tracked link once you create one below. Edit freely before sending."
      >
        <Tabs defaultValue="post">
          <TabsList className="mb-4 flex-wrap">
            <TabsTrigger value="post">LinkedIn post</TabsTrigger>
            <TabsTrigger value="dm">Hiring manager</TabsTrigger>
            <TabsTrigger value="referral">Referral</TabsTrigger>
            <TabsTrigger value="follow">Day-3 follow-up</TabsTrigger>
            <TabsTrigger value="resume">Resume line</TabsTrigger>
          </TabsList>
          {(
            [
              [
                "post",
                fill(
                  `${kit.post}\n\n${kit.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}`,
                  "post",
                ),
                Linkedin,
              ],
              ["dm", fill(kit.dmHiringManager, "dm"), Mail],
              [
                "referral",
                `${fill(kit.referralAsk, "referral")}\n\n— To forward —\n${fill(kit.forwardBlurb, "referral")}`,
                MessageSquareReply,
              ],
              ["follow", fill(kit.followUp, "dm"), MessageSquareReply],
              ["resume", fill(kit.resumeLine, "resume"), Link2],
            ] as const
          ).map(([key, text]) => (
            <TabsContent key={key} value={key}>
              <pre className="whitespace-pre-wrap rounded-xl bg-muted/60 p-4 font-sans text-sm leading-relaxed">
                {text}
              </pre>
              <div className="mt-3 flex gap-2">
                <CopyButton text={text} />
                {key === "post" && (
                  <Button asChild size="sm" variant="outline" className="gap-1.5">
                    <a
                      href="https://www.linkedin.com/feed/?shareActive=true"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Linkedin className="size-3.5" /> Open LinkedIn
                    </a>
                  </Button>
                )}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </Panel>

      {!props.published && tracking}
    </div>
  );
}
