export const canDownloadQr = false;
export async function downloadQrPng(): Promise<void> {
  throw new Error("Use the public link sharing action on this device.");
}
