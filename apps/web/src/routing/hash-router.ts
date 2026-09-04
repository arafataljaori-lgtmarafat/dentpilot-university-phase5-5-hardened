import { useEffect, useState } from 'react';

export interface RouteLocation { path: string; segments: string[]; }

function readLocation(): RouteLocation {
  const raw = window.location.hash.replace(/^#/, '') || '/dashboard';
  const path = raw.startsWith('/') ? raw : `/${raw}`;
  const safeDecode = (value: string) => { try { return decodeURIComponent(value); } catch { return value; } };
  return { path, segments: path.split('/').filter(Boolean).map(safeDecode) };
}

export function navigate(path: string): void {
  const target = path.startsWith('/') ? path : `/${path}`;
  if (window.location.hash === `#${target}`) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else window.location.hash = target;
}

export function useHashRoute(): RouteLocation {
  const [location, setLocation] = useState<RouteLocation>(() => readLocation());
  useEffect(() => {
    const listener = () => setLocation(readLocation());
    window.addEventListener('hashchange', listener);
    return () => window.removeEventListener('hashchange', listener);
  }, []);
  return location;
}
