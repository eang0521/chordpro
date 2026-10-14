/**
 * Buckets items (given their already-measured heights, each assumed to already include its own
 * trailing gap) into pages no taller than `pageHeightPx`, keeping each group of items — a song
 * section — together on one page. A group only splits across pages if it's taller than a whole
 * page by itself. `groups` lists every item index once, in order. Returns arrays of indices into
 * `heights`, one array per page.
 */
export function paginateByHeight(heights: number[], groups: number[][], pageHeightPx: number): number[][] {
  const pages: number[][] = [[]];
  let used = 0;

  function place(i: number) {
    const currentPage = pages[pages.length - 1];
    if (currentPage.length > 0 && used + heights[i] > pageHeightPx) {
      pages.push([i]);
      used = heights[i];
    } else {
      currentPage.push(i);
      used += heights[i];
    }
  }

  groups.forEach((group) => {
    const total = group.reduce((sum, i) => sum + heights[i], 0);
    if (total <= pageHeightPx && pages[pages.length - 1].length > 0 && used + total > pageHeightPx) {
      pages.push([]);
      used = 0;
    }
    group.forEach(place);
  });

  return pages;
}

/**
 * Finds the largest line spacing in [min, max] (to 0.01) whose layout fits in `maxPages` pages,
 * given a function that measures every item's height at a spacing. Fewer pages always wins, so it
 * tries one page before two. Returns null if even `min` needs more than `maxPages` pages.
 */
export function fitLineSpacing(
  measure: (spacing: number) => number[],
  groups: number[][],
  pageHeightPx: number,
  maxPages: number,
  min: number,
  max: number,
): { spacing: number; pages: number } | null {
  const pageCount = (hundredths: number) =>
    paginateByHeight(measure(hundredths / 100), groups, pageHeightPx).length;

  for (let target = 1; target <= maxPages; target++) {
    let lo = Math.round(min * 100);
    let hi = Math.round(max * 100);
    if (pageCount(lo) > target) continue;
    // Taller spacing never takes fewer pages, so binary-search the largest spacing that fits.
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (pageCount(mid) <= target) lo = mid;
      else hi = mid - 1;
    }
    return { spacing: lo / 100, pages: target };
  }
  return null;
}
