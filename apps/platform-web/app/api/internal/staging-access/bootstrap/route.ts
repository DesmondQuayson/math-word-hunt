import { NextResponse } from "next/server";

import {
  createStagingAccessCookieValue,
  isStagingAccessRequired,
  isValidStagingBearerAuthorization,
  STAGING_ACCESS_COOKIE_NAME,
  stagingAccessNotFoundResponse
} from "@/lib/staging-access/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isStagingAccessRequired() || !isValidStagingBearerAuthorization(request.headers.get("authorization"))) {
    return stagingAccessNotFoundResponse();
  }
  const cookieValue = createStagingAccessCookieValue();
  if (!cookieValue) return stagingAccessNotFoundResponse();
  const response = new NextResponse(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow"
    }
  });
  response.cookies.set(STAGING_ACCESS_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/"
  });
  return response;
}

export function GET() {
  return stagingAccessNotFoundResponse();
}
