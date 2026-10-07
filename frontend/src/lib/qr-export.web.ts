export const canDownloadQr = true;

/** Render the actual displayed QR SVG locally; its quiet zone is preserved. */
export async function downloadQrPng(): Promise<void> {
  const svg = document.querySelector('[data-testid="owner-public-qr"]');
  if (!svg || svg.tagName.toLowerCase() !== "svg")
    throw new Error("QR unavailable");
  const copy = svg.cloneNode(true) as SVGElement;
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const source = new Blob([new XMLSerializer().serializeToString(copy)], {
    type: "image/svg+xml;charset=utf-8",
  });
  const sourceUrl = URL.createObjectURL(source);
  try {
    const picture = new Image();
    await new Promise<void>((resolve, reject) => {
      picture.onload = () => resolve();
      picture.onerror = () => reject(new Error("QR image unavailable"));
      picture.src = sourceUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 1120;
    canvas.height = 1120;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = false;
    context.drawImage(picture, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("PNG unavailable"))),
        "image/png",
      );
    });
    const downloadUrl = URL.createObjectURL(png);
    const link = document.createElement("a");
    try {
      link.href = downloadUrl;
      link.download = "emergency-qr.png";
      document.body.appendChild(link);
      link.click();
    } finally {
      link.remove();
      // Give the browser time to start reading the generated file.
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    }
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}
