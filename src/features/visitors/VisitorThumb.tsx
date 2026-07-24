import { PrivateMediaImage } from "@/components/PrivateMediaImage";
import { Avatar } from "@/components/ui";
import React from "react";

/** Compact visitor face for pending cards — photo when present, else initials. */
export function VisitorThumb({
  name,
  photoUrl,
  size = 44,
}: {
  name?: string | null;
  photoUrl?: string | null;
  size?: number;
}) {
  if (photoUrl) {
    return (
      <PrivateMediaImage
        reference={photoUrl}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        className="bg-surface-alt"
        contentFit="cover"
      />
    );
  }
  return <Avatar name={name} size={size} />;
}
