import { copyText } from "./clipboard.web";
import type { ShareOutcome } from "./share.types";

/** Share only a public URL; never pass an owner key to this helper. */
export function sharePublicLink(publicUrl: string): Promise<ShareOutcome> {
  if (
    typeof navigator !== "undefined" &&
    globalThis.isSecureContext &&
    navigator.share
  ) {
    try {
      return navigator.share({ title: "Emergency QR", url: publicUrl }).then(
        () => "shared",
        (error: unknown) =>
          error instanceof Error && error.name === "AbortError"
            ? "cancelled"
            : "manual",
      );
    } catch {
      return Promise.resolve("manual");
    }
  }
  return copyText(publicUrl).then((copied) => (copied ? "copied" : "manual"));
}
