// Run browser clipboard APIs before the first await to retain the user gesture.
export function copyText(value: string): Promise<boolean> {
  try {
    if (
      typeof navigator !== "undefined" &&
      globalThis.isSecureContext &&
      navigator.clipboard?.writeText
    ) {
      return navigator.clipboard.writeText(value).then(
        () => true,
        () => false,
      );
    }
    // Clipboard API requires HTTPS, but the local phone demo uses HTTP on LAN.
    // execCommand must also execute in the originating click, not after an await.
    if (typeof document === "undefined" || !document.body)
      return Promise.resolve(false);
    const previousFocus = document.activeElement as HTMLElement | null;
    const field = document.createElement("textarea");
    field.value = value;
    field.readOnly = true;
    field.setAttribute("aria-hidden", "true");
    Object.assign(field.style, {
      position: "fixed",
      left: "-9999px",
      top: "0",
      opacity: "0",
    });
    try {
      document.body.appendChild(field);
      field.focus({ preventScroll: true });
      field.select();
      field.setSelectionRange(0, value.length);
      return Promise.resolve(document.execCommand("copy") === true);
    } finally {
      field.value = "";
      field.remove();
      previousFocus?.focus?.({ preventScroll: true });
    }
  } catch {
    return Promise.resolve(false);
  }
}
