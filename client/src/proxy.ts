import { NextResponse, type NextRequest } from "next/server";

// HTTP basic auth on /admin, matching the server's admin gate: any username, ADMIN_PASSWORD as the password.
// With no ADMIN_PASSWORD set (local dev) the admin is open, the same as on the server.
export function proxy(request: NextRequest) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return NextResponse.next();
  const header = request.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  const given = scheme === "Basic" && encoded ? atob(encoded).split(":").slice(1).join(":") : null;
  if (given !== null && timingSafeEqual(given, password)) return NextResponse.next();
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="unif.ai admin"' },
  });
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
