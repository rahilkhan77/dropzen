import type { Request, Response } from "express";

type Subscriber = { userId: string; res: Response };

const subscribers = new Set<Subscriber>();

export function subscribe(userId: string, res: Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  const sub = { userId, res };
  subscribers.add(sub);
  res.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);
  const keepAlive = setInterval(() => {
    try {
      res.write(`: ping\n\n`);
    } catch {
      clearInterval(keepAlive);
      subscribers.delete(sub);
    }
  }, 25000);
  reqOnClose(res, () => {
    clearInterval(keepAlive);
    subscribers.delete(sub);
  });
}

function reqOnClose(res: Response, fn: () => void) {
  res.on("close", fn);
  res.req?.on("close", fn);
}

export function publishToUser(userId: string, event: string, payload: Record<string, unknown> = {}) {
  const chunk = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const sub of [...subscribers]) {
    if (sub.userId !== userId) continue;
    try {
      sub.res.write(chunk);
    } catch {
      subscribers.delete(sub);
    }
  }
}
