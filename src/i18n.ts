export type Locale = "id" | "en";

const STORAGE_KEY = "krakatau.locale";

const id = {
  appTitle: "Sebaran Abu Gunung Api",
  subtitle: "Peta langsung abu vulkanik gunung api Indonesia",
  updated: "Diperbarui {rel}",
  noAdvisory: "Saat ini tidak ada peringatan sebaran abu yang aktif untuk {name}.",
  noAdvisoryHint: "Peta akan terisi lagi begitu VAAC Darwin menerbitkan peringatan baru.",
  noVolcanoes: "Saat ini tidak ada gunung api dengan peringatan abu aktif.",
  volcanoList: "Pilih gunung api",
  advisoryEnded: "Peringatan abu terakhir sudah berakhir.",
  stepNow: "Sekarang",
  stepPlus: "+{h} jam",
  observedAt: "Diamati {time}",
  estimatedAt: "Diperkirakan {time}",
  forecastFor: "Perkiraan untuk {time}",
  layerLow: "Abu rendah",
  layerHigh: "Abu tinggi",
  layerRange: "{base} sampai {top}",
  altitudeTop: "Puncak abu {alt}",
  surface: "permukaan",
  moving: "Bergerak ke {dir} {speed} km/jam",
  notMoving: "Arah gerak tidak dilaporkan",
  alertLevel: "Status PVMBG",
  vonaCode: "Kode VONA",
  advisoryNo: "Peringatan VAAC no. {n}",
  issued: "Terbit {time}",
  nextAdvisory: "Pembaruan berikutnya paling lambat {time}",
  ashTop: "Abu hingga {alt}",
  ashTowards: "bergerak ke {dir}",
  wind: "Angin di atas kawah",
  windHint: "Abu terbawa searah angin. Panah menunjukkan ke mana abu bergerak.",
  windSurface: "Permukaan",
  windLow: "±1,5 km",
  windMid: "±5,5 km",
  windHigh: "±10,5 km",
  windUnavailable: "Data angin tidak tersedia saat ini.",
  windAt: "Angin pukul {time} WIB",
  checkLocation: "Cek lokasi saya",
  locating: "Mencari lokasi Anda…",
  locationDenied: "Lokasi tidak bisa diakses. Izinkan akses lokasi di peramban lalu coba lagi.",
  locationUnsupported: "Peramban ini tidak mendukung lokasi.",
  insideAsh: "Lokasi Anda berada di dalam area perkiraan sebaran abu ({layers}).",
  outsideAsh: "Lokasi Anda berada di luar area perkiraan sebaran abu untuk waktu ini.",
  distanceFrom: "Anda sekitar {km} km dari {name}.",
  forecastCaveat: "Ini perkiraan kasar dari peringatan penerbangan, bukan pengukuran abu di darat. Tetap ikuti arahan BPBD setempat.",
  safetyTitle: "Jika abu sampai ke tempat Anda",
  safety1: "Pakai masker saat di luar. Masker N95 lebih baik daripada masker kain.",
  safety2: "Tutup pintu dan jendela. Tunda kegiatan di luar rumah.",
  safety3: "Lindungi mata dengan kacamata. Jangan pakai lensa kontak.",
  safety4: "Tutup tandon air. Cuci sayur dan buah sebelum dimakan.",
  safety5: "Bersihkan abu di atap jika tebal. Abu basah sangat berat.",
  officialLinks: "Sumber resmi",
  linkMagma: "MAGMA Indonesia (PVMBG)",
  linkBmkg: "BMKG",
  linkVaac: "VAAC Darwin",
  share: "Bagikan peta ini",
  shareText: "Peta langsung sebaran abu gunung api Indonesia, diperbarui otomatis.",
  copied: "Tautan disalin",
  madeBy: "Dibuat sukarela oleh",
  madeByTail: "Gratis, tanpa iklan.",
  dataFrom: "Data: VAAC Darwin, PVMBG/MAGMA Indonesia, NASA GIBS dan NOAA Open Data (Himawari-9), Open-Meteo.",
  satellite: "Citra satelit",
  satelliteOff: "Citra satelit: mati",
  satelliteRgb: "Citra satelit: RGB abu",
  satelliteIr: "Citra satelit: inframerah",
  satelliteSignal: "Citra satelit: sinyal abu (eksperimental)",
  tagSignal: "Sinyal abu",
  signalLegend: "Sinyal abu satelit, eksperimental",
  signalCaveat: "Bisa keliru: awan tebal dan pegunungan juga memicu. Zona resmi tetap acuan.",
  signalWeak: "lemah",
  signalStrong: "kuat",
  satelliteFrame: "Himawari-9, sekitar {time} WIB",
  satelliteLatest: "Himawari-9, bingkai terbaru",
  tagRgb: "RGB abu",
  tagIr: "IR",
  rgbAsh: "Kemungkinan abu",
  rgbIce: "Awan es tinggi",
  rgbLow: "Awan rendah / permukaan",
  rgbTime: "Himawari-9 {time} WIB",
  rgbStale: "citra lama",
  rgbUnavailable: "Citra RGB abu belum tersedia",
  windToggle: "Panah angin",
  locateToggle: "Lokasi saya",
  themeToggle: "Mode gelap",
  statusTitle: "Peringatan resmi",
  loadError: "Data peta tidak bisa dimuat. Periksa koneksi lalu coba lagi.",
  retry: "Coba lagi",
  sourceWarn: "Sebagian sumber data gagal diperbarui. Data yang tampil mungkin lebih lama.",
  play: "Putar urutan waktu",
  pause: "Jeda",
  language: "English",
  expand: "Buka rincian",
  collapse: "Tutup rincian",
  legend: "Keterangan",
  legendVolcano: "Anak Krakatau",
  level1: "Normal",
  level2: "Waspada",
  level3: "Siaga",
  level4: "Awas",
  levelLabel: "Level {roman} ({name})",
  vonaRed: "Merah",
  vonaOrange: "Oranye",
  vonaYellow: "Kuning",
  vonaGreen: "Hijau",
  vonaUnknown: "Tidak diketahui",
  readMore: "Selengkapnya",
  readLess: "Ringkas",
} as const;

