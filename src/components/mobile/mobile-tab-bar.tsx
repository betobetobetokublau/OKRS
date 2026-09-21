'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface MobileTabBarProps {
  slug: string;
  /** Shows the red dot on Check-in. */
  checkinPending: boolean;
}

/** Height of the bar itself, without the device safe-area. Layout pads the page by this. */
export const MOBILE_TAB_BAR_HEIGHT = 58;

interface Tab {
  label: string;
  href: string;
  /** Pathname prefixes that light this tab up. */
  match: string[];
  icon: string;
  badge?: boolean;
}

/**
 * Phone-only bottom navigation (design B1 «Proyectos + Hoy»):
 * Proyectos · Mis Tareas · Objetivos · Check-in · Más. Replaces the sidebar
 * below 768px. Rendered by the workspace layout.
 */
export function MobileTabBar({ slug, checkinPending }: MobileTabBarProps) {
  const pathname = usePathname() ?? '';
  // `position: fixed` resolves against the initial containing block, and in
  // Chrome's device emulation the ICB is BIGGER than the emulated screen (an
  // iPhone 16 Pro Max profile reports a 440x956 screen against a 456x991 ICB),
  // so `right: 0` / `bottom: 0` put the bar 16px right and 35px below the fold
  // and it only appeared after scrolling. Things that look like a fix and are
  // not, all checked in a real browser:
  //   · `overflow-x: hidden` never clips a fixed element.
  //   · `clientWidth/Height` only match the visible box while a scrollbar is
  //     present; on a short page they report the ICB instead.
  //   · `visualViewport` is wrong on a real iPhone: Safari shrinks it by the
  //     height of its own toolbar, so the bar floated well above the bottom.
  // `screen` is the one box no browser chrome distorts. Capping the client box
  // with it fixes the emulator and is a no-op on a real device, where the two
  // already agree — there the browser keeps the bar above its toolbar itself.
  const [fit, setFit] = useState<{ width: number | null; bottom: number }>({ width: null, bottom: 0 });

  useEffect(() => {
    const measure = () => {
      const de = document.documentElement;
      // `screen` does not rotate on iOS, so pick the side that matches the
      // current orientation instead of trusting screen.width to be the width.
      const shorter = Math.min(screen.width, screen.height);
      const longer = Math.max(screen.width, screen.height);
      const portrait = window.innerHeight >= window.innerWidth;
      const visibleW = Math.min(de.clientWidth, portrait ? shorter : longer);
      const visibleH = Math.min(de.clientHeight, window.innerHeight, portrait ? longer : shorter);
      const next = { width: visibleW, bottom: Math.max(0, window.innerHeight - visibleH) };
      setFit((prev) => (prev.width === next.width && prev.bottom === next.bottom ? prev : next));
    };
    measure();
    // A late pass plus a body observer: the visible box also changes when a slow
    // page swaps its spinner for content and a scrollbar appears, and no
    // `resize` event is fired for that.
    const late = setTimeout(measure, 400);
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      clearTimeout(late);
      ro.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, []);

  const base = `/${slug}`;
  const tabs: Tab[] = [
    { label: 'Proyectos', href: `${base}/tableros`, match: [`${base}/tableros`, `${base}/tareas`], icon: 'M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v6h-4z' },
    { label: 'Mis Tareas', href: `${base}/mis-tareas`, match: [`${base}/mis-tareas`], icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
    { label: 'Objetivos', href: `${base}/objetivos`, match: [`${base}/objetivos`, `${base}/okrs`, `${base}/kpis`], icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
    { label: 'Check-in', href: `${base}/check-in`, match: [`${base}/check-in`], icon: 'M5 13l4 4L19 7', badge: checkinPending },
    { label: 'Más', href: `${base}/mas`, match: [`${base}/mas`, `${base}/equipo`, `${base}/periodos`, `${base}/configuracion`, `${base}/departamentos`, `${base}/revision-mensual`, `${base}/trimestral`], icon: 'M4 6h16M4 12h16M4 18h16' },
  ];
  // Dashboard (`/slug`) belongs to Más; everything else matches by prefix.
  const isActive = (t: Tab) => t.match.some((m) => pathname === m || pathname.startsWith(`${m}/`)) || (t.label === 'Más' && pathname === base);

  return (
    <nav
      aria-label="Navegación principal"
      style={{
        position: 'fixed',
        left: 0,
        // Self-corrected to the visible box; `right: 0` / `bottom: 0` target the ICB.
        width: fit.width ?? '100%',
        bottom: fit.bottom,
        zIndex: 140,
        height: `calc(${MOBILE_TAB_BAR_HEIGHT}px + env(safe-area-inset-bottom, 0px))`,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        backgroundColor: 'white',
        borderTop: '1px solid #dfe3e8',
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'stretch',
      }}
    >
      {tabs.map((t) => {
        const active = isActive(t);
        return (
          <Link
            key={t.label}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.3rem',
              textDecoration: 'none',
              color: active ? '#5c6ac4' : '#919eab',
              fontSize: '1.05rem',
              fontWeight: active ? 600 : 500,
              position: 'relative',
              minWidth: 0,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={t.icon} />
            </svg>
            <span style={{ whiteSpace: 'nowrap' }}>{t.label}</span>
            {t.badge && <span aria-label="Pendiente" style={{ position: 'absolute', top: 8, right: 'calc(50% - 16px)', width: 8, height: 8, borderRadius: '50%', backgroundColor: '#de3618' }} />}
          </Link>
        );
      })}
    </nav>
  );
}
