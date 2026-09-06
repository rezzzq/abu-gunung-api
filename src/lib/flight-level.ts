import type { Locale } from "./time";

const FEET_PER_FLIGHT_LEVEL = 100;
const METRES_PER_FOOT = 0.3048;

export function flightLevelToFeet(fl: number): number {
  return fl * FEET_PER_FLIGHT_LEVEL;
}

export function flightLevelToMetres(fl: number): number {
  return Math.round(flightLevelToFeet(fl) * METRES_PER_FOOT);
}

/** Short altitude for headlines, e.g. "15,2 km" or "15.2 km". */
export function formatKm(fl: number, locale: Locale): string {
  const km = (flightLevelToMetres(fl) / 1000).toFixed(1);
  return `${locale === "id" ? km.replace(".", ",") : km} km`;
}

/** Human readable altitude, e.g. "15,2 km (50.000 kaki)" or "15.2 km (50,000 ft)". */
export function formatAltitude(fl: number, locale: Locale): string {
  const feet = flightLevelToFeet(fl);
  if (locale === "id") return `${formatKm(fl, locale)} (${feet.toLocaleString("id-ID")} kaki)`;
  return `${formatKm(fl, locale)} (${feet.toLocaleString("en-US")} ft)`;
}
