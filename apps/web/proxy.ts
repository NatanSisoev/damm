import { NextResponse, type NextRequest } from "next/server";
import { HR_COOKIE, accessToken, gateEnabled } from "./lib/hr-access";

// Access gate for the HR dashboard (and its server actions, which post to /hr paths).
export async function proxy(req: NextRequest) {
  if (!gateEnabled()) return NextResponse.next();
  const token = req.cookies.get(HR_COOKIE)?.value;
  if (token && token === (await accessToken(process.env.HR_ACCESS_CODE!))) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/hr-login";
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/hr", "/hr/:path*"] };