export type StringKey = keyof typeof id;

const en: Record<StringKey, string> = {
  appTitle: "Indonesia Volcanic Ash Map",
  subtitle: "Live volcanic ash map for Indonesia's erupting volcanoes",
  updated: "Updated {rel}",
  noAdvisory: "There is no active ash advisory for {name} right now.",
  noAdvisoryHint: "The map fills in again as soon as VAAC Darwin issues a new advisory.",
  noVolcanoes: "No volcano has an active ash advisory right now.",
  volcanoList: "Choose a volcano",
  advisoryEnded: "The last ash advisory has ended.",
  stepNow: "Now",
  stepPlus: "+{h} h",
  observedAt: "Observed {time}",
  estimatedAt: "Estimated {time}",
  forecastFor: "Forecast for {time}",
  layerLow: "Low ash",
  layerHigh: "High ash",
  layerRange: "{base} to {top}",
  altitudeTop: "Ash top {alt}",
  surface: "surface",
  moving: "Moving {dir} at {speed} km/h",
  notMoving: "Movement not reported",
  alertLevel: "PVMBG status",
  vonaCode: "VONA code",
  advisoryNo: "VAAC advisory no. {n}",
  issued: "Issued {time}",
  nextAdvisory: "Next update no later than {time}",
  ashTop: "Ash up to {alt}",
  ashTowards: "moving {dir}",
  wind: "Wind above the crater",
  windHint: "Ash travels with the wind. Arrows show where ash is heading.",
  windSurface: "Surface",
  windLow: "≈1.5 km",
  windMid: "≈5.5 km",
  windHigh: "≈10.5 km",
  windUnavailable: "Wind data is not available right now.",
  windAt: "Wind at {time} WIB",
  checkLocation: "Check my location",
  locating: "Finding your location…",
  locationDenied: "Location is not available. Allow location access in your browser and try again.",
  locationUnsupported: "This browser does not support location.",
  insideAsh: "Your location is inside the forecast ash area ({layers}).",
  outsideAsh: "Your location is outside the forecast ash area for this time.",
  distanceFrom: "You are about {km} km from {name}.",
  forecastCaveat: "This is a coarse estimate from aviation advisories, not a ground measurement. Follow local BPBD guidance.",
  safetyTitle: "If ash reaches you",
  safety1: "Wear a mask outdoors. An N95 works better than a cloth mask.",
  safety2: "Close doors and windows. Postpone outdoor activities.",
  safety3: "Protect your eyes with glasses. Do not wear contact lenses.",
  safety4: "Cover water tanks. Wash fruit and vegetables before eating.",
  safety5: "Clear thick ash from roofs. Wet ash is very heavy.",
  officialLinks: "Official sources",
  linkMagma: "MAGMA Indonesia (PVMBG)",
  linkBmkg: "BMKG",
  linkVaac: "VAAC Darwin",
  share: "Share this map",
  shareText: "Live ash map for Indonesia's erupting volcanoes, updated automatically.",
  copied: "Link copied",
  madeBy: "Made as a volunteer effort by",
  madeByTail: "Free, no ads.",
  dataFrom: "Data: VAAC Darwin, PVMBG/MAGMA Indonesia, NASA GIBS and NOAA Open Data (Himawari-9), Open-Meteo.",
  satellite: "Satellite imagery",
  satelliteOff: "Satellite imagery: off",
  satelliteRgb: "Satellite imagery: ash RGB",
  satelliteIr: "Satellite imagery: infrared",
  satelliteSignal: "Satellite imagery: ash signal (experimental)",
  tagSignal: "Ash signal",
  signalLegend: "Satellite ash signal, experimental",
  signalCaveat: "Can be wrong: thick cloud and mountains trigger it too. The official zones remain the reference.",
  signalWeak: "weak",
  signalStrong: "strong",
  satelliteFrame: "Himawari-9, about {time} WIB",
  satelliteLatest: "Himawari-9, latest frame",
  tagRgb: "Ash RGB",
  tagIr: "IR",
  rgbAsh: "Possible ash",
  rgbIce: "High ice cloud",
  rgbLow: "Low cloud / surface",
  rgbTime: "Himawari-9 {time} WIB",
  rgbStale: "old image",
  rgbUnavailable: "Ash RGB imagery not available yet",
  windToggle: "Wind arrows",
  locateToggle: "My location",
  themeToggle: "Dark mode",
  statusTitle: "Official advisory",
  loadError: "Map data could not be loaded. Check your connection and try again.",
  retry: "Try again",
  sourceWarn: "Some data sources failed to refresh. What you see may be older.",
  play: "Play the time sequence",
  pause: "Pause",
  language: "Bahasa Indonesia",
  expand: "Open details",
  collapse: "Close details",
  legend: "Legend",
  legendVolcano: "Anak Krakatau",
  level1: "Normal",
  level2: "Advisory",
  level3: "Watch",
  level4: "Warning",
  levelLabel: "Level {roman} ({name})",
  vonaRed: "Red",
  vonaOrange: "Orange",
  vonaYellow: "Yellow",
  vonaGreen: "Green",
  vonaUnknown: "Unknown",
  readMore: "Read more",
  readLess: "Show less",
};

