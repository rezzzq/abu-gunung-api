import { t, type Locale } from "../i18n";
import type { VolcanoStatus } from "../lib/schema";

/** Chip label: the bare mountain name people use ("Krakatau", "Lewotolok"). */
export function shortName(name: string): string {
  return name.replace(/^(Anak|Ili|Gunung)\s+/i, "");
}

export interface VolcanoStrip {
  update(volcanoes: VolcanoStatus[], selectedId: string | null): void;
}

/** Row of chips in the sheet peek, one per listed volcano, with a dot in the PVMBG level colour. */
export function initVolcanoStrip(el: HTMLElement, locale: Locale, onSelect: (id: string) => void): VolcanoStrip {
  el.setAttribute("aria-label", t(locale, "volcanoList"));
  return {
    update(volcanoes, selectedId) {
      el.innerHTML = "";
      el.hidden = volcanoes.length < 2;
      for (const v of volcanoes) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = `vchip${v.active ? " vchip--active" : ""}`;
        b.setAttribute("role", "tab");
        b.setAttribute("aria-selected", String(v.id === selectedId));
        b.title = v.region ? `${v.name} · ${v.region}` : v.name;
        const level = v.activityLevel?.level ?? 0;
        b.innerHTML = `<span class="vchip__dot vchip__dot--level${level}" aria-hidden="true"></span>${shortName(v.name)}`;
        b.addEventListener("click", () => onSelect(v.id));
        el.append(b);
      }
      el.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "center" });
    },
  };
}
