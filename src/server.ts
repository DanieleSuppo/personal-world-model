import { createHash, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Pool } from "pg";
import { principalsSchema, signalSchema } from "./contracts.js";
import { deleteSignalContent, getReceipt, getRetainedSignal, isStorageUnavailable, SignalConflict, submitSignal } from "./signals.js";

class RequestError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
  }
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  }).end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  if (request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    request.resume();
    throw new RequestError(415, "unsupported_media_type");
  }
  const body = await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 64 * 1024) {
        chunks.length = 0;
        reject(new RequestError(413, "payload_too_large"));
      } else {
        chunks.push(chunk);
      }
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
    request.on("aborted", () => reject(new RequestError(400, "invalid_request")));
  });
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } catch {
    throw new RequestError(400, "invalid_json");
  }
}

export function createSignalServer(options: { pool: Pool; principals: unknown }) {
  const principals = principalsSchema.parse(options.principals).map(principal => ({
    ...principal,
    digest: createHash("sha256").update(principal.token).digest(),
  }));
  return createServer({ requestTimeout: 30_000, headersTimeout: 10_000 }, async (request, response) => {
    try {
      const authorization = request.headers.authorization;
      const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
      const digest = createHash("sha256").update(token).digest();
      const principal = principals.find(principal => timingSafeEqual(principal.digest, digest));
      if (!principal) {
        request.resume();
        response.setHeader("www-authenticate", "Bearer");
        throw new RequestError(401, "unauthorized");
      }
      const path = request.url?.split("?")[0];
      if (request.method === "POST" && path === "/v1/signals") {
        const parsed = signalSchema.safeParse(await readJson(request));
        if (!parsed.success) throw new RequestError(400, "invalid_signal");
        const signal = parsed.data;
        if (signal.origin.type !== principal.origin.type || signal.origin.id !== principal.origin.id) {
          throw new RequestError(403, "origin_mismatch");
        }
        send(response, 202, await submitSignal(options.pool, principal, signal));
        return;
      }
      const retained = path?.match(/^\/v1\/signals\/([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})$/i);
      if (retained?.[1] && (request.method === "GET" || request.method === "DELETE")) {
        request.resume();
        const result = request.method === "DELETE"
          ? await deleteSignalContent(options.pool, principal, retained[1])
          : await getRetainedSignal(options.pool, principal, retained[1]);
        if (!result) throw new RequestError(404, "not_found");
        send(response, 200, result);
        return;
      }
      const match = path?.match(/^\/v1\/signal-receipts\/([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})$/i);
      if (request.method === "GET" && match?.[1]) {
        const result = await getReceipt(options.pool, principal, match[1]);
        if (!result) throw new RequestError(404, "not_found");
        send(response, 200, result);
        return;
      }
      request.resume();
      throw new RequestError(404, "not_found");
    } catch (error) {
      if (error instanceof SignalConflict) {
        send(response, 409, { state: "rejected", code: "idempotency_conflict" });
      } else if (error instanceof RequestError) {
        send(response, error.status, { state: "rejected", code: error.code });
      } else if (isStorageUnavailable(error)) {
        send(response, 503, { state: "rejected", code: "storage_unavailable" });
      } else {
        console.error("Signal API internal error; check application configuration and schema.");
        send(response, 500, { state: "rejected", code: "internal_error" });
      }
    }
  });
}
