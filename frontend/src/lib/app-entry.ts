export function isAppEntryPath(pathname = window.location.pathname) {
  return pathname === '/app' || pathname.startsWith('/app/')
}

export function resolveAppRoute<TDefault extends string, TApp extends string>(
  pathname: string,
  desktopRoute: TDefault,
  appRoute: TApp,
) {
  return isAppEntryPath(pathname) ? appRoute : desktopRoute
}
