import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

function canonicalise(value) {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalise(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalise(item)]),
    );
  }

  return value;
}

function hash(payload) {
  return createHash("sha256").update(JSON.stringify(canonicalise(payload))).digest("hex");
}

const left = {
  action: "external_email.send",
  payload: { subject: "Hello", to: ["customer@example.com"], body: "Draft" },
  riskClass: 3,
};

const right = {
  riskClass: 3,
  payload: { body: "Draft", to: ["customer@example.com"], subject: "Hello" },
  action: "external_email.send",
};

assert.equal(hash(left), hash(right), "Payload hashes must be stable regardless of object insertion order.");
assert.notEqual(hash(left), hash({ ...right, payload: { ...right.payload, body: "Changed" } }), "Payload hash must change when protected payload content changes.");

const policySource = readFileSync("src/lib/approvals/policy.ts", "utf8");
assert.match(policySource, /function canonicalise/, "Policy helper must canonicalise payloads before hashing.");
assert.match(policySource, /createHash\("sha256"\)/, "Policy helper must use SHA-256.");
assert.match(policySource, /verifyExactApprovalPayload/, "Policy helper must expose exact-payload verification.");

const migration = readFileSync("supabase/migrations/20260715195016_phase7_approval_policy_engine.sql", "utf8");
assert.match(migration, /staffer\.verify_approval_execution/, "Migration must include database execution verification.");
assert.match(migration, /actual_hash <> approval_row\.payload_hash/, "Database verification must compare actual and approved payload hashes.");

console.log("Approval policy verification passed.");
