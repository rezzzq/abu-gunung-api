import { t, type Locale } from "../i18n";
import type { Advisory } from "../lib/schema";
import { formatClock, type Zone } from "../lib/time";
import type { TimeStep } from "../map/ash-layer";

const PLAY_INTERVAL_MS = 1500;
const PLAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"/></svg>';
const PAUSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h4v16H6zm8 0h4v16h-4z"/></svg>';

/** Observation first, then each forecast, as chip-ready steps. */
export function buildSteps(adv: Advisory, locale: Locale, zone: Zone): TimeStep[] {
  const steps: TimeStep[] = [];
  if (adv.observation) {
    const key = adv.observation.kind === "OBS" ? "observedAt" : "estimatedAt";
    steps.push({
      label: t(locale, "stepNow"),
      time: adv.observation.time,
      description: t(locale, key, { time: `${formatClock(adv.observation.time, zone)} ${zone}` }),
      layers: adv.observation.layers,
    });
  }
  for (const f of adv.forecasts) {
    steps.push({
      label: t(locale, "stepPlus", { h: f.hoursAhead }),
      time: f.time,
      description: t(locale, "forecastFor", { time: `${formatClock(f.time, zone)} ${zone}` }),
      layers: f.layers,
    });
  }
  return steps;
}

export interface TimeChips {
  setIndex(i: number): void;
  getIndex(): number;
  stop(): void;
}

export function initTimeChips(
  el: HTMLElement,
  steps: TimeStep[],
  locale: Locale,
  zone: Zone,
  onChange: (index: number) => void,
): TimeChips {
  el.innerHTML = "";
  let index = 0;
  let timer: number | null = null;
  const buttons: HTMLButtonElement[] = [];

  const render = (): void => {
    buttons.forEach((b, i) => {
      b.setAttribute("aria-selected", String(i === index));
      b.tabIndex = i === index ? 0 : -1;
    });
  };
  const setIndex = (i: number): void => {
    if (!steps.length) return;
    index = ((i % steps.length) + steps.length) % steps.length;
    render();
    onChange(index);
  };
  const stop = (): void => {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
    playButton.setAttribute("aria-pressed", "false");
    playButton.setAttribute("aria-label", t(locale, "play"));
    playButton.innerHTML = PLAY_ICON;
  };
  const start = (): void => {
    if (steps.length < 2) return;
    timer = window.setInterval(() => setIndex(index + 1), PLAY_INTERVAL_MS);
    playButton.setAttribute("aria-pressed", "true");
    playButton.setAttribute("aria-label", t(locale, "pause"));
    playButton.innerHTML = PAUSE_ICON;
  };

  steps.forEach((step, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "segment";
    b.setAttribute("role", "tab");
    b.textContent = step.label;
    b.title = `${formatClock(step.time, zone)} ${zone}`;
    b.addEventListener("click", () => {
      stop();
      setIndex(i);
    });
    b.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        stop();
        setIndex(index + (e.key === "ArrowRight" ? 1 : -1));
        buttons[index]?.focus();
      }
    });
    buttons.push(b);
    el.append(b);
  });

  const playButton = document.createElement("button");
  playButton.type = "button";
  playButton.className = "segment segment--play";
  playButton.addEventListener("click", () => {
    if (timer !== null) stop();
    else start();
  });
  if (steps.length > 1) el.append(playButton);
  stop();

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
  });

  if (steps.length) setIndex(0);
  return { setIndex, getIndex: () => index, stop };
}
