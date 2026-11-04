// Same-origin server-side relay to the isolated UAT API.
// The UAT backend remains on loopback; its credentials and model key never reach the browser.
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const targetBase = process.env.GUARDIANLENS_UAT_API_INTERNAL;
  if (!targetBase || !/^https?:\/\//.test(targetBase)) {
    return NextResponse.json({ detail: "UAT backend is not configured" }, { status: 503 });
  }
  const { path } = await context.params;
  const target = new URL(path.map(encodeURIComponent).join("/"), `${targetBase.replace(/\/$/, "")}/`);
  const headers = new Headers();
  for (const key of ["cookie", "content-type"]) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }
  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === "GET" ? undefined : await request.arrayBuffer(),
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(180_000),
    });
    const responseHeaders = new Headers();
    for (const key of ["content-type", "set-cookie", "cache-control"]) {
      const value = upstream.headers.get(key);
      if (value) responseHeaders.set(key, value);
    }
    responseHeaders.set("Cache-Control", "private, no-store");
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return NextResponse.json({ detail: "The UAT service is unavailable" }, { status: 502 });
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxy(request, context);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxy(request, context);
}
