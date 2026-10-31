"use client";

import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  FileText,
  Loader2,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { readJob } from "./actions";

const MINUTES = [15, 30, 45, 60];
const STEPS = ["Target job", "Your resume", "Your timeline"];

export function StartWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [jd, setJd] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [skills, setSkills] = useState<string[] | null>(null);
  const [judgment, setJudgment] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [date, setDate] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [reading, startReading] = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const [drag, setDrag] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  function read() {
    startReading(async () => {
      const result = await readJob(jd);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setCompany((c) => c || result.companyName);
      setRole((r) => r || result.roleTitle);
      setSkills(result.skills);
      setJudgment(result.judgment);
    });
  }

  function pick(f: File | undefined) {
    if (!f) return;
    if (!/\.(pdf|docx)$/i.test(f.name)) {
      toast.error("Upload a PDF or .docx resume.");
      return;
    }
    setFile(f);
  }

  async function submit() {
    if (!file) return;
    setSubmitting(true);
    const form = new FormData();
    form.set("companyName", company);
    form.set("roleTitle", role);
    form.set("jobDescription", jd);
    form.set("interviewDate", date);
    form.set("minutesPerDay", String(minutes));
    form.set("resume", file);
    try {
      const res = await fetch("/api/goals", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !body.id) throw new Error(body.error ?? "Something went wrong.");
      router.push(`/g/${body.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  const jobReady = skills !== null && company.trim().length >= 2 && role.trim().length >= 2;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <div className="text-center">
        <Badge variant="secondary" className="gap-1.5 rounded-full px-3 py-1 text-xs font-medium">
          <Sparkles className="size-3.5" /> Works for any job
        </Badge>
        <h1 className="mt-4 text-[34px] font-semibold leading-tight tracking-tight sm:text-[42px]">
          Which job do you <span className="text-gradient">want next?</span>
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-[15px] text-muted-foreground">
          Paste the job description and your resume. We'll find out how they hire, test your real
          level and show you exactly what stands between you and the offer.
        </p>
      </div>

      <ol className="mx-auto mt-10 flex max-w-md items-center justify-between">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 items-center gap-2 last:flex-none">
            <span
              className={cn(
                "grid size-7 place-items-center rounded-full text-xs font-semibold transition-colors",
                i < step && "bg-primary text-primary-foreground",
                i === step && "bg-primary/10 text-primary ring-2 ring-primary",
                i > step && "bg-muted text-muted-foreground",
              )}
            >
              {i + 1}
            </span>
            <span
              className={cn(
                "hidden text-sm sm:inline",
                i === step ? "font-medium" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && <span className="mx-2 h-px flex-1 bg-border" />}
          </li>
        ))}
      </ol>

      <div className="surface mt-8 p-6 sm:p-8">
        {step === 0 && (
          <div className="animate-rise space-y-5">
            <div>
              <Label htmlFor="jd" className="text-sm font-medium">
                Job description
              </Label>
              <Textarea
                id="jd"
                value={jd}
                onChange={(e) => {
                  setJd(e.target.value);
                  setSkills(null);
                }}
                placeholder="Paste the whole job post: responsibilities, requirements, everything."
                className="mt-2 min-h-[220px] resize-y text-[14px] leading-relaxed"
              />
            </div>
            {skills === null ? (
              <Button
                size="lg"
                className="h-11 w-full gap-2"
                onClick={read}
                disabled={reading || jd.trim().length < 150}
              >
                {reading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {reading ? "Reading the job…" : "Read this job"}
              </Button>
            ) : (
              <div className="animate-rise space-y-5">
                <div className="rounded-xl border border-primary/15 bg-secondary/60 p-4">
                  <div className="text-sm font-medium">
                    {skills.length} skills found
                    {judgment !== null && (
                      <span className="text-muted-foreground">
                        {" "}
                        · about {judgment}% of this job needs human judgment, not just output
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {skills.map((s) => (
                      <Badge key={s} variant="outline" className="bg-background font-normal">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="company" className="text-sm font-medium">
                      Company
                    </Label>
                    <div className="relative mt-2">
                      <Building2 className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="company"
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        className="h-11 pl-9"
                        placeholder="e.g. Razorpay"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="role" className="text-sm font-medium">
                      Role
                    </Label>
                    <Input
                      id="role"
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      className="mt-2 h-11"
                      placeholder="e.g. SDE-1"
                    />
                  </div>
                </div>
                <Button
                  size="lg"
                  className="h-11 w-full gap-2"
                  disabled={!jobReady}
                  onClick={() => setStep(1)}
                >
                  Continue <ArrowRight className="size-4" />
                </Button>
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="animate-rise space-y-5">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                pick(e.dataTransfer.files[0]);
              }}
              className={cn(
                "flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors",
                drag
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50 hover:bg-secondary/40",
              )}
            >
              {file ? (
                <>
                  <FileText className="size-10 text-primary" />
                  <div className="mt-3 font-medium">{file.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {Math.round(file.size / 1024)} KB · click to change
                  </div>
                </>
              ) : (
                <>
                  <UploadCloud className="size-10 text-primary" />
                  <div className="mt-3 font-medium">Drop your resume here</div>
                  <div className="text-sm text-muted-foreground">PDF or Word, up to 8 MB</div>
                </>
              )}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={(e) => pick(e.target.files?.[0])}
            />
            <p className="text-xs text-muted-foreground">
              Your resume is used only to tailor your practice. It's never shared, and your name and
              contact details are removed before any AI sees it.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" size="lg" className="h-11 gap-2" onClick={() => setStep(0)}>
                <ArrowLeft className="size-4" /> Back
              </Button>
              <Button
                size="lg"
                className="h-11 flex-1 gap-2"
                disabled={!file}
                onClick={() => setStep(2)}
              >
                Continue <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="animate-rise space-y-6">
            <div>
              <Label htmlFor="date" className="text-sm font-medium">
                Interview date{" "}
                <span className="font-normal text-muted-foreground">(if you have one)</span>
              </Label>
              <div className="relative mt-2">
                <CalendarDays className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="date"
                  type="date"
                  min={today}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-11 pl-9"
                />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Your plan fits the time you have. No date? We size it to your gap, never more than 8
                weeks.
              </p>
            </div>
            <div>
              <div className="text-sm font-medium">Time you can give each day</div>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {MINUTES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMinutes(m)}
                    className={cn(
                      "h-11 rounded-xl border text-sm font-medium transition-all",
                      minutes === m
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-border bg-background hover:border-primary/40",
                    )}
                  >
                    {m} min
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-xl bg-muted/60 p-4 text-sm">
              <span className="font-medium">
                {role} at {company}
              </span>
              <span className="text-muted-foreground"> · {file?.name}</span>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                size="lg"
                className="h-11 gap-2"
                onClick={() => setStep(1)}
                disabled={submitting}
              >
                <ArrowLeft className="size-4" /> Back
              </Button>
              <Button
                size="lg"
                className="h-11 flex-1 gap-2"
                onClick={submit}
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {submitting ? "Setting up your coach…" : "Start my prep"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
