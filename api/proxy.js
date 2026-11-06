// dokorail-proxy: Vercel edge reverse proxy.
// Upstream is injected by the deploy side via the UPSTREAM env var (no default).
// Mirrors baker/common.py http_get: UA + X-Train-Search only, no extras.

// 部署侧必配（Vercel → Project → Settings → Environment Variables）；无默认值。
const UPSTREAM = process.env.UPSTREAM;

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

function cacheControlFor(pathname) {
  if (pathname.startsWith("/api/")) {
    return "public, max-age=0, s-maxage=10, must-revalidate";
  }
  if (/^\/rail\/geometry\/sha256\//.test(pathname)) {
    return "public, max-age=31536000, s-maxage=86400, immutable";
  }
  if (pathname.startsWith("/rail/")) {
    return "public, max-age=0, s-maxage=600";
  }
  return "public, max-age=0, s-maxage=0, must-revalidate";
}

export default async function handler(req) {
  try {
    if (!UPSTREAM) {
      return new Response(
        JSON.stringify({
          error: "upstream_not_configured",
          detail: "set the UPSTREAM env var on the deploy side",
        }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }
    const url = new URL(req.url, "https://proxy.local");
    const isApi = url.pathname.startsWith("/api/");

    // Exactly what the baker sends, plus content negotiation the SPA uses.
    const headers = {
      "user-agent": BROWSER_UA,
      accept: "application/json, text/plain, */*",
      "accept-language": "ja,en;q=0.9",
      referer: UPSTREAM + "/app/",
    };
    if (isApi) headers["x-train-search"] = "1";

    let upstream;
    try {
      upstream = await fetch(UPSTREAM + url.pathname + url.search, {
        headers,
        redirect: "follow",
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "upstream_unreachable", detail: String(err) }),
        { status: 502, headers: { "content-type": "application/json" } }
      );
    }

    const body = await upstream.arrayBuffer();
    const contentType =
      upstream.headers.get("content-type") || "application/octet-stream";

    return new Response(body, {
      status: upstream.status,
      headers: {
        "content-type": contentType,
        "cache-control": cacheControlFor(url.pathname),
        "access-control-allow-origin": "*",
      },
    });
  } catch (err) {
    return new Response("PROXY-UNCAUGHT: " + (err && err.stack ? err.stack : String(err)), {
      status: 500,
      headers: { "content-type": "text/plain" },
    });
  }
}

export const config = { runtime: "edge" };
