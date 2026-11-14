export type MentionRange = { userId: string; start: number; end: number };
export function activeMentionQuery(
  text: string,
  caret: number,
  mentions: MentionRange[],
) {
  const match = /(?:^|\s)@([^@\n]{0,60})$/.exec(text.slice(0, caret));
  if (!match) return null;
  const start = caret - match[1]!.length - 1;
  // A selected mention remains committed while writing the following sentence.
  if (mentions.some((mention) => start >= mention.start && start < mention.end))
    return null;
  return { start, end: caret, text: match[1]! };
}
export function moveMentions(
  old: string,
  value: string,
  mentions: MentionRange[],
) {
  let start = 0;
  while (
    start < old.length &&
    start < value.length &&
    old[start] === value[start]
  )
    start++;
  let end = old.length,
    nextEnd = value.length;
  while (
    end > start &&
    nextEnd > start &&
    old[end - 1] === value[nextEnd - 1]
  ) {
    end--;
    nextEnd--;
  }
  const delta = nextEnd - end;
  return mentions.flatMap((mention) =>
    mention.end <= start
      ? [mention]
      : mention.start >= end
        ? [
            {
              ...mention,
              start: mention.start + delta,
              end: mention.end + delta,
            },
          ]
        : [],
  );
}
export function trimmedMentions(value: string, mentions: MentionRange[]) {
  const offset = value.length - value.trimStart().length;
  return mentions.map((mention) => ({
    ...mention,
    start: mention.start - offset,
    end: mention.end - offset,
  }));
}
