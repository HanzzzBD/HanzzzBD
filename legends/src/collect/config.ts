import { z } from "zod";
import { CollectError } from "../core/errors.ts";

/** GitHub login rules: alphanumeric or single hyphens, no leading/trailing hyphen, ≤ 39 chars. */
export const LOGIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
const REPO_FULL_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}\/[A-Za-z0-9._-]{1,100}$/;

const repoFullName = z.string().regex(REPO_FULL_NAME, "expected owner/name");
const isoInstant = z.iso.datetime({ offset: false });

/**
 * Collection settings (the `collection` section of the player config).
 * Unknown keys are rejected so typos never silently change behaviour.
 */
export const collectionConfigSchema = z.strictObject({
  login: z.string().regex(LOGIN_PATTERN, "invalid GitHub login"),
  /** Earliest instant to collect from (the backfill start). */
  since: isoInstant,
  scope: z
    .strictObject({
      owned: z.boolean().default(true),
      contributed: z.boolean().default(true),
      includeForks: z.boolean().default(false),
      includeArchived: z.boolean().default(true),
      include: z.array(repoFullName).max(200).default([]),
      exclude: z.array(repoFullName).max(200).default([]),
      maxRepos: z.number().int().min(1).max(500).default(100),
    })
    .prefault({}),
  privateRepos: z
    .strictObject({
      /** Off by default (D-02). Turning it on also requires LEGENDS_PRIVACY_SALT and a token with access. */
      enabled: z.boolean().default(false),
      /** Explicit allow-list; there are no wildcards. */
      allow: z.array(repoFullName).max(100).default([]),
      /** Private repos whose names may appear in public output. Must be a subset of `allow`. */
      allowPublicNames: z.array(repoFullName).max(100).default([]),
      /** Store language byte counts for private repos (metadata). Off by default. */
      includeLanguages: z.boolean().default(false),
    })
    .prefault({}),
  sources: z
    .strictObject({
      calendar: z.boolean().default(true),
      commits: z.boolean().default(true),
      pullRequests: z.boolean().default(true),
      reviews: z.boolean().default(true),
      issues: z.boolean().default(true),
      closedIssues: z.boolean().default(true),
      releases: z.boolean().default(true),
      languages: z.boolean().default(true),
      workflowRuns: z.boolean().default(false),
    })
    .prefault({}),
  limits: z
    .strictObject({
      maxRequests: z.number().int().min(10).max(5_000).default(900),
      maxPagesPerQuery: z.number().int().min(1).max(100).default(10),
    })
    .prefault({}),
  /** Literal, case-insensitive substrings that mark automated commit messages (GDD §1.6). */
  automationMessagePatterns: z
    .array(z.string().min(3).max(60))
    .max(50)
    .default(["[skip ci]", "auto-update", "chore(auto", "automated", "bump version"]),
});

export type CollectionConfig = z.output<typeof collectionConfigSchema>;

export function parseCollectionConfig(input: unknown): CollectionConfig {
  const result = collectionConfigSchema.safeParse(input);
  if (!result.success) {
    const problems = result.error.issues
      .slice(0, 10)
      .map((i) => `${i.path.map(String).join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new CollectError("config", `Invalid collection config: ${problems}`);
  }
  const config = result.data;
  const allow = new Set(config.privateRepos.allow.map((r) => r.toLowerCase()));
  for (const name of config.privateRepos.allowPublicNames) {
    if (!allow.has(name.toLowerCase())) {
      throw new CollectError(
        "config",
        "privateRepos.allowPublicNames must be a subset of privateRepos.allow",
      );
    }
  }
  if (!config.privateRepos.enabled && config.privateRepos.allow.length > 0) {
    throw new CollectError("config", "privateRepos.allow is set but privateRepos.enabled is false");
  }
  return config;
}

/**
 * Private collection is authorised only when the config enables it AND a privacy salt
 * secret is provided. The salt keys the pseudonyms of private identifiers (HMAC), so
 * committed state cannot be correlated with private repositories without it.
 */
export function assertPrivateAuthorization(
  config: CollectionConfig,
  salt: string | undefined,
): void {
  if (!config.privateRepos.enabled) return;
  if (salt === undefined || salt.length < 32) {
    throw new CollectError(
      "not_authorized_private",
      "Private repositories are enabled but LEGENDS_PRIVACY_SALT (≥ 32 characters) is not set",
    );
  }
}
