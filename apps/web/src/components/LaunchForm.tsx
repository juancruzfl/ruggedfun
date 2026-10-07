"use client";

import {
  AVATAR_STYLES,
  avatarUrl,
  DESCRIPTION_MAX,
  LAUNCH_COST_SOL,
  LAUNCHES_PER_HOUR,
  MAX_DEV_BUY_SOL,
  normalizeTicker,
  TICKER_MAX,
  TOKEN_NAME_MAX,
  validateLaunch,
  type AvatarStyle,
  type LaunchRequest,
  type LaunchResult,
} from "@ruggedfun/shared";
import { LAUNCH_PRICE, marketCapSol } from "@ruggedfun/sim";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { formatSol, formatUsd } from "@/lib/format";
import { sounds } from "@/lib/sound";
import { useSession } from "./SessionProvider";
import { useToast } from "./Toaster";

const STYLE_LABELS: Record<AvatarStyle, string> = {
  "fun-emoji": "Emoji",
  bottts: "Robots",
  thumbs: "Thumbs",
  "pixel-art": "Pixel",
  shapes: "Shapes",
  adventurer: "Characters",
};
const DEV_BUY_PRESETS = [0, 0.1, 0.5, 1];
const OPTIONS_PER_ROLL = 8;

const newSeeds = () => Array.from({ length: OPTIONS_PER_ROLL }, () => Math.random().toString(36).slice(2, 10));

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="font-semibold uppercase tracking-wide text-muted">{label}</span>
        {hint && <span className="font-mono text-muted">{hint}</span>}
      </div>
      {children}
      {error && <p className="mt-1 text-xs text-rug">{error}</p>}
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-line bg-bg px-3 py-2.5 outline-none placeholder:text-muted/40 focus:border-pump/50";

