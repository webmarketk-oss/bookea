type DuplicateStamp = {
  id: string;
  createdDate?: string;
  createdAt?: string;
};

/** La fiche gardée est la plus récente. Les plus anciennes s’y relient, jamais l’inverse. */
export function duplicateMergeTarget<T extends DuplicateStamp>(group: T[]) {
  const ordered = [...group].sort((left, right) =>
    String(left.createdDate || left.createdAt || "").localeCompare(
      String(right.createdDate || right.createdAt || ""),
    ),
  );
  return {
    kept: ordered[ordered.length - 1],
    linked: ordered.slice(0, -1),
  };
}
