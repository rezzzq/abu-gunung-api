/**
 * Helpers for the Bureau of Meteorology's anonymous VAAC archive
 * (ftp://ftp.bom.gov.au/anon/gen/vaac/<year>/). Text advisories are
 * IDY41xxx.<YYYYMMDDHHMM>.txt in ten product slots; the matching graphic is
 * IDY65xxx with the same stamp. Which volcano a slot carries changes over
 * time, so the volcano is always read from the file itself.
 */
export interface ArchiveFile {
  product: string;
  stamp: string;
  name: string;
}

const TEXT_RE = /^(IDY41\d{3})\.(\d{12})\.txt$/;

/** Advisory text entries from a plain listing (one file name per line). */
export function parseListing(listing: string): ArchiveFile[] {
  const files: ArchiveFile[] = [];
  for (const line of listing.split(/\r?\n/)) {
    const name = line.trim().split(/\s+/).pop() ?? "";
    const m = TEXT_RE.exec(name);
    if (m) files.push({ product: m[1]!, stamp: m[2]!, name });
  }
  return files;
}

/** Newest text file per product slot. */
export function newestPerProduct(files: ArchiveFile[]): Map<string, ArchiveFile> {
  const newest = new Map<string, ArchiveFile>();
  for (const f of files) {
    const current = newest.get(f.product);
    if (!current || f.stamp > current.stamp) newest.set(f.product, f);
  }
  return newest;
}

/** Graphic file that accompanies an advisory text file, or null when the name does not fit. */
export function graphicNameFor(textName: string): string | null {
  const m = TEXT_RE.exec(textName);
  return m ? `IDY65${m[1]!.slice(5)}.${m[2]}.png` : null;
}
