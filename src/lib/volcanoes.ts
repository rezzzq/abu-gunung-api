/**
 * Indonesian volcanoes the map may show. Keys are the VAAC "VOLCANO" names
 * without the Smithsonian number. Positions come from Darwin VAAC bulletins
 * (PSN, SOURCE ELEV) and the Smithsonian GVP; an advisory's own position
 * overrides the table when present. `id` is the MAGMA Indonesia VONA code.
 */
import type { Zone } from "./time";

export interface VolcanoInfo {
  id: string;
  name: string;
  /** Civil time zone where the volcano stands. */
  zone: Zone;
  /** Name as MAGMA prints it, used to match the level table and VONA titles; null when unknown to MAGMA. */
  magmaName: string | null;
  gvp: string | null;
  lat: number | null;
  lon: number | null;
  elevationM: number | null;
  region: string | null;
}

type TableEntry = Omit<VolcanoInfo, "gvp"> & { vaac: string[] };

const TABLE: TableEntry[] = [
  { vaac: ["KRAKATAU", "ANAK KRAKATAU"], id: "KRA", zone: "WIB", name: "Anak Krakatau", magmaName: "Anak Krakatau", lat: -6.102, lon: 105.423, elevationM: 155, region: "Selat Sunda" },
  { vaac: ["SEMERU"], id: "SMR", zone: "WIB", name: "Semeru", magmaName: "Semeru", lat: -8.108, lon: 112.922, elevationM: 3657, region: "Jawa Timur" },
  { vaac: ["MERAPI"], id: "MER", zone: "WIB", name: "Merapi", magmaName: "Merapi", lat: -7.54, lon: 110.446, elevationM: 2910, region: "Jawa Tengah / DIY" },
  { vaac: ["SINABUNG"], id: "SIN", zone: "WIB", name: "Sinabung", magmaName: "Sinabung", lat: 3.167, lon: 98.4, elevationM: 2460, region: "Sumatera Utara" },
  { vaac: ["LEWOTOBI LAKI-LAKI", "LEWOTOBI"], id: "LWK", zone: "WITA", name: "Lewotobi Laki-laki", magmaName: "Lewotobi Laki-laki", lat: -8.539, lon: 122.775, elevationM: 1584, region: "Flores, NTT" },
  { vaac: ["LEWOTOBI PEREMPUAN"], id: "LWP", zone: "WITA", name: "Lewotobi Perempuan", magmaName: "Lewotobi Perempuan", lat: -8.575, lon: 122.78, elevationM: 1703, region: "Flores, NTT" },
  { vaac: ["IBU"], id: "IBU", zone: "WIT", name: "Ibu", magmaName: "Ibu", lat: 1.483, lon: 127.633, elevationM: 1325, region: "Halmahera, Maluku Utara" },
  { vaac: ["DUKONO"], id: "DUK", zone: "WIT", name: "Dukono", magmaName: "Dukono", lat: 1.7, lon: 127.9, elevationM: 1229, region: "Halmahera, Maluku Utara" },
  { vaac: ["LEWOTOLOK", "ILI LEWOTOLOK"], id: "LEW", zone: "WITA", name: "Ili Lewotolok", magmaName: "Ili Lewotolok", lat: -8.267, lon: 123.5, elevationM: 1423, region: "Lembata, NTT" },
  { vaac: ["MARAPI"], id: "MAR", zone: "WIB", name: "Marapi", magmaName: "Marapi", lat: -0.381, lon: 100.473, elevationM: 2891, region: "Sumatera Barat" },
  { vaac: ["RAUNG"], id: "RAU", zone: "WIB", name: "Raung", magmaName: "Raung", lat: -8.119, lon: 114.056, elevationM: 3260, region: "Jawa Timur" },
  { vaac: ["BROMO", "TENGGER CALDERA"], id: "BRO", zone: "WIB", name: "Bromo", magmaName: "Bromo", lat: -7.942, lon: 112.95, elevationM: 2329, region: "Jawa Timur" },
  { vaac: ["KARANGETANG"], id: "KAR", zone: "WITA", name: "Karangetang", magmaName: "Karangetang", lat: 2.781, lon: 125.407, elevationM: 1797, region: "Siau, Sulawesi Utara" },
  { vaac: ["RUANG"], id: "RUA", zone: "WITA", name: "Ruang", magmaName: "Ruang", lat: 2.3, lon: 125.37, elevationM: 725, region: "Sulawesi Utara" },
  { vaac: ["AWU"], id: "AWU", zone: "WITA", name: "Awu", magmaName: "Awu", lat: 3.689, lon: 125.447, elevationM: 1318, region: "Sangihe, Sulawesi Utara" },
  { vaac: ["GAMALAMA"], id: "GML", zone: "WIT", name: "Gamalama", magmaName: "Gamalama", lat: 0.8, lon: 127.33, elevationM: 1715, region: "Ternate, Maluku Utara" },
  { vaac: ["SOPUTAN"], id: "SOP", zone: "WITA", name: "Soputan", magmaName: "Soputan", lat: 1.112, lon: 124.737, elevationM: 1785, region: "Sulawesi Utara" },
  { vaac: ["LOKON-EMPUNG", "LOKON"], id: "LOK", zone: "WITA", name: "Lokon", magmaName: "Lokon", lat: 1.358, lon: 124.792, elevationM: 1580, region: "Sulawesi Utara" },
  { vaac: ["RINJANI"], id: "RIN", zone: "WITA", name: "Rinjani", magmaName: "Rinjani", lat: -8.42, lon: 116.47, elevationM: 3726, region: "Lombok, NTB" },
  { vaac: ["AGUNG"], id: "AGU", zone: "WITA", name: "Agung", magmaName: "Agung", lat: -8.343, lon: 115.508, elevationM: 2997, region: "Bali" },
  { vaac: ["KELUD", "KELUT"], id: "KLD", zone: "WIB", name: "Kelud", magmaName: "Kelud", lat: -7.93, lon: 112.308, elevationM: 1731, region: "Jawa Timur" },
  { vaac: ["SANGEANG API", "SANGEANGAPI"], id: "SAN", zone: "WITA", name: "Sangeang Api", magmaName: "Sangeangapi", lat: -8.2, lon: 119.07, elevationM: 1949, region: "Sumbawa, NTB" },
  { vaac: ["IYA"], id: "IYA", zone: "WITA", name: "Iya", magmaName: "Iya", lat: -8.897, lon: 121.645, elevationM: 637, region: "Flores, NTT" },
  { vaac: ["BANDA API"], id: "BAN", zone: "WIT", name: "Banda Api", magmaName: "Banda Api", lat: -4.525, lon: 129.871, elevationM: 640, region: "Maluku" },
  { vaac: ["KERINCI"], id: "KER", zone: "WIB", name: "Kerinci", magmaName: "Kerinci", lat: -1.697, lon: 101.264, elevationM: 3800, region: "Jambi" },
  { vaac: ["SLAMET"], id: "SLA", zone: "WIB", name: "Slamet", magmaName: "Slamet", lat: -7.242, lon: 109.208, elevationM: 3428, region: "Jawa Tengah" },
  { vaac: ["DEMPO"], id: "DEM", zone: "WIB", name: "Dempo", magmaName: "Dempo", lat: -4.03, lon: 103.13, elevationM: 3173, region: "Sumatera Selatan" },
  { vaac: ["TAMBORA"], id: "TAM", zone: "WITA", name: "Tambora", magmaName: "Tambora", lat: -8.25, lon: 118.0, elevationM: 2850, region: "Sumbawa, NTB" },
];

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s-])([a-z])/g, (m) => m.toUpperCase());
}

