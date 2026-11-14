import type { MentionRange } from "./mention-ranges";
export function MentionText({
  text,
  mentions = [],
}: {
  text: string;
  mentions?: MentionRange[];
}) {
  const parts = [];
  let end = 0;
  for (const mention of [...mentions].sort((a, b) => a.start - b.start)) {
    if (
      mention.start < end ||
      mention.end > text.length ||
      mention.end <= mention.start ||
      text[mention.start] !== "@"
    )
      continue;
    parts.push(text.slice(end, mention.start));
    parts.push(
      <mark
        className="inline-mention"
        key={`${mention.start}:${mention.userId}`}
      >
        {text.slice(mention.start, mention.end)}
      </mark>,
    );
    end = mention.end;
  }
  parts.push(text.slice(end));
  return <>{parts}</>;
}
