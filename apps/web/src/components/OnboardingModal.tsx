"use client";

import { randomUsername, STARTING_SOL, USERNAME_MAX, validateUsername, type Me } from "@ruggedfun/shared";
import { usePathname } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Logo } from "./Logo";
import { useSession } from "./SessionProvider";
import { useToast } from "./Toaster";

/** Pages anyone can read without an account, so the legal terms are visible before signing up. */
const PUBLIC_PATHS = new Set(["/terms", "/privacy"]);

/** Blocks the site until the visitor picks a username, then creates their play-money wallet. */
export function OnboardingModal() {
  const pathname = usePathname();
  const { me, setMe } = useSession();
  const toast = useToast();
  const [username, setUsername] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (me || PUBLIC_PATHS.has(pathname)) return null;

  const trimmed = username.trim();
  const validationError = trimmed ? validateUsername(trimmed) : null;
  const error = serverError ?? validationError;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!trimmed || validationError || submitting) return;
    setSubmitting(true);
    setServerError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: trimmed }),
      });
      const body = (await res.json()) as Me | { error: string };
      if (!res.ok || "error" in body) {
        setServerError("error" in body ? body.error : "Something went wrong");
        return;
      }
      setMe(body);
      toast(`Wallet created: ${STARTING_SOL} SOL loaded`);
    } catch {
      setServerError("Couldn't reach the server. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-2xl border border-line bg-panel p-6 shadow-2xl shadow-black/60"
      >
        <Logo className="mb-1 size-9" />
        <h1 id="onboarding-title" className="text-xl font-bold">
          Welcome to ruggedfun
        </h1>
        <p className="mt-1 text-sm text-muted">
          Pick a username and we&apos;ll load a wallet with {STARTING_SOL} fake SOL. Try not to get rugged.
        </p>

        <label htmlFor="username" className="mt-5 block text-xs font-semibold uppercase tracking-wide text-muted">
          Username
        </label>
        <div
          className={`mt-1 flex items-center rounded-lg border bg-bg px-3 focus-within:ring-2 ${
            error ? "border-rug/60 focus-within:ring-rug/30" : "border-line focus-within:ring-pump/30"
          }`}
        >
          <span className="text-muted">@</span>
          <input
            id="username"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            maxLength={USERNAME_MAX}
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setServerError(null);
            }}
            placeholder="degen42"
            className="w-full bg-transparent px-1 py-2.5 outline-none placeholder:text-muted/50"
            aria-invalid={Boolean(error)}
            aria-describedby="username-hint"
          />
          <span className="font-mono text-xs text-muted">
            {trimmed.length}/{USERNAME_MAX}
          </span>
          <button
            type="button"
            onClick={() => {
              setUsername(randomUsername());
              setServerError(null);
            }}
            title="Random name"
            aria-label="Generate a random name"
            className="-mr-1 ml-2 rounded-md px-1.5 py-1 text-base transition hover:bg-panel-2"
          >
            🎲
          </button>
        </div>
        <p id="username-hint" className={`mt-1.5 min-h-5 text-xs ${error ? "text-rug" : "text-muted"}`}>
          {error ?? "Letters, numbers and _ · or roll a random one 🎲"}
        </p>

        <button
          type="submit"
          disabled={!trimmed || Boolean(validationError) || submitting}
          className="mt-3 w-full rounded-lg bg-pump py-2.5 font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? "Creating wallet…" : "Create wallet"}
        </button>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-muted">
          ruggedfun is a simulation: play money with no real value, and nothing here is financial advice. Your account
          lives in this browser; clear your cookies and it&apos;s gone. By creating a wallet you confirm you&apos;re 18+
          and agree to the{" "}
          <a href="/terms" target="_blank" rel="noopener" className="text-pump hover:underline">
            Terms of Use
          </a>{" "}
          and{" "}
          <a href="/privacy" target="_blank" rel="noopener" className="text-pump hover:underline">
            Privacy Policy
          </a>
          .
        </p>
      </form>
    </div>
  );
}
