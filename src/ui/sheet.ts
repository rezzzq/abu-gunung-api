import type { Locale } from "../i18n";
import { t } from "../i18n";

export interface Sheet {
  expand(): void;
  collapse(): void;
  toggle(): void;
  isExpanded(): boolean;
}

const DRAG_THRESHOLD_PX = 40;

/** Bottom sheet with a collapsed peek state. A tap on the handle toggles; a vertical drag switches. */
export function initSheet(sheet: HTMLElement, handle: HTMLButtonElement, locale: Locale): Sheet {
  let expanded = false;

  const apply = (): void => {
    sheet.classList.toggle("sheet--expanded", expanded);
    sheet.classList.toggle("sheet--collapsed", !expanded);
    document.body.classList.toggle("sheet-open", expanded);
    handle.setAttribute("aria-expanded", String(expanded));
    handle.setAttribute("aria-label", t(locale, expanded ? "collapse" : "expand"));
  };

  const api: Sheet = {
    expand: () => {
      expanded = true;
      apply();
    },
    collapse: () => {
      expanded = false;
      apply();
    },
    toggle: () => {
      expanded = !expanded;
      apply();
    },
    isExpanded: () => expanded,
  };

  let startY: number | null = null;
  let dragged = false;
  handle.addEventListener("pointerdown", (e) => {
    startY = e.clientY;
    dragged = false;
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener("pointermove", (e) => {
    if (startY === null) return;
    const dy = e.clientY - startY;
    if (Math.abs(dy) < DRAG_THRESHOLD_PX) return;
    dragged = true;
    if (dy < 0) api.expand();
    else api.collapse();
    startY = null;
  });
  const endDrag = (): void => {
    startY = null;
  };
  handle.addEventListener("pointerup", endDrag);
  handle.addEventListener("pointercancel", endDrag);
  handle.addEventListener("click", () => {
    if (dragged) {
      dragged = false;
      return;
    }
    api.toggle();
  });

  apply();
  return api;
}
