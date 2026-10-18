import { NextResponse, type NextRequest } from "next/server";

// HTTP basic auth (any username) on the organizer world view, mirroring the server's /admin. Unset in local
// dev means open, like the server; set ADMIN_PASSWORD before exposing the client.
export function proxy(request: NextRequest) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return NextResponse.next();
  const [scheme, encoded] = (request.headers.get("authorization") ?? "").split(" ");
  if (scheme === "Basic" && encoded) {
    const decoded = atob(encoded);
    if (safeEqual(decoded.slice(decoded.indexOf(":") + 1), password)) return NextResponse.next();
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="unif.ai world"' },
  });
}

function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export const config = { matcher: ["/world/:path*"] };
