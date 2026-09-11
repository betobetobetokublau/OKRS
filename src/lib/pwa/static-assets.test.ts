import { describe, it, expect } from 'vitest';
import { extractStaticAssets } from './static-assets';

describe('extractStaticAssets', () => {
  it('reads script and link tags from HTML', () => {
    const html = `<link rel="stylesheet" href="/_next/static/css/app/layout.abc.css"><script src="/_next/static/chunks/webpack-1.js" async></script><script src="/_next/static/chunks/app/(dashboard)/%5Bworkspace-slug%5D/check-in/page-3c8.js"></script>`;
    expect(extractStaticAssets(html)).toEqual([
      '/_next/static/css/app/layout.abc.css',
      '/_next/static/chunks/webpack-1.js',
      '/_next/static/chunks/app/(dashboard)/%5Bworkspace-slug%5D/check-in/page-3c8.js',
    ]);
  });
  it('reads chunk references from RSC flight payloads and normalises the prefix', () => {
    const rsc = `2:I["(app-pages-browser)/./x.tsx",["2117","static/chunks/2117-7d36a9365e11adea.js","app/(dashboard)/[workspace-slug]/check-in/page","static/chunks/app/(dashboard)/%5Bworkspace-slug%5D/check-in/page-3c86440acc6bfbe2.js"],"default"]`;
    const out = extractStaticAssets(rsc);
    expect(out).toContain('/_next/static/chunks/2117-7d36a9365e11adea.js');
    expect(out).toContain('/_next/static/chunks/app/(dashboard)/%5Bworkspace-slug%5D/check-in/page-3c86440acc6bfbe2.js');
  });
  it('dedupes', () => {
    const t = `<script src="/_next/static/chunks/a.js"></script> "static/chunks/a.js"`;
    expect(extractStaticAssets(t)).toEqual(['/_next/static/chunks/a.js']);
  });
});
