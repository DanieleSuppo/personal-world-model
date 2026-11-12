import { z } from "zod";

const text = z.string().min(1).refine(
  value => !value.includes("\u0000") && value.isWellFormed(),
  "Text must be valid Unicode without NUL characters",
);
const identity = text.max(256);
export const originSchema = z.strictObject({
  type: z.enum(["source", "consumer", "user"]),
  id: identity,
});
export const signalSchema = z.strictObject({
  origin: originSchema,
  fidelity: z.enum(["raw", "excerpt", "summary"]),
  idempotencyKey: identity,
  content: text.max(48 * 1024),
  sourceItem: z.strictObject({
    id: identity,
    revision: identity.optional(),
    cursor: text.max(2048).optional(),
  }).optional(),
}).refine(signal => signal.origin.type !== "source" || signal.sourceItem !== undefined, {
  message: "Source Signals require a Source Item",
});
export const principalsSchema = z.array(z.strictObject({
  token: z.string().min(43).max(256).regex(/^[A-Za-z0-9_-]+$/),
  tenantId: identity,
  origin: originSchema,
})).min(1).refine(
  principals => new Set(principals.map(principal => principal.token)).size === principals.length,
  "Tokens must identify exactly one principal",
);

export type Signal = z.infer<typeof signalSchema>;
export type Principal = z.infer<typeof principalsSchema>[number];
export type ReceiptState =
  | "accepted" | "deferred" | "reassessing" | "committed"
  | "no meaningful change" | "rejected";

export type Receipt = {
  receiptId: string;
  state: ReceiptState;
  origin: Signal["origin"];
  fidelity: Signal["fidelity"];
  sourceItem?: Signal["sourceItem"];
  receivedAt: string;
};
