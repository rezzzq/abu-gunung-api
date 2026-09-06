/**
 * Larger Indonesian airports that file METAR weather reports. Positions are
 * approximate (from public airport listings, good to about 2 km), which is
 * enough to rank airports by distance from a volcano.
 */
export interface AirportInfo {
  icao: string;
  iata: string;
  name: string;
  city: string;
  lat: number;
  lon: number;
  /** Official airport website, only where it was verified to answer (7 Sep 2026). */
  site?: string;
}

export const AIRPORTS: AirportInfo[] = [
  { icao: "WIII", iata: "CGK", name: "Soekarno-Hatta", city: "Jakarta", lat: -6.126, lon: 106.656, site: "https://soekarnohatta.injourneyairports.id/" },
  { icao: "WIHH", iata: "HLP", name: "Halim Perdanakusuma", city: "Jakarta", lat: -6.267, lon: 106.891 },
  { icao: "WICC", iata: "BDO", name: "Husein Sastranegara", city: "Bandung", lat: -6.901, lon: 107.576 },
  { icao: "WICA", iata: "KJT", name: "Kertajati", city: "Majalengka", lat: -6.648, lon: 108.166, site: "https://kertajati-airport.co.id/" },
  { icao: "WILL", iata: "TKG", name: "Radin Inten II", city: "Bandar Lampung", lat: -5.243, lon: 105.179 },
  { icao: "WIPP", iata: "PLM", name: "Sultan Mahmud Badaruddin II", city: "Palembang", lat: -2.898, lon: 104.700 },
  { icao: "WIGG", iata: "BKS", name: "Fatmawati Soekarno", city: "Bengkulu", lat: -3.861, lon: 102.339 },
  { icao: "WIJJ", iata: "DJB", name: "Sultan Thaha", city: "Jambi", lat: -1.638, lon: 103.644 },
  { icao: "WIEE", iata: "PDG", name: "Minangkabau", city: "Padang", lat: -0.787, lon: 100.281 },
  { icao: "WIBB", iata: "PKU", name: "Sultan Syarif Kasim II", city: "Pekanbaru", lat: 0.461, lon: 101.445 },
  { icao: "WIMM", iata: "KNO", name: "Kualanamu", city: "Medan", lat: 3.642, lon: 98.885 },
  { icao: "WITT", iata: "BTJ", name: "Sultan Iskandar Muda", city: "Banda Aceh", lat: 5.523, lon: 95.420 },
  { icao: "WIDD", iata: "BTH", name: "Hang Nadim", city: "Batam", lat: 1.121, lon: 104.119 },
  { icao: "WAHS", iata: "SRG", name: "Jenderal Ahmad Yani", city: "Semarang", lat: -6.973, lon: 110.375 },
  { icao: "WAHI", iata: "YIA", name: "Yogyakarta International", city: "Kulon Progo", lat: -7.905, lon: 110.057, site: "https://yogyakarta-airport.co.id/" },
  { icao: "WAHQ", iata: "SOC", name: "Adi Soemarmo", city: "Solo", lat: -7.516, lon: 110.757 },
  { icao: "WARR", iata: "SUB", name: "Juanda", city: "Surabaya", lat: -7.380, lon: 112.787, site: "https://juanda-airport.com/" },
  { icao: "WARA", iata: "MLG", name: "Abdul Rachman Saleh", city: "Malang", lat: -7.927, lon: 112.715 },
  { icao: "WADY", iata: "BWX", name: "Banyuwangi", city: "Banyuwangi", lat: -8.310, lon: 114.340 },
  { icao: "WADD", iata: "DPS", name: "I Gusti Ngurah Rai", city: "Denpasar", lat: -8.748, lon: 115.167, site: "https://ngurahrai.injourneyairports.id/" },
  { icao: "WADL", iata: "LOP", name: "Lombok International", city: "Praya", lat: -8.757, lon: 116.277, site: "https://lombok-airport.co.id/" },
  { icao: "WADB", iata: "BMU", name: "Sultan Muhammad Salahuddin", city: "Bima", lat: -8.540, lon: 118.687 },
  { icao: "WATO", iata: "LBJ", name: "Komodo", city: "Labuan Bajo", lat: -8.487, lon: 119.889 },
  { icao: "WATC", iata: "MOF", name: "Frans Seda", city: "Maumere", lat: -8.641, lon: 122.237 },
  { icao: "WATE", iata: "ENE", name: "H. Hasan Aroeboesman", city: "Ende", lat: -8.849, lon: 121.661 },
  { icao: "WATL", iata: "LKA", name: "Gewayantana", city: "Larantuka", lat: -8.275, lon: 123.002 },
  { icao: "WATW", iata: "LWE", name: "Wunopito", city: "Lewoleba", lat: -8.363, lon: 123.439 },
  { icao: "WATT", iata: "KOE", name: "El Tari", city: "Kupang", lat: -10.171, lon: 123.671 },
  { icao: "WAAA", iata: "UPG", name: "Sultan Hasanuddin", city: "Makassar", lat: -5.062, lon: 119.554, site: "https://hasanuddin-airport.co.id/" },
  { icao: "WAMM", iata: "MDC", name: "Sam Ratulangi", city: "Manado", lat: 1.549, lon: 124.926 },
  { icao: "WAMT", iata: "TTE", name: "Sultan Babullah", city: "Ternate", lat: 0.831, lon: 127.381 },
  { icao: "WAMA", iata: "GLX", name: "Gamar Malamo", city: "Galela", lat: 1.839, lon: 127.786 },
  { icao: "WAEE", iata: "KAZ", name: "Kuabang", city: "Kao", lat: 1.185, lon: 127.896 },
  { icao: "WAPP", iata: "AMQ", name: "Pattimura", city: "Ambon", lat: -3.710, lon: 128.089 },
];
