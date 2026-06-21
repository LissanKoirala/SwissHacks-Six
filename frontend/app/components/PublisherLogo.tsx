"use client";

import { useEffect, useState } from "react";
import { publisherInitials, publisherLogoSources } from "@/lib/publishers";
import { cn } from "@/lib/utils";

/** Publisher mark — resolved from source label + article URL, not the OG unfurl pipeline. */
export function PublisherLogo({
  articleUrl,
  source,
  className,
}: {
  articleUrl?: string | null;
  source: string;
  className?: string;
}) {
  const sources = publisherLogoSources(source, articleUrl);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(0);
  }, [source, articleUrl]);

  const exhausted = sources.length === 0 || idx >= sources.length;
  const src = exhausted ? null : sources[idx];
  const initials = publisherInitials(source);

  return (
    <span
      className={cn(
        "relative grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-md bg-muted ring-1 ring-inset ring-border",
        className,
      )}
      title={source}
    >
      {src ? (
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setIdx((i) => i + 1)}
        />
      ) : (
        <span className="grid h-full w-full place-items-center text-[10px] font-semibold uppercase text-muted-foreground">
          {initials}
        </span>
      )}
    </span>
  );
}
