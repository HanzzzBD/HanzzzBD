import { describe, expect, it } from "vitest";
import { el, escapeAttr, num, SvgBuildError, serialize, text } from "../../src/render/svg.ts";
import {
  fitLabel,
  formatCount,
  initials,
  sanitizeLabel,
  stripPictographs,
  textWidth,
  truncate,
} from "../../src/render/text.ts";
import { DARK, LIGHT, themeColours } from "../../src/render/tokens.ts";
import { overlapIssues, parseSvg, SvgParseError, validateSvg } from "../../src/render/validate.ts";

const RULES = { theme: DARK, width: 420, height: 820, maxBytes: 100_000 };
const wrap = (inner: string, extra = "") =>
  `<svg aria-labelledby="t d" role="img" viewBox="0 0 420 820" xmlns="http://www.w3.org/2000/svg"${extra}><title id="t">T</title><desc id="d">D</desc>${inner}</svg>`;
const codes = (svg: string) => validateSvg(svg, RULES).map((i) => i.code);

describe("SVG builder", () => {
  it("escapes text and attribute values at the boundary", () => {
    const hostile = `</text><script>alert("x")</script>&'`;
    const out = serialize(el("text", { x: 1, y: 2, fill: hostile }, [text(hostile)]));
    expect(out).not.toContain("<script");
    expect(out).toContain("&lt;/text&gt;&lt;script&gt;");
    expect(out).toContain(
      'fill="&lt;/text&gt;&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#39;"',
    );
    expect(escapeAttr(`"'<>&`)).toBe("&quot;&#39;&lt;&gt;&amp;");
  });

  it("only builds allow-listed elements and attributes", () => {
    for (const tag of ["script", "foreignObject", "use", "image", "a", "style", "iframe"])
      expect(() => el(tag)).toThrow(SvgBuildError);
    for (const attr of ["onload", "onclick", "style", "href", "xlink:href", "class"])
      expect(() => el("rect", { [attr]: "x" })).toThrow(SvgBuildError);
    expect(() => el("rect", { x: Number.NaN })).toThrow(SvgBuildError);
    expect(() => el("rect", { x: Number.POSITIVE_INFINITY })).toThrow(SvgBuildError);
  });

  it("serialises canonically: sorted attributes, fixed precision", () => {
    const a = serialize(el("rect", { y: 2, x: 1.006, width: 3 }));
    const b = serialize(el("rect", { width: 3, x: 1.006, y: 2 }));
    expect(a).toBe(b);
    expect(a).toBe('<rect width="3" x="1.01" y="2"/>');
    expect(num(-0.001)).toBe("0");
    expect(num(12.5)).toBe("12.5");
    expect(num(1 / 3)).toBe("0.33");
  });
});

describe("text fitting", () => {
  it("measures conservatively and truncates with an ellipsis that fits", () => {
    expect(textWidth("WWW", { size: 12 })).toBeGreaterThan(textWidth("iii", { size: 12 }));
    expect(textWidth("Abc", { size: 12, bold: true })).toBeGreaterThan(
      textWidth("Abc", { size: 12 }),
    );
    const long = "Featherstonehaugh-Cholmondeley ".repeat(4);
    const cut = truncate(long, 120, { size: 14, bold: true });
    expect(cut.endsWith("…")).toBe(true);
    expect(textWidth(cut, { size: 14, bold: true })).toBeLessThanOrEqual(120);
    expect(truncate("Short", 200, { size: 14 })).toBe("Short");
  });

  it("never splits a grapheme cluster", () => {
    const name = "Zoë 👩\u200D👩\u200D👧 é́ 李小龍李小龍李小龍";
    for (let w = 10; w < 200; w += 7) {
      const cut = truncate(name, w, { size: 14 });
      expect(cut.normalize("NFC")).toBe(cut.normalize("NFC"));
      expect(cut).not.toMatch(/\u200D…|[\uD800-\uDBFF]…/);
    }
  });

  it("fits labels: full name, smaller size, short label, then truncation", () => {
    expect(fitLabel("River of Reviews", "River", 160, [14, 13, 12])).toMatchObject({
      text: "River of Reviews",
      size: 14,
    });
    expect(fitLabel("Observatory of Patterns", "Observatory", 116, [12, 11])).toMatchObject({
      text: "Observatory",
      truncated: false,
    });
    expect(
      fitLabel("An Extremely Long Region Name Indeed", "Still Far Too Long For This", 60, [12]),
    ).toMatchObject({ truncated: true });
  });

  it("sanitises untrusted names: no control, format or bidi characters, bounded length", () => {
    expect(sanitizeLabel("a\u202Eb\u0000c\u200Bd\ne   f")).toBe("abcd e f");
    expect(sanitizeLabel("x".repeat(200)).length).toBe(64);
    expect(sanitizeLabel("  ")).toBe("");
    expect(stripPictographs("Ayu 🐉🇮🇩 Dev ❤️")).toBe("Ayu  Dev ");
    expect(initials("ayu lestari")).toBe("AL");
    expect(initials("李小龍")).toBe("李");
    expect(initials("--- ***")).toBe("?");
  });

  it("formats large values compactly and never overstates them", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(9_999)).toBe("9,999");
    expect(formatCount(12_345)).toBe("12.3K");
    expect(formatCount(999_999)).toBe("999.9K");
    expect(formatCount(987_654_321)).toBe("987.6M");
    expect(formatCount(1_250_000_000)).toBe("1.2B");
  });
});

