const LEADING_IGNORABLE = String.raw`(?:\s|--[^\r\n]*(?:\r?\n|$)|\/\*[\s\S]*?\*\/)*`;
const TRAILING_IGNORABLE = String.raw`(?:\s|--[^\r\n]*(?:\r?\n|$)|\/\*[\s\S]*?\*\/)*`;

export function unwrapOuterTransaction(sql) {
  const source = String(sql ?? "");
  const begin = source.match(new RegExp(`^(${LEADING_IGNORABLE})(begin\\s*;)`, "i"));
  const commit = source.match(new RegExp(`(commit\\s*;)(${TRAILING_IGNORABLE})$`, "i"));

  if (!begin || !commit || commit.index === undefined) return source;

  const beginStart = begin[1].length;
  const beginEnd = beginStart + begin[2].length;
  const commitStart = commit.index;
  const commitEnd = commitStart + commit[1].length;

  if (beginEnd > commitStart) return source;

  return `${source.slice(0, beginStart)}${source.slice(beginEnd, commitStart)}${source.slice(commitEnd)}`;
}
