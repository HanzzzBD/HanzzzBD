/**
 * Validates the profile README and the block template (run by `pnpm check`).
 * - An empty block (before the first real run) is valid in pending mode.
 * - A filled block must contain every section enabled by default, and every file it
 *   references must exist in the repository.
 * Usage: node scripts/check-readme.ts [path/to/README.md]
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractBlock } from "../src/render/readme/inject.ts";
import { OPTIONAL_SECTIONS, SECTION_IDS } from "../src/render/readme/model.ts";
import { parseTemplate } from "../src/render/readme/template.ts";
import { validateReadme } from "../src/render/readme/validate.ts";

const legends = fileURLToPath(new URL("../", import.meta.url));
const readmePath = resolve(process.argv[2] ?? join(legends, "../README.md"));
const root = join(readmePath, "..");
const readme = readFileSync(readmePath, "utf8");
const required = SECTION_IDS.filter((s) => !OPTIONAL_SECTIONS.includes(s));
parseTemplate(readFileSync(join(legends, "templates/readme-block.md"), "utf8"), new Set(required));

let pending = false;
try {
  pending =
    extractBlock(readme)
      .replace(/<!--[\s\S]*?-->/g, "")
      .trim() === "";
} catch {
  // validateReadme reports the marker error below.
}
const issues = validateReadme(readme, {
  mode: pending ? "pending" : "generated",
  requiredSections: required,
  fileExists: (p) => existsSync(join(root, p)),
});
for (const i of issues) process.stderr.write(`README: ${i.code}: ${i.detail}\n`);
process.stdout.write(
  `README ${pending ? "(pending first run)" : "(generated)"}: ${issues.length === 0 ? "valid" : `${issues.length} issue(s)`}\n`,
);
if (issues.length > 0) process.exitCode = 1;
