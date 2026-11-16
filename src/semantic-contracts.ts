import { createHash } from "node:crypto";
import { z } from "zod";
import type { Signal } from "./contracts.js";

export const policyVersion = "initial-learning-v1";
export const schemaVersion = 1;
const text = (max: number) => z.string().refine(value => value.isWellFormed() && !value.includes("\0") && [...value].length >= 1 && [...value].length <= max);
const validity = z.strictObject({ from: z.iso.datetime().optional(), until: z.iso.datetime().optional() })
  .refine(value => !value.from || !value.until || Date.parse(value.until) >= Date.parse(value.from));
const assertion = z.strictObject({
  claim: text(2048), classification: z.enum(["personal_knowledge", "high_confidence_hypothesis"]),
  originBasis: z.enum(["user_stated", "imported", "observed", "inferred"]),
  support: text(1024).refine(value => !/^\s*[\d.]+\s*%?\s*$/.test(value)),
  observationIndexes: z.array(z.number().int().min(0).max(7)).min(1).max(8).refine(value => new Set(value).size === value.length),
  validity, applicability: text(1024), sensitivity: z.enum(["ordinary", "sensitive", "highly_sensitive"]),
  semanticAnchors: z.array(z.strictObject({ kind: text(128), label: text(256) })).max(16).optional(),
});
export const proposalSchema = z.strictObject({
  observations: z.array(z.strictObject({ description: text(1024), excerpt: text(512) })).min(1).max(8),
  decision: z.enum(["add", "no_meaningful_change"]), assertions: z.array(assertion).max(8),
}).refine(value => value.decision === "add" ? value.assertions.length > 0 : value.assertions.length === 0);
export type ValidatedProposal = z.infer<typeof proposalSchema>;
export type InterpretationInput = Pick<Signal, "content" | "origin" | "fidelity">;
export type EvaluationInput = InterpretationInput & {
  tenantId: string; receiptId: string; contentDigest: string; sourceItem?: Signal["sourceItem"];
  stateVersion: string; policyIdentity: string; inputIdentity: string;
};
export class InvalidProposal extends Error { constructor() { super("invalid_proposal"); } }
export function validateProposal(raw: unknown, input: InterpretationInput): ValidatedProposal {
  const parsed = proposalSchema.safeParse(raw);
  if (!parsed.success) throw new InvalidProposal();
  const proposal = parsed.data;
  if (proposal.observations.some(o => !input.content.includes(o.excerpt)) || proposal.assertions.some(a =>
    a.observationIndexes.some(i => i >= proposal.observations.length) || (a.originBasis === "user_stated" && input.origin.type !== "user"))) {
    throw new InvalidProposal();
  }
  return proposal;
}
// Sort object keys, not evidence/claim arrays: identity is independent of JSON property order.
export function canonicalDigest(value: unknown): string {
  function canonical(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(canonical);
    if (v !== null && typeof v === "object") return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canonical(x)]));
    return v;
  }
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
