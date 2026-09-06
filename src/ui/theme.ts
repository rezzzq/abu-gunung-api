import { t, type Locale } from "../i18n";
import { isTheme, resolveTheme, THEME_STORAGE_KEY, type Theme } from "../lib/theme";

const THEME_COLOR: Record<Theme, string> = { light: "#00253f", dark: "#0a1622" };
const SUN_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6m13.8 0h2.6M5.3 5.3l1.8 1.8m9.8 9.8 1.8 1.8M5.3 18.7l1.8-1.8m9.8-9.8 1.8-1.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const MOON_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 2.8a9.2 9.2 0 1 0 6.7 12.3A7.6 7.6 0 0 1 14.5 2.8Z"/></svg>';

export interface ThemeController {
  current(): Theme;
}

function readStored(): unknown {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    // Private browsing or blocked storage: behave as if nothing was stored.
    return null;
  }
}

function writeStored(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (e) {
    console.warn(`theme: could not save preference (${e instanceof Error ? e.message : String(e)})`);
  }
}

/**
 * Applies the theme to the document, keeps the toggle button in sync, and follows
 * the system setting until the user picks a theme by hand.
 */
export function initTheme(button: HTMLButtonElement, locale: Locale, onChange: (theme: Theme) => void): ThemeController {
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  let theme = resolveTheme(readStored(), system.matches);
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');

  const apply = (next: Theme): void => {
    theme = next;
    document.documentElement.dataset.theme = next;
    if (meta) meta.content = THEME_COLOR[next];
    button.setAttribute("aria-pressed", String(next === "dark"));
    button.innerHTML = `${next === "dark" ? SUN_ICON : MOON_ICON}<span>${t(locale, "themeToggle")}</span>`;
    onChange(next);
  };

  button.addEventListener("click", () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    writeStored(next);
    apply(next);
  });
  system.addEventListener("change", (e) => {
    if (!isTheme(readStored())) apply(e.matches ? "dark" : "light");
  });

  apply(theme);
  return { current: () => theme };
}
