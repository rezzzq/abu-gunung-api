export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "krakatau.theme";

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

/** A stored choice wins; otherwise the theme follows the operating system. */
export function resolveTheme(stored: unknown, systemDark: boolean): Theme {
  if (isTheme(stored)) return stored;
  return systemDark ? "dark" : "light";
}
