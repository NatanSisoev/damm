import { NextResponse, type NextRequest } from "next/server";
import { HR_COOKIE, accessToken, gateEnabled, gateMisconfigured } from "./lib/hr-access";
import { VIEW_ROLE_COOKIE, managerAllowed, parseRole } from "./lib/view-role";

// Access gate for the HR dashboard and the read-only manager view (same HR_ACCESS_CODE).
export async function proxy(req: NextRequest) {
  const res = await gate(req);
  // Testing toggle: in manager mode every /hr page except the dashboard (and its read-only subpages) goes to /hr.
  const path = req.nextUrl.pathname;
  if (res.headers.get("location") === null && path.startsWith("/hr") && parseRole(req.cookies.get(VIEW_ROLE_COOKIE)?.value) === "manager" && !managerAllowed(path)) {
    const url = req.nextUrl.clone();
    url.pathname = "/hr";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return res;
}

async function gate(req: NextRequest) {
  if (gateMisconfigured()) {
    const url = req.nextUrl.clone();
    url.pathname = "/hr-login";
    url.search = "?error=unconfigured";
    return NextResponse.redirect(url);
  }
  if (!gateEnabled()) return NextResponse.next();
  const token = req.cookies.get(HR_COOKIE)?.value;
  if (token && token === (await accessToken(process.env.HR_ACCESS_CODE!))) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/hr-login";
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/hr", "/hr/:path*", "/manager", "/manager/:path*"] };
