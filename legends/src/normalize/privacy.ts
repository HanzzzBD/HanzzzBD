import { CollectError } from "../core/errors.ts";
import { hmacSha256Hex, sha256Hex } from "../core/hash.ts";
import type { RepoRef } from "./event.ts";

export interface RepoFacts {
  databaseId: number;
  owner: string;
  name: string;
  isPrivate: boolean;
  isFork: boolean;
  isArchived: boolean;
}

export interface PrivacyOptions {
  playerLogin: string;
  privateEnabled: boolean;
  /** Required when privateEnabled. Keys all pseudonyms of private identifiers. */
  salt?: string | undefined;
  /** Lower-cased owner/name of private repos whose names may be shown publicly. */
  allowPublicNames?: Iterable<string>;
}

/**
 * Turns repository facts into a RepoRef and pseudonymises identifiers that belong to
 * private repositories. Public data passes through unchanged.
 */
export class Privacy {
  readonly #player: string;
  readonly #enabled: boolean;
  readonly #salt: string | undefined;
  readonly #publicNames: Set<string>;

  constructor(options: PrivacyOptions) {
    this.#player = options.playerLogin.toLowerCase();
    this.#enabled = options.privateEnabled;
    this.#salt = options.salt;
    this.#publicNames = new Set([...(options.allowPublicNames ?? [])].map((n) => n.toLowerCase()));
    if (this.#enabled && (this.#salt === undefined || this.#salt.length < 32)) {
      throw new CollectError(
        "not_authorized_private",
        "Private collection requires a privacy salt",
      );
    }
  }

  repoRef(repo: RepoFacts): RepoRef {
    const fullName = `${repo.owner}/${repo.name}`;
    const base = {
      ownedByPlayer: repo.owner.toLowerCase() === this.#player,
      isFork: repo.isFork,
      isArchived: repo.isArchived,
    };
    if (!repo.isPrivate)
      return { id: `gh:${repo.databaseId}`, visibility: "public", fullName, ...base };
    const salt = this.#requireSalt();
    const ref: RepoRef = {
      id: `p:${hmacSha256Hex(salt, `repo:${repo.databaseId}`).slice(0, 20)}`,
      visibility: "private",
      ...base,
    };
    if (this.#publicNames.has(fullName.toLowerCase())) ref.fullName = fullName;
    return ref;
  }

  /** Identifier for an object inside a repo (SHA, node id, release id). */
  objectId(repo: RepoRef, value: string): string {
    if (repo.visibility === "public") return value;
    return `p${hmacSha256Hex(this.#requireSalt(), `${repo.id}:${value}`).slice(0, 32)}`;
  }

  /** Content hash: plain SHA-256 for public data, keyed HMAC for private data (resists dictionary attacks). */
  contentHash(repo: RepoRef | null, value: string): string {
    if (repo === null || repo.visibility === "public") return sha256Hex(value);
    return hmacSha256Hex(this.#requireSalt(), value);
  }

  #requireSalt(): string {
    if (!this.#enabled || this.#salt === undefined) {
      throw new CollectError(
        "not_authorized_private",
        "Encountered a private repository without explicit authorization",
      );
    }
    return this.#salt;
  }
}
