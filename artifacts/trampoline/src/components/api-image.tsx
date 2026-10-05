import type { ImgHTMLAttributes } from "react";
import { useApiImageSrc } from "@/hooks/use-api-image";

/** <img> that also loads signed-in /api images inside the iOS app. */
export function ApiImage({ src, alt, ...props }: ImgHTMLAttributes<HTMLImageElement> & { src?: string | null }) {
  const resolved = useApiImageSrc(src);
  return <img src={resolved} alt={alt} {...props} />;
}
