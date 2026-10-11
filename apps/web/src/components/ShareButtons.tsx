"use client";

import { useEffect, useState } from "react";

// One line per label; whole buttons wrap onto a new row on narrow screens instead.
const button =
  "flex min-w-36 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-line bg-panel-2 px-3 py-2.5 text-sm font-semibold transition hover:border-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pump";

/**
 * Share a profile's PnL card: post it on X (the link unfurls into the card), copy the link, download
 * the image, or (on phones) hand the image to the system share sheet.
 */
export function ShareButtons({ path, text, imagePath, filename }: { path: string; text: string; imagePath: string; filename: string }) {
  const [copied, setCopied] = useState(false);
  // Only some browsers (mostly phones) can share files; checked after mount so the server render matches.
  const [canShareFiles, setCanShareFiles] = useState(false);
  useEffect(() => {
    const probe = new File([""], "probe.png", { type: "image/png" });
    setCanShareFiles(typeof navigator.canShare === "function" && navigator.canShare({ files: [probe] }));
  }, []);

  const url = () => `${window.location.origin}${path}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (e.g. no permission): nothing to copy into.
    }
  }

  async function shareImage() {
    try {
      const blob = await (await fetch(imagePath)).blob();
      await navigator.share({ files: [new File([blob], filename, { type: "image/png" })], text, url: url() });
    } catch {
      // Cancelled, or the share sheet refused the file.
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <a
        href={`https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(`https://ruggedfun.xyz${path}`)}`}
        onClick={(e) => {
          // The real origin, so a staging or local link stays on that site.
          e.currentTarget.href = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url())}`;
        }}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-w-36 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-pump px-3 py-2.5 text-sm font-bold text-pump-ink transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pump"
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
        Post on X
      </a>
      <button type="button" onClick={copyLink} className={button}>
        {copied ? "✓ Copied" : "🔗 Copy link"}
      </button>
      <a href={imagePath} download={filename} className={button}>
        ⬇ Download image
      </a>
      {canShareFiles && (
        <button type="button" onClick={shareImage} className={button}>
          📤 Share…
        </button>
      )}
    </div>
  );
}