describe("tokens", () => {
  it("define the approved palette for both themes", () => {
    expect(DARK.bgAbyss).toBe("#0B1020");
    expect(DARK.gold).toBe("#E0B54E");
    expect(LIGHT.bgAbyss).toBe("#F6F1E6");
    expect(themeColours(DARK).has(LIGHT.gold)).toBe(false);
  });
});

describe("SVG validator", () => {
  it("accepts a minimal valid document", () => {
    expect(validateSvg(wrap(`<rect fill="${DARK.gold}" height="2" width="2"/>`), RULES)).toEqual(
      [],
    );
  });

  it("rejects malformed or non-canonical XML", () => {
    for (const bad of [
      "<svg><!-- c --></svg>",
      '<!DOCTYPE svg><svg xmlns="x"/>',
      "<svg><rect></svg>",
      "<svg x='1'/>",
      '<svg x="1" x="2"/>',
      '<svg><text x="1">a &nbsp; b</text></svg>',
      "<svg/><svg/>",
    ])
      expect(() => parseSvg(bad)).toThrow(SvgParseError);
  });

  it("rejects scripts, event handlers, external references and unknown markup", () => {
    expect(codes(wrap("<script>alert(1)</script>"))).toContain("element");
    expect(codes(wrap('<foreignObject width="1" height="1"/>'))).toContain("element");
    expect(codes(wrap('<rect onload="x()" width="1" height="1"/>'))).toContain("event_handler");
    expect(codes(wrap('<rect style="fill:red" width="1" height="1"/>'))).toContain("attribute");
    expect(
      codes(wrap('<rect fill="url(https://evil.example/x)" width="1" height="1"/>')),
    ).toContain("colour");
    expect(codes(wrap('<rect fill="url(#missing)" width="1" height="1"/>'))).toContain(
      "dangling_reference",
    );
    expect(codes(wrap('<path d="M0 0 L1 1" transform="matrix(1 0 0 1 0 0)"/>'))).toContain(
      "transform",
    );
    expect(codes(wrap('<path d="M0 0 url(x)"/>'))).toContain("path_data");
  });

  it("rejects colours that are not tokens of the theme", () => {
    expect(codes(wrap('<rect fill="#FF0000" width="1" height="1"/>'))).toContain("colour");
    expect(codes(wrap(`<rect fill="${LIGHT.gold}" width="1" height="1"/>`))).toContain("colour");
  });

  it("rejects unsafe characters, text outside the canvas and missing text alternatives", () => {
    expect(codes(wrap('<text x="10" y="20">a\u202Eb</text>'))).toContain("unsafe_char");
    expect(
      codes(wrap('<text x="400" y="20" font-size="14">A long label running off the edge</text>')),
    ).toContain("text_bounds");
    expect(codes(wrap('<text x="10" y="20" font-size="8">tiny</text>'))).toContain("font_size");
    const noDesc =
      '<svg aria-labelledby="t" role="img" viewBox="0 0 420 820" xmlns="http://www.w3.org/2000/svg"><title id="t">T</title></svg>';
    expect(codes(noDesc)).toContain("a11y");
  });

  it("enforces the size budget", () => {
    const big = wrap(`<path d="${"M0 0 ".repeat(25_000)}"/>`);
    expect(codes(big)).toContain("size_budget");
  });

  it("finds overlapping boxes and plaques closer than 16 px", () => {
    const plaque = (id: string, x: number) => ({
      kind: "plaque",
      id,
      x,
      y: 100,
      width: 100,
      height: 40,
    });
    expect(overlapIssues([plaque("a", 0), plaque("b", 110)]).map((i) => i.code)).toEqual([
      "overlap",
    ]);
    expect(overlapIssues([plaque("a", 0), plaque("b", 116)])).toEqual([]);
    const pin = { kind: "pin", id: "p", owner: "a", x: 80, y: 100, width: 30, height: 30 };
    expect(overlapIssues([plaque("a", 0), pin])).toEqual([]);
    expect(overlapIssues([plaque("b", 60), pin]).map((i) => i.code)).toEqual(["overlap"]);
  });
});
