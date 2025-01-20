import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  if (request.nextUrl.pathname.endsWith(".wasm")) {
    response.headers.set("Content-Type", "application/wasm");
  }

  return response;
}

export const config = {
  matcher: "/:path*.wasm",
};
