export function isApiPath(pathname: string) {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export function isAuthPath(pathname: string) {
  return (
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/auth")
  );
}

export function getAuthRouteDecision({
  pathname,
  isAuthenticated,
  registrationEnabled,
}: {
  pathname: string;
  isAuthenticated: boolean;
  registrationEnabled: boolean;
}) {
  if (
    isAuthenticated &&
    (pathname.startsWith("/login") || pathname.startsWith("/register"))
  ) {
    return { type: "redirect" as const, pathname: "/" };
  }

  if (!registrationEnabled && pathname.startsWith("/register")) {
    return { type: "redirect" as const, pathname: "/login" };
  }

  if (!isAuthenticated && !isAuthPath(pathname)) {
    return isApiPath(pathname)
      ? { type: "api-unauthorized" as const }
      : { type: "redirect" as const, pathname: "/login" };
  }

  return { type: "next" as const };
}
