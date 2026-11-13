// Simplified markdown for journal entries: bold and links only.
//
// The text is parsed into a small tree that is rendered as React elements.
// No HTML is ever produced from user input, so markup typed by a user is
// displayed as plain text, and only http(s) links become clickable.

export type InlineNode =
  | { type: "text"; text: string }
  | { type: "bold"; children: InlineNode[] }
  | { type: "link"; href: string; text: string };

/** A paragraph is a list of lines; a line is a list of inline nodes. */
export type RichParagraph = InlineNode[][];

/** Returns a normalized http(s) URL, or null for anything else (javascript:, data:, ...). */
export function safeHref(url: string): string | null {
  if (!URL.canParse(url)) return null;
  const parsed = new URL(url);
  return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
}

const BOLD = String.raw`\*\*(?=\S)(.+?)(?<=\S)\*\*`;
const MARKDOWN_LINK = String.raw`\[([^\]\n]+)\]\(([^\s)]+)\)`;
const BARE_URL = String.raw`(https?:\/\/[^\s<>"']+)`;

function pushText(nodes: InlineNode[], text: string): void {
  if (!text) return;
  const last = nodes.at(-1);
  if (last?.type === "text") last.text += text;
  else nodes.push({ type: "text", text });
}

function parseInline(source: string, allowBold: boolean): InlineNode[] {
  const pattern = new RegExp([allowBold ? BOLD : "(?!)()", MARKDOWN_LINK, BARE_URL].join("|"), "g");
  const nodes: InlineNode[] = [];
  let cursor = 0;

  for (const match of source.matchAll(pattern)) {
    pushText(nodes, source.slice(cursor, match.index));
    cursor = match.index + match[0].length;
    const [whole, bold, linkText, linkUrl, bareUrl] = match;

    if (bold !== undefined) {
      nodes.push({ type: "bold", children: parseInline(bold, false) });
    } else if (linkText !== undefined && linkUrl !== undefined) {
      const href = safeHref(linkUrl);
      // An unsafe link stays visible exactly as typed.
      if (href) nodes.push({ type: "link", href, text: linkText });
      else pushText(nodes, whole);
    } else if (bareUrl !== undefined) {
      // Punctuation right after a pasted URL belongs to the sentence.
      const trailing = /[.,;:!?)]+$/.exec(bareUrl)?.[0] ?? "";
      const url = bareUrl.slice(0, bareUrl.length - trailing.length);
      const href = safeHref(url);
      if (href) nodes.push({ type: "link", href, text: url });
      else pushText(nodes, url);
      pushText(nodes, trailing);
    }
  }
  pushText(nodes, source.slice(cursor));
  return nodes;
}

/** Blank lines separate paragraphs; single line breaks are kept. */
export function parseRichText(source: string): RichParagraph[] {
  return source
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => paragraph.split("\n").map((line) => parseInline(line, true)));
}

function inlineText(nodes: InlineNode[]): string {
  return nodes.map((node) => (node.type === "bold" ? inlineText(node.children) : node.text)).join("");
}

/** The text as read, without markup: for excerpts (search results). */
export function plainText(source: string): string {
  return parseRichText(source)
    .map((paragraph) => paragraph.map(inlineText).join(" "))
    .join(" ");
}
