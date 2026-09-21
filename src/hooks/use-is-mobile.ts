'use client';

import { useEffect, useState } from 'react';

/** Phone breakpoint shared by the mobile shell and the CSS utilities in globals.css. */
export const MOBILE_MAX_WIDTH = 767;
const QUERY = `(max-width: ${MOBILE_MAX_WIDTH}px)`;

/**
 * True on phone-sized viewports. Starts `false` on the server and on the first
 * client render so hydration matches; flips right after mount. Components that
 * must not flash the desktop layout should render nothing until `ready`.
 */
export function useIsMobile(): { isMobile: boolean; ready: boolean } {
  const [state, setState] = useState({ isMobile: false, ready: false });
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const apply = () => setState({ isMobile: mq.matches, ready: true });
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  return state;
}
