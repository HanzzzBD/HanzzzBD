import { describe, expect, it } from "vitest";
import { assertPrivateAuthorization, parseCollectionConfig } from "../../src/collect/config.ts";
import { CollectError } from "../../src/core/errors.ts";
import { SALT } from "../helpers/world.ts";

const base = { login: "sample-player", since: "2026-10-01T00:00:00Z" };

describe("collection config", () => {
  it("applies safe defaults: private repos off, workflow runs off, bounded limits", () => {
    const config = parseCollectionConfig(base);
    expect(config.privateRepos).toEqual({
      enabled: false,
      allow: [],
      allowPublicNames: [],
      includeLanguages: false,
    });
    expect(config.sources.workflowRuns).toBe(false);
    expect(config.limits).toEqual({ maxRequests: 900, maxPagesPerQuery: 10 });
    expect(config.scope.includeForks).toBe(false);
  });

  it("rejects unknown keys, bad logins and bad repo names", () => {
    expect(() => parseCollectionConfig({ ...base, typo: true })).toThrow(CollectError);
    expect(() => parseCollectionConfig({ ...base, login: "-bad-" })).toThrow(/login/);
    expect(() => parseCollectionConfig({ ...base, scope: { include: ["no-slash"] } })).toThrow(
      /owner\/name/,
    );
    expect(() => parseCollectionConfig({ ...base, limits: { maxPagesPerQuery: 1000 } })).toThrow(
      CollectError,
    );
  });

  it("requires private allow-lists to be consistent", () => {
    expect(() => parseCollectionConfig({ ...base, privateRepos: { allow: ["a/b"] } })).toThrow(
      /enabled is false/,
    );
    expect(() =>
      parseCollectionConfig({
        ...base,
        privateRepos: { enabled: true, allow: ["a/b"], allowPublicNames: ["a/c"] },
      }),
    ).toThrow(/subset/);
  });

  it("authorises private collection only with a strong salt", () => {
    const config = parseCollectionConfig({
      ...base,
      privateRepos: { enabled: true, allow: ["a/b"] },
    });
    expect(() => assertPrivateAuthorization(config, undefined)).toThrow(/LEGENDS_PRIVACY_SALT/);
    expect(() => assertPrivateAuthorization(config, "short")).toThrow(CollectError);
    expect(() => assertPrivateAuthorization(config, SALT)).not.toThrow();
    expect(() => assertPrivateAuthorization(parseCollectionConfig(base), undefined)).not.toThrow();
  });
});
