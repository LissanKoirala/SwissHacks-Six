"use client";

import { useEffect, useState } from "react";
import { issuerInitials, issuerLogoSources } from "@/lib/assets";

export function IssuerLogo({
  issuer,
  isin,
  yahoo,
  size = "md",
  className = "",
}: {
  issuer: string;
  isin?: string | null;
  yahoo?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sources = issuerLogoSources({ isin, issuer, yahoo });
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(0);
  }, [isin, issuer, yahoo]);

  const exhausted = sources.length === 0 || idx >= sources.length;
  const src = exhausted ? null : sources[idx];
  const initials = issuerInitials(issuer);

  const dim =
    size === "sm" ? "h-6 w-6 text-[10px]" : size === "lg" ? "h-10 w-10 text-sm" : "h-8 w-8 text-xs";

  return (
    <span
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-md bg-surface-2 ring-1 ring-inset ring-border ${dim} ${className}`}
      title={issuer}
    >
      {src ? (
        <img
          src={src}
          alt=""
          className="h-full w-full object-contain p-0.5"
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setIdx((i) => i + 1)}
        />
      ) : (
        <span className="grid h-full w-full place-items-center bg-secondary font-semibold tracking-tight text-secondary-foreground">
          {initials}
        </span>
      )}
    </span>
  );
}
