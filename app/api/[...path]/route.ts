import { type NextRequest, NextResponse } from "next/server";
import axios from "axios";

const BACKEND = (
  process.env.API_PROXY_TARGET ?? "https://nova-l5df.onrender.com"
).replace(/\/$/, "");

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
  "content-encoding",
  "accept-encoding",
  // Browser cache validators make Nest return 304, which NextResponse cannot wrap with a body.
  "if-none-match",
  "if-modified-since",
  "if-match",
  "if-unmodified-since",
  "if-range",
]);

const DROP_RESPONSE_HEADERS = new Set([
  "content-encoding",
  "transfer-encoding",
  "content-length",
  "connection",
  "etag",
  "last-modified",
]);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function proxy(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);

  // Forward the full path + query string to the backend
  const targetPath = url.pathname === "/api/search" ? "/search" : url.pathname;
  const target = `${BACKEND}${targetPath}${url.search}`;

  const reqHeaders: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      reqHeaders[key] = value;
    }
  });

  const hasBody = !["GET", "HEAD"].includes(req.method);

  try {
    const upstream = await axios.request<ArrayBuffer>({
      url: target,
      method: req.method,
      headers: reqHeaders,
      data: hasBody ? Buffer.from(await req.arrayBuffer()) : undefined,
      responseType: "arraybuffer",
      decompress: true,
      timeout: 60_000,
      validateStatus: () => true,
    });

    const resHeaders = new Headers();
    Object.entries(upstream.headers).forEach(([key, value]) => {
      if (DROP_RESPONSE_HEADERS.has(key.toLowerCase())) return;
      if (Array.isArray(value)) {
        resHeaders.set(key, value.join(", "));
        return;
      }
      if (value !== undefined) {
        resHeaders.set(key, String(value));
      }
    });
    resHeaders.set("cache-control", "no-store");

    const status = upstream.status === 304 ? 200 : upstream.status;
    const body = Buffer.from(upstream.data ?? []);

    return new NextResponse(status === 204 || status === 205 ? null : body, {
      status,
      statusText: upstream.statusText,
      headers: resHeaders,
    });
  } catch (err) {
    console.error("[proxy] axios failed", { target, backend: BACKEND, err });
    return NextResponse.json(
      {
        error: "Backend unreachable",
        message:
          BACKEND.includes("localhost") || BACKEND.includes("127.0.0.1")
            ? `Local API at ${BACKEND} is not reachable. Start nova-backend, or set API_PROXY_TARGET to the Render URL.`
            : `Could not reach ${BACKEND}. The server may be waking up — wait a few seconds and try again.`,
      },
      { status: 502 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
