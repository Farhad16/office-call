import { useEffect, useState } from 'react';

export type Route = 'order' | 'dashboard';

const routeOf = (path: string): Route => (path.replace(/\/+$/, '') === '/dashboard' ? 'dashboard' : 'order');
const pathOf = (route: Route) => (route === 'dashboard' ? '/dashboard' : '/');

/** Tiny router for two pages: / and /dashboard. Back/forward buttons work. */
export function useRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState<Route>(() => routeOf(window.location.pathname));
  useEffect(() => {
    const onPop = () => setRoute(routeOf(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  function navigate(next: Route) {
    if (next === route) return;
    window.history.pushState(null, '', pathOf(next));
    setRoute(next);
  }
  return [route, navigate];
}
