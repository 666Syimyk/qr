import { Share } from "react-native";
import type { ShareOutcome } from "./share.types";

export async function sharePublicLink(
  publicUrl: string,
): Promise<ShareOutcome> {
  try {
    const result = await Share.share({ message: publicUrl });
    return result.action === Share.dismissedAction ? "cancelled" : "shared";
  } catch {
    return "manual";
  }
}