/** Launch a token: name, ticker, picture, optional dev buy. The fate is rolled on launch, hidden from everyone. */
export function LaunchForm() {
  const { me, setMe } = useSession();
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [description, setDescription] = useState("");
  const [style, setStyle] = useState<AvatarStyle>("fun-emoji");
  // Random, so picked after mount: server and browser renders must match.
  const [seeds, setSeeds] = useState<string[]>([]);
  useEffect(() => setSeeds(newSeeds()), []);
  const [seed, setSeed] = useState<string | null>(null);
  const [devBuy, setDevBuy] = useState("0");
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const devBuySol = Number(devBuy) || 0;
  const request: LaunchRequest = {
    name: name.trim(),
    ticker: normalizeTicker(ticker),
    description: description.trim(),
    avatarStyle: style,
    avatarSeed: seed ?? "",
    devBuySol,
  };
  const errors = validateLaunch(request);
  const total = LAUNCH_COST_SOL + devBuySol;
  const balance = me?.wallet.solBalance ?? 0;
  const tooPoor = total > balance + 1e-9;
  const canLaunch = Boolean(me) && Object.keys(errors).length === 0 && !tooPoor && !pending;
  const show = (field: keyof LaunchRequest) => (touched ? errors[field] : undefined);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!canLaunch || !me) return;
    setPending(true);
    setServerError(null);
    try {
      const res = await fetch("/api/launch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      const body = (await res.json()) as LaunchResult | { error: string };
      if (!res.ok || "error" in body) {
        setServerError("error" in body ? body.error : "Launch failed");
        return;
      }
      setMe({
        ...me,
        wallet: { ...me.wallet, solBalance: body.solBalance },
        positions: body.position
          ? [body.position, ...me.positions.filter((p) => p.tokenId !== body.position!.tokenId)]
          : me.positions,
      });
      sounds.moon();
      toast(`🚀 $${body.token.ticker} launched!`);
      router.push(`/token/${body.token.ticker}`);
    } catch {
      setServerError("Couldn't reach the server. Try again.");
    } finally {
      setPending(false);
    }
  }

  const launchMcap = formatUsd(marketCapSol(LAUNCH_PRICE));
  const previewImage = seed ? avatarUrl(style, seed) : null;

  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 lg:grid-cols-[1fr_320px]">
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <div>
          <h1 className="text-2xl font-bold">🚀 Launch a token</h1>
          <p className="mt-1 text-sm text-muted">
            Costs {LAUNCH_COST_SOL} SOL. Your token gets a fate rolled like every other launch, so even you won&apos;t
            know if it moons or rugs.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
          <Field label="Name" hint={`${name.trim().length}/${TOKEN_NAME_MAX}`} error={show("name")}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={TOKEN_NAME_MAX}
              placeholder="Moon Frog"
              className={inputClass}
              autoComplete="off"
            />
          </Field>
          <Field label="Ticker" hint={`${normalizeTicker(ticker).length}/${TICKER_MAX}`} error={show("ticker")}>
            <div className="flex items-center rounded-lg border border-line bg-bg px-3 focus-within:border-pump/50">
              <span className="text-muted">$</span>
              <input
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase().replace(/[^A-Z0-9$]/g, ""))}
                maxLength={TICKER_MAX + 1}
                placeholder="MFROG"
                className="w-full bg-transparent px-1 py-2.5 font-mono uppercase outline-none placeholder:text-muted/40"
                autoComplete="off"
              />
            </div>
          </Field>
        </div>

        <Field label="Description" hint={`${description.trim().length}/${DESCRIPTION_MAX}`} error={show("description")}>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={DESCRIPTION_MAX}
            rows={2}
            placeholder="Optional. Sell the dream."
            className={`${inputClass} resize-none`}
          />
        </Field>

        <Field label="Image" error={touched && !seed ? "Pick an image" : undefined}>
          <div className="flex flex-wrap gap-1.5">
            {AVATAR_STYLES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setStyle(s);
                  setSeed(null);
                }}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  style === s ? "bg-pump text-black" : "bg-panel-2 text-muted hover:text-text"
                }`}
              >
                {STYLE_LABELS[s]}
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
            {seeds.map((s) => (
              <button
                key={`${style}-${s}`}
                type="button"
                onClick={() => setSeed(s)}
                aria-label="Use this image"
                aria-pressed={seed === s}
                className={`overflow-hidden rounded-lg border-2 bg-panel-2 transition ${
                  seed === s ? "border-pump" : "border-transparent hover:border-line"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={avatarUrl(style, s)} alt="" className="aspect-square w-full" loading="lazy" />
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setSeeds(newSeeds());
              setSeed(null);
            }}
            className="mt-2 text-xs text-muted hover:text-text"
          >
            🎲 Show different ones
          </button>
        </Field>

        <Field label="Dev buy (optional)" hint={`max ${MAX_DEV_BUY_SOL} SOL`} error={show("devBuySol")}>
          <p className="mb-2 text-xs text-muted">
            Buy your own token at launch, at the lowest price it will ever have. It&apos;s a normal trade: you can sell
            it any time.
          </p>
          <div className="flex gap-2">
            <div className="flex flex-1 items-center rounded-lg border border-line bg-bg px-3 focus-within:border-pump/50">
              <input
                value={devBuy}
                inputMode="decimal"
                onChange={(e) => setDevBuy(e.target.value.replace(/[^0-9.]/g, ""))}
                className="w-full bg-transparent py-2.5 font-mono outline-none"
                aria-label="Dev buy in SOL"
              />
              <span className="text-sm text-muted">SOL</span>
            </div>
            {DEV_BUY_PRESETS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setDevBuy(String(v))}
                className="rounded-md bg-panel-2 px-2.5 text-xs text-muted hover:text-text"
              >
                {v === 0 ? "None" : v}
              </button>
            ))}
          </div>
        </Field>

        <dl className="space-y-1 rounded-xl border border-line bg-panel p-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Launch cost</dt>
            <dd className="font-mono">{formatSol(LAUNCH_COST_SOL)} SOL</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Dev buy</dt>
            <dd className="font-mono">{formatSol(devBuySol)} SOL</dd>
          </div>
          <div className="flex justify-between border-t border-line pt-1 font-semibold">
            <dt>Total</dt>
            <dd className="font-mono">{formatSol(total)} SOL</dd>
          </div>
          <div className="flex justify-between text-xs">
            <dt className="text-muted">Your balance after</dt>
            <dd className={`font-mono ${tooPoor ? "text-rug" : "text-muted"}`}>
              {tooPoor ? "not enough SOL" : `${formatSol(balance - total)} SOL`}
            </dd>
          </div>
        </dl>

        {serverError && <p className="text-sm text-rug">{serverError}</p>}

        <button
          type="submit"
          disabled={pending || (touched && !canLaunch)}
          className="w-full rounded-lg bg-pump py-3 font-bold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "Launching…" : `Launch for ${formatSol(total)} SOL`}
        </button>
        <p className="text-center text-xs text-muted">
          Up to {LAUNCHES_PER_HOUR} launches an hour. Names, tickers and images must follow the{" "}
          <Link href="/terms" className="text-pump hover:underline">
            Terms
          </Link>
          ; ones that don&apos;t get removed.
        </p>
      </form>

      <aside className="lg:pt-14">
        <div className="sticky top-20 space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Preview</div>
          <div className="rounded-xl border border-line bg-panel p-3">
            <div className="flex gap-3">
              {previewImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewImage} alt="" className="h-16 w-16 shrink-0 rounded-lg bg-panel-2" />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-panel-2 text-2xl">
                  ?
                </div>
              )}
              <div className="min-w-0">
                <div className="truncate font-semibold">{name.trim() || "Your token"}</div>
                <div className="truncate text-xs text-muted">
                  ${normalizeTicker(ticker) || "TICKER"} · just now · by {me?.user.username ?? "you"}{" "}
                  <span className="rounded bg-sky-400/15 px-1 text-[10px] font-bold text-sky-300">PLAYER</span>
                </div>
                <div className="mt-1.5 flex items-baseline gap-2">
                  <span className="text-xs text-muted">MC</span>
                  <span className="font-mono font-semibold">{launchMcap}</span>
                </div>
              </div>
            </div>
            {description.trim() && <p className="mt-2 line-clamp-2 text-xs text-muted">{description.trim()}</p>}
            <div className="mt-2 h-1.5 rounded-full bg-panel-2" />
          </div>
          <p className="text-xs text-muted">Every token starts at about {launchMcap} market cap.</p>
        </div>
      </aside>
    </div>
  );
}