/** Resolves a VAAC "VOLCANO" field such as "KRAKATAU 262000" to the table entry or a positionless fallback. */
export function resolveVolcano(vaacField: string): VolcanoInfo {
  const m = /^(.*?)\s*(\d{6})?\s*$/.exec(vaacField.trim().toUpperCase());
  const vaacName = (m?.[1] ?? vaacField).trim();
  const gvp = m?.[2] ?? null;
  const entry = TABLE.find((e) => e.vaac.includes(vaacName));
  if (entry) {
    const { vaac: _names, ...info } = entry;
    return { ...info, gvp };
  }
  return { id: vaacName.replace(/\s+/g, "-"), name: titleCase(vaacName), zone: "WIB", magmaName: null, gvp, lat: null, lon: null, elevationM: null, region: null };
}

/** Civil zone from longitude, for volcanoes the table does not know: Java/Bali boundary, then Maluku. */
export function zoneForLongitude(lon: number): Zone {
  if (lon < 114.45) return "WIB";
  if (lon < 126.5) return "WITA";
  return "WIT";
}

/** Table entry for a MAGMA display name ("Merapi"), or null. */
export function byMagmaName(magmaName: string): VolcanoInfo | null {
  const entry = TABLE.find((e) => e.magmaName === magmaName);
  if (!entry) return null;
  const { vaac: _names, ...info } = entry;
  return { ...info, gvp: null };
}
