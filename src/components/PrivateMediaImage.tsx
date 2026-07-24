import { createPrivateMediaUrl } from "@/lib/photos";
import { useSupabase } from "@/lib/supabase";
import { Image, type ImageProps } from "expo-image";
import React, { useEffect, useState } from "react";
import { View } from "react-native";

type Props = Omit<ImageProps, "source"> & {
  reference: string;
  className?: string;
};

/** Resolves private Storage object references into short-lived signed URLs. */
export function PrivateMediaImage({
  reference,
  className,
  ...props
}: Props) {
  const supabase = useSupabase();
  const [uri, setUri] = useState<string | null>(
    reference.startsWith("society-media:") ? null : reference,
  );

  useEffect(() => {
    let cancelled = false;
    setUri(reference.startsWith("society-media:") ? null : reference);
    void createPrivateMediaUrl(supabase, reference)
      .then((signedUrl) => {
        if (!cancelled) setUri(signedUrl);
      })
      .catch(() => {
        if (!cancelled) setUri(null);
      });
    return () => {
      cancelled = true;
    };
  }, [reference, supabase]);

  if (!uri) return <View className={`bg-surface-alt ${className ?? ""}`} />;
  return <Image {...props} source={{ uri }} className={className} />;
}
