/**
 * Mirror of `extractStaticAssets` in public/sw.js — keep both in sync.
 * Finds every `/_next/static/...` asset referenced by an HTML document
 * (script/link tags) or an RSC flight payload ("static/chunks/…js" strings).
 */
export function extractStaticAssets(text: string): string[] {
  const out = new Set<string>();
  const attr = /(?:src|href)="(\/_next\/static\/[^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = attr.exec(text)) !== null) out.add(m[1]!.replace(/&amp;/g, '&'));
  const flight = /(?:\/_next\/)?static\/(?:chunks|css)\/[A-Za-z0-9_\-./%()[\]]+?\.(?:js|css)/g;
  while ((m = flight.exec(text)) !== null) {
    const path = m[0].startsWith('/_next/') ? m[0] : `/_next/${m[0]}`;
    out.add(path.replace(/\\/g, ''));
  }
  return Array.from(out);
}
