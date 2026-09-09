import * as fs from "fs";
import * as path from "path";
import { parser, serializer } from "./server";
import { stripTrailingBlankLines } from "../../common/stripTrailingBlankLines";

/**
 * Round-trip corpus: every fixture under src/test/fixtures/roundtrip/ must
 * survive `parse` → `serialize` byte-for-byte, matching the host pipeline
 * (RichMarkdownEditorProvider.updateTextDocument runs the serializer output
 * through stripTrailingBlankLines before comparing it to the document).
 *
 * This is the lock for the "opening a file changes nothing" guarantee: adding a
 * construct here is a one-line `.md` file, and any serializer regression that
 * reintroduces churn fails loudly. See .plans/markdown-roundtrip-fidelity.md.
 */
const fixturesDir = path.resolve(
  __dirname,
  "../../test/fixtures/roundtrip"
);

const roundTrip = (md: string): string =>
  stripTrailingBlankLines(serializer.serialize(parser.parse(md), undefined));

const fixtures = fs
  .readdirSync(fixturesDir)
  .filter(name => name.endsWith(".md"))
  .sort();

test("the corpus is non-empty", () => {
  expect(fixtures.length).toBeGreaterThan(0);
});

describe("markdown round trip", () => {
  for (const name of fixtures) {
    test(name, () => {
      const md = fs.readFileSync(path.join(fixturesDir, name), "utf8");
      expect(roundTrip(md)).toBe(md);
    });
  }
});

test("the reported problem file round-trips clean", () => {
  // Regression guard for the original bug report: opening this file dirtied it
  // with no user edit. Kept as a repo-root file so it doubles as a manual
  // F5 check target.
  const reported = path.resolve(__dirname, "../../../problem-file.md");
  if (!fs.existsSync(reported)) return;
  const md = fs.readFileSync(reported, "utf8");
  expect(roundTrip(md)).toBe(md);
});
