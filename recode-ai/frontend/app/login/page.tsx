"use client";

import { Film, ScanEye, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Logo } from "@/components/app-shell";
import { Button, Card, Input, Label } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const { user, signIn } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) router.replace("/");
  }, [user, router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { access_token } =
        mode === "login" ? await api.login(email, password) : await api.register(email, password);
      await signIn(access_token);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const steps = [
    { icon: <Film />, title: "Record", text: "Upload a screen recording of any site or app, with the interactions you care about." },
    { icon: <ScanEye />, title: "Reverse-engineer", text: "Frames, scrolls, menus and timings become a structured design spec." },
    { icon: <Wand2 />, title: "Rebuild & verify", text: "Agents write the code, render it, compare it with the video and fix the gaps." },
  ];

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between border-r border-line bg-panel p-10 lg:flex">
        <Logo />
        <div className="space-y-8">
          <h1 className="max-w-md text-4xl font-semibold leading-tight tracking-tight">
            From a recording to a <span className="text-gradient">working website</span>.
          </h1>
          <ol className="space-y-5">
            {steps.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-line bg-raised text-accent [&_svg]:size-4">
                  {s.icon}
                </span>
                <div>
                  <p className="text-sm font-medium">
                    {i + 1}. {s.title}
                  </p>
                  <p className="text-sm text-muted">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <p className="text-xs text-faint">
          Rebuild designs and behaviour you are allowed to use. Recode AI recreates what is visible; it never copies private
          code or assets.
        </p>
      </div>
      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-sm p-6">
          <div className="mb-6 lg:hidden">
            <Logo />
          </div>
          <h2 className="text-lg font-semibold">{mode === "login" ? "Sign in" : "Create your account"}</h2>
          <p className="mb-6 text-sm text-muted">
            {mode === "login" ? "Welcome back." : "Projects, versions and usage are kept per account."}
          </p>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label>Email</Label>
              <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label hint={mode === "register" ? "8+ characters" : undefined}>Password</Label>
              <Input
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                minLength={mode === "register" ? 8 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
            <Button type="submit" className="w-full" loading={busy}>
              {mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted">
            {mode === "login" ? "New here?" : "Already have an account?"}{" "}
            <button
              className="font-medium text-fg underline-offset-4 hover:underline"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError(null);
              }}
            >
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </Card>
      </div>
    </div>
  );
}
