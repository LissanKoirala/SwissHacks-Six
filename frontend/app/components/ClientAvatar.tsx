"use client";

import { useState } from "react";
import { clientInitials, getClientAvatar } from "@/lib/assets";

export function ClientAvatar({
  clientId,
  name,
  size = "md",
  className = "",
}: {
  clientId: string;
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const avatar = getClientAvatar(clientId);
  const [failed, setFailed] = useState(false);
  const initials = clientInitials(name);

  const dim =
    size === "sm" ? "h-9 w-9 text-xs" : size === "lg" ? "h-14 w-14 text-base" : "h-11 w-11 text-sm";

  if (!avatar || failed) {
    return (
      <span
        className={`grid shrink-0 place-items-center rounded-full bg-primary/10 font-semibold text-primary ring-2 ring-background ${dim} ${className}`}
        aria-hidden
      >
        {initials}
      </span>
    );
  }

  return (
    <img
      src={avatar}
      alt=""
      className={`shrink-0 rounded-full object-cover ring-2 ring-background ${dim} ${className}`}
      onError={() => setFailed(true)}
    />
  );
}
