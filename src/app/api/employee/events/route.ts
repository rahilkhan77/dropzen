const BACKEND = process.env.BACKEND_URL || "http://127.0.0.1:4000";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const upstream = await fetch(`${BACKEND}/api/employee/events`, {
    headers: {
      cookie: request.headers.get("cookie") || "",
      accept: "text/event-stream",
    },
    cache: "no-store",
  });

  if (!upstream.body) {
    return new Response("Event stream unavailable", { status: upstream.status || 502 });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
