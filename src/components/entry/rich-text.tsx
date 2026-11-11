import { Fragment } from "react";
import { parseRichText, type InlineNode } from "@/lib/rich-text";

function renderInline(node: InlineNode, key: number) {
  switch (node.type) {
    case "text":
      return <Fragment key={key}>{node.text}</Fragment>;
    case "bold":
      return <strong key={key}>{node.children.map(renderInline)}</strong>;
    case "link":
      return (
        <a
          key={key}
          href={node.href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="break-words text-accent underline underline-offset-2"
        >
          {node.text}
        </a>
      );
  }
}

/** Displays entry text written in simplified markdown (bold and links). */
export function RichText({ source }: { source: string }) {
  return (
    <div className="space-y-4 leading-relaxed">
      {parseRichText(source).map((lines, paragraphIndex) => (
        <p key={paragraphIndex}>
          {lines.map((line, lineIndex) => (
            <Fragment key={lineIndex}>
              {lineIndex > 0 ? <br /> : null}
              {line.map(renderInline)}
            </Fragment>
          ))}
        </p>
      ))}
    </div>
  );
}
