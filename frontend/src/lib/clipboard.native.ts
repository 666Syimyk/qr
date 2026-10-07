import * as Clipboard from "expo-clipboard";
export async function copyText(value: string): Promise<boolean> {
  try {
    return (await Clipboard.setStringAsync(value)) === true;
  } catch {
    return false;
  }
}
