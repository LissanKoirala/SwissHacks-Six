"use client";

import { useEffect, useState } from "react";
import { Globe } from "lucide-react";
import { api } from "@/lib/api";
import type { LinkPreview } from "@/lib/types";

function faviconFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
  } catch {
    return "";
  }
}

export function LinkPreviewThumb({
  url,
  className = "",
  size = "md",
  layout = "icon",
}: {
  url: string;
  className?: string;
  size?: "sm" | "md";
  layout?: "icon" | "thumbnail";
}) {
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setPreview(null);
    setFailed(false);
    api
      .linkPreview(url)
      .then((data) => alive && setPreview(data))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [url]);

  const dim = size === "sm" ? "h-14 w-14" : "h-20 w-20";
  const iconDim = size === "sm" ? "h-5 w-5" : "h-7 w-7";
  const frameClass =
    layout === "thumbnail"
      ? "h-auto w-40 max-w-[160px] shrink-0 aspect-video rounded-md"
      : `relative shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-inset ring-border ${dim}`;
  const fallbackFavicon = preview?.favicon_url || faviconFromUrl(url);
  const showThumbnail =
    !failed && preview?.preview_kind === "thumbnail" && preview.image_url;
  const showFavicon = !showThumbnail && fallbackFavicon && !failed;

  return (
    <div
      className={`relative shrink-0 overflow-hidden bg-muted ring-1 ring-inset ring-border ${frameClass} ${className}`}
      aria-hidden
    >
      {showThumbnail ? (
        <img
          src={preview.image_url!}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : showFavicon ? (
        <div className="grid h-full w-full place-items-center bg-muted">
          <img
            src={fallbackFavicon}
            alt=""
            className={`${iconDim} object-contain`}
            onError={() => setFailed(true)}
          />
        </div>
      ) : (
        <div className="grid h-full w-full place-items-center bg-muted text-muted-foreground">
          <Globe className={iconDim} strokeWidth={1.5} />
        </div>
      )}
    </div>
  );
}
