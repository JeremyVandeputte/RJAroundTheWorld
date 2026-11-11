import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RichText } from "@/components/entry/rich-text";
import { parseRichText, safeHref } from "@/lib/rich-text";

const html = (source: string) => renderToStaticMarkup(createElement(RichText, { source }));
const inline = (source: string) => parseRichText(source)[0]?.[0] ?? [];

describe("simplified markdown", () => {
  it("renders bold text", () => {
    expect(inline("Une **belle** journée")).toEqual([
      { type: "text", text: "Une " },
      { type: "bold", children: [{ type: "text", text: "belle" }] },
      { type: "text", text: " journée" },
    ]);
  });

  it("renders markdown links and bare URLs", () => {
    expect(inline("Voir [le site](https://example.org/a?b=1) ici")).toEqual([
      { type: "text", text: "Voir " },
      { type: "link", href: "https://example.org/a?b=1", text: "le site" },
      { type: "text", text: " ici" },
    ]);
    expect(inline("Infos sur https://example.org/plage.")).toEqual([
      { type: "text", text: "Infos sur " },
      { type: "link", href: "https://example.org/plage", text: "https://example.org/plage" },
      { type: "text", text: "." },
    ]);
  });

  it("allows a link inside bold text", () => {
    expect(inline("**voir [ici](https://example.org)**")).toEqual([
      {
        type: "bold",
        children: [
          { type: "text", text: "voir " },
          { type: "link", href: "https://example.org/", text: "ici" },
        ],
      },
    ]);
  });

  it("keeps paragraphs and line breaks", () => {
    const paragraphs = parseRichText("Ligne 1\nLigne 2\r\n\r\n\nParagraphe 2\n");
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]).toHaveLength(2);
    expect(html("a\nb\n\nc")).toBe('<div class="space-y-4 leading-relaxed"><p>a<br/>b</p><p>c</p></div>');
  });

  it("leaves unbalanced or empty markers as plain text", () => {
    expect(inline("2 ** 3 et **")).toEqual([{ type: "text", text: "2 ** 3 et **" }]);
    expect(inline("****")).toEqual([{ type: "text", text: "****" }]);
    expect(inline("[texte]( )")).toEqual([{ type: "text", text: "[texte]( )" }]);
  });

  it("supports nothing else: other markdown stays as typed", () => {
    expect(html("# Titre\n*italique* `code` ![img](https://example.org/x.png)")).toContain("# Titre");
    expect(html("*italique*")).not.toContain("<em>");
    expect(html("![img](https://example.org/x.png)")).not.toContain("<img");
  });
});

describe("XSS safety", () => {
  it("only accepts http and https links", () => {
    expect(safeHref("https://example.org")).toBe("https://example.org/");
    expect(safeHref("http://example.org/a b")).toBe("http://example.org/a%20b");
    for (const url of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      " javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "//example.org",
      "/relative",
      "mailto:a@example.org",
      "",
    ]) {
      expect(safeHref(url), url).toBeNull();
    }
  });

  it("never turns a dangerous link into an anchor", () => {
    const attacks = [
      "[clic](javascript:alert(1))",
      "[clic](JAVASCRIPT:alert(1))",
      "[clic](data:text/html;base64,PHNjcmlwdD4=)",
      "[clic](vbscript:x)",
    ];
    for (const attack of attacks) {
      const output = html(attack);
      expect(output, attack).not.toContain("<a");
      expect(output, attack).not.toContain("href");
    }
  });

  it("escapes HTML typed by the user", () => {
    const output = html('<script>alert(1)</script> <img src=x onerror=alert(1)> **<b onclick="x">gras</b>**');
    expect(output).not.toContain("<script");
    expect(output).not.toContain("<img");
    expect(output).not.toContain("<b ");
    expect(output).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(output).toContain("<strong>&lt;b onclick=&quot;x&quot;&gt;gras&lt;/b&gt;</strong>");
  });

  it("cannot break out of the href attribute", () => {
    const output = html('[x](https://example.org/"onmouseover="alert(1))');
    expect(output).not.toMatch(/<a[^>]*\sonmouseover=/);
    expect(output).toContain('href="https://example.org/%22onmouseover=%22alert(1"');
  });

  it("opens links safely in a new tab", () => {
    expect(html("[x](https://example.org)")).toContain('target="_blank" rel="noopener noreferrer nofollow"');
  });
});
