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

const FAVICON_FILTER = "grayscale(1)";

export function LinkPreviewThumb({
  url,
  className = "",
  size = "md",
  layout = "icon",
}: {
  url: string;
  className?: string;
  size?: "sm" | "md";
  layout?: "icon" | "thumbnail" | "thumbnail-stretch";
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
  const stretched = layout === "thumbnail-stretch";
  const faviconDim = stretched
    ? "h-10 w-10"
    : size === "sm"
      ? "h-6 w-6"
      : "h-9 w-9";
  const iconDim = faviconDim;
  const frameClass = stretched
    ? "relative h-full min-h-0 w-auto shrink-0 aspect-video rounded-none rounded-r-md ring-0"
    : layout === "thumbnail"
      ? "relative h-auto w-56 max-w-[224px] shrink-0 aspect-video rounded-md"
      : `relative shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-inset ring-border ${dim}`;
  const fallbackFavicon = preview?.favicon_url || faviconFromUrl(url);
  const showImage = !failed && Boolean(preview?.image_url);
  const showFavicon = !showImage && fallbackFavicon && !failed;
  const fillClass =
    stretched || layout === "thumbnail"
      ? "absolute inset-0 h-full w-full object-cover"
      : "h-full w-full object-cover";

  return (
    <div
      className={`relative shrink-0 overflow-hidden bg-muted ${
        stretched
          ? "border-l border-border/50"
          : "ring-1 ring-inset ring-border"
      } ${frameClass} ${className}`}
      aria-hidden
    >
      {showImage ? (
        <img
          src={preview!.image_url!}
          alt=""
          className={fillClass}
          onError={() => setFailed(true)}
        />
      ) : showFavicon ? (
        <>
          {stretched || layout === "thumbnail" ? (
            <img
              src={fallbackFavicon}
              alt=""
              className="absolute inset-0 h-full w-full scale-150 object-cover opacity-50"
              style={{ filter: FAVICON_FILTER }}
              onError={() => setFailed(true)}
            />
          ) : null}
          <div
            className={
              stretched || layout === "thumbnail"
                ? "absolute inset-0 grid place-items-center bg-muted/80"
                : "grid h-full w-full place-items-center bg-muted"
            }
          >
            <img
              src={fallbackFavicon}
              alt=""
              className={`${faviconDim} object-contain`}
              style={{ filter: FAVICON_FILTER }}
              onError={() => setFailed(true)}
            />
          </div>
        </>
      ) : (
        <div
          className={
            stretched || layout === "thumbnail"
              ? "absolute inset-0 grid place-items-center bg-muted text-muted-foreground"
              : "grid h-full w-full place-items-center bg-muted text-muted-foreground"
          }
        >
          <Globe className={iconDim} strokeWidth={1.5} />
        </div>
      )}
    </div>
  );
}
