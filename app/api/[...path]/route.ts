import { type NextRequest, NextResponse } from "next/server";
import axios from "axios";

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

  try {
    const upstream = await axios.request<ArrayBuffer>({
      url: target,
      method: req.method,
      headers: Object.fromEntries(reqHeaders.entries()),
      data: hasBody ? Buffer.from(await req.arrayBuffer()) : undefined,
      responseType: "arraybuffer",
      validateStatus: () => true,
    });

    const resHeaders = new Headers();
    Object.entries(upstream.headers).forEach(([key, value]) => {
      if (key === "content-encoding" || key === "transfer-encoding") return;
      if (Array.isArray(value)) {
        resHeaders.set(key, value.join(", "));
        return;
      }
      if (value !== undefined) resHeaders.set(key, String(value));
    });

    return new NextResponse(Buffer.from(upstream.data), {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: resHeaders,
    });
  } catch (err) {
    console.error("[proxy] axios failed", { target, backend: BACKEND, err });
    return NextResponse.json(
      { error: "Backend unreachable" },
      { status: 502 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
