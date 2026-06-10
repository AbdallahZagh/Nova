import { type NextRequest, NextResponse } from "next/server";

const BACKEND = (
  process.env.API_PROXY_TARGET ?? "https://nova-l5df.onrender.com"
).replace(/\/$/, "");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function proxy(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);

  // Forward the full path + query string to the backend
  const targetPath = url.pathname === "/api/search" ? "/search" : url.pathname;
  const target = `${BACKEND}${targetPath}${url.search}`;

  // Copy request headers, drop `host` so the backend doesn't get confused
  const reqHeaders = new Headers(req.headers);
  reqHeaders.delete("host");

  const hasBody = !["GET", "HEAD"].includes(req.method);

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers: reqHeaders,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(hasBody ? { body: req.body, duplex: "half" as any } : {}),
    });
  } catch (err) {
    console.error("[proxy] fetch failed", { target, backend: BACKEND, err });
    return NextResponse.json(
      { error: "Backend unreachable" },
      { status: 502 },
    );
  }

  // Copy response headers, strip encoding that breaks streaming on Netlify
  const resHeaders = new Headers(upstream.headers);
  resHeaders.delete("content-encoding");
  resHeaders.delete("transfer-encoding");

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: resHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