export const STRINGS: Record<Locale, Record<StringKey, string>> = { id, en };

export function getLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "id" || stored === "en") return stored;
  } catch {
    // Storage can be blocked (private mode); the default locale is fine.
  }
  return "id";
}

export function setLocale(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Same as above: a blocked storage only loses the preference.
  }
}

export function t(locale: Locale, key: StringKey, vars: Record<string, string | number> = {}): string {
  let s: string = STRINGS[locale][key];
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

const COMPASS_ID: Record<string, string> = {
  N: "utara", NNE: "utara-timur laut", NE: "timur laut", ENE: "timur-timur laut",
  E: "timur", ESE: "timur-tenggara", SE: "tenggara", SSE: "selatan-tenggara",
  S: "selatan", SSW: "selatan-barat daya", SW: "barat daya", WSW: "barat-barat daya",
  W: "barat", WNW: "barat-barat laut", NW: "barat laut", NNW: "utara-barat laut",
};
const COMPASS_EN: Record<string, string> = {
  N: "north", NNE: "north-northeast", NE: "northeast", ENE: "east-northeast",
  E: "east", ESE: "east-southeast", SE: "southeast", SSE: "south-southeast",
  S: "south", SSW: "south-southwest", SW: "southwest", WSW: "west-southwest",
  W: "west", WNW: "west-northwest", NW: "northwest", NNW: "north-northwest",
};

/** Turns a VAAC compass abbreviation ("W", "SE") into words for the locale. */
export function compassName(locale: Locale, abbr: string): string {
  const table = locale === "id" ? COMPASS_ID : COMPASS_EN;
  return table[abbr.toUpperCase()] ?? abbr;
}

const POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

/** Nearest 8-point compass abbreviation for a bearing in degrees. */
export function bearingToCompass(deg: number): string {
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return POINTS[idx]!;
}

const ROMAN = ["", "I", "II", "III", "IV"] as const;

export function levelLabel(locale: Locale, level: number, nameFromSource: string): string {
  const key = (`level${level}` as StringKey);
  const name = locale === "id" ? nameFromSource : STRINGS.en[key] ?? nameFromSource;
  return t(locale, "levelLabel", { roman: ROMAN[level] ?? String(level), name });
}

export function vonaColorLabel(locale: Locale, color: string): string {
  const map: Record<string, StringKey> = { red: "vonaRed", orange: "vonaOrange", yellow: "vonaYellow", green: "vonaGreen" };
  const key = map[color.toLowerCase()];
  return key ? t(locale, key) : t(locale, "vonaUnknown");
}
