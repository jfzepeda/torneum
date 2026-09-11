import type { FastifyInstance } from "fastify";
import { pool } from "./db.js";
/** Public invalidation only. No personal data or audit payloads are streamed. */
export function registerRealtime(app: FastifyInstance) {
  app.get("/v1/events", async (req, reply) => {
    const origin = process.env.FRONTEND_URL || "http://127.0.0.1:3000";
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
      "X-Accel-Buffering": "no",
    });
    let last = "",
      running = false;
    reply.raw.write(": connected\n\n");
    const timer = setInterval(async () => {
      if (running || reply.raw.destroyed) return;
      running = true;
      try {
        const { rows } = await pool.query(
          "SELECT coalesce(max(id),0) revision FROM audit_events",
        );
        const revision = String(rows[0].revision);
        if (revision !== last) {
          last = revision;
          reply.raw.write("event: update\ndata: {}\n\n");
        } else reply.raw.write(": keepalive\n\n");
      } catch {
        reply.raw.write(": retry\n\n");
      } finally {
        running = false;
      }
    }, 3000);
    reply.raw.on("close", () => clearInterval(timer));
  });
}
