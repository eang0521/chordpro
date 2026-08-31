/**
 * Greedily buckets items (given their already-measured heights, each assumed to already
 * include its own trailing gap) into pages no taller than `pageHeightPx`. Returns arrays of
 * indices into the original `heights` array, one array per page.
 */
export function paginateByHeight(heights: number[], pageHeightPx: number): number[][] {
  const pages: number[][] = [[]];
  let used = 0;

  heights.forEach((h, i) => {
    const currentPage = pages[pages.length - 1];
    if (currentPage.length > 0 && used + h > pageHeightPx) {
      pages.push([i]);
      used = h;
    } else {
      currentPage.push(i);
      used += h;
    }
  });

  return pages;
}
