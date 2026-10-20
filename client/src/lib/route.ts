import { useCallback, useEffect, useState } from 'react';
import { withTransition } from './transition';

export type Route = 'order' | 'dashboard';

const routeOf = (path: string): Route => (path.replace(/\/+$/, '') === '/dashboard' ? 'dashboard' : 'order');
const pathOf = (route: Route) => (route === 'dashboard' ? '/dashboard' : '/');

/** Tiny router for two pages: / and /dashboard. Back/forward buttons work. */
export function useRoute(): [Route, (route: Route, replace?: boolean) => void] {
  const [route, setRoute] = useState<Route>(() => routeOf(window.location.pathname));
  useEffect(() => {
    const onPop = () => withTransition(() => setRoute(routeOf(window.location.pathname)));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  /** `replace` swaps the current history entry (for redirects), so Back doesn't loop. */
  const navigate = useCallback((next: Route, replace = false) => {
    if (routeOf(window.location.pathname) === next) return;
    if (replace) {
      window.history.replaceState(null, '', pathOf(next));
      setRoute(next);
      return;
    }
    window.history.pushState(null, '', pathOf(next));
    withTransition(() => setRoute(next));
  }, []);
  return [route, navigate];
}
