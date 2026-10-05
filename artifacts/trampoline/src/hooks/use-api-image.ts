import { useEffect, useState } from "react";
import { isNativeApp } from "@/lib/native-app";

/**
 * Image src for an /api image. Browsers send the session cookie with <img>
 * requests, but the iOS app can't, so there the image is fetched (with the
 * session token) and shown from a blob URL. Other srcs pass through.
 */
export function useApiImageSrc(src: string | null | undefined): string | undefined {
  const needsFetch = isNativeApp && !!src && src.startsWith("/api");
  const [blobUrl, setBlobUrl] = useState<string>();

  useEffect(() => {
    if (!needsFetch || !src) return;
    let url: string | undefined;
    let cancelled = false;
    fetch(src, { credentials: "include" })
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(String(res.status)))))
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setBlobUrl(url);
      })
      .catch(() => {
        // Leave the image empty; the surrounding UI already handles missing images.
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
      setBlobUrl(undefined);
    };
  }, [needsFetch, src]);

  if (!src) return undefined;
  return needsFetch ? blobUrl : src;
}
