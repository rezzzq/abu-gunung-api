import { t, type Locale } from "../i18n";

const SHARE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 16.1a3 3 0 0 0-2 .8l-7.1-4.1a3.4 3.4 0 0 0 0-1.6L16 7.1a3 3 0 1 0-1-2.2c0 .3 0 .5.1.8L8 9.8a3 3 0 1 0 0 4.4l7.1 4.1c-.1.3-.1.5-.1.8a3 3 0 1 0 3-3Z"/></svg>';

export function initShare(button: HTMLButtonElement, locale: Locale): void {
  const label = (): void => {
    button.innerHTML = `${SHARE_ICON}<span>${t(locale, "share")}</span>`;
  };
  label();
  button.addEventListener("click", async () => {
    const url = location.href.split("#")[0] ?? location.href;
    const payload = { title: t(locale, "appTitle"), text: t(locale, "shareText"), url };
    if (typeof navigator.share === "function") {
      try {
        await navigator.share(payload);
        return;
      } catch (e) {
        // The user closing the share sheet rejects with AbortError; that is not a failure.
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      button.innerHTML = `${SHARE_ICON}<span>${t(locale, "copied")}</span>`;
      window.setTimeout(label, 2000);
    } catch {
      // Clipboard can be unavailable (insecure context); fall back to a prompt the user can copy from.
      window.prompt(t(locale, "share"), url);
    }
  });
}
