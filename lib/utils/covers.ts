/** Open Library cover URLs. `default=false` makes missing covers 404 so the UI can fall back cleanly. */
export function olCoverUrl(coverId: number, size: "S" | "M" | "L" = "M"): string {
  return `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg?default=false`;
}

/** Google Books thumbnails arrive as http and with page curl; request https and no edge effect. */
export function tidyGoogleImage(url: string | undefined, zoom: 1 | 2 | 3 = 1): string | undefined {
  if (!url) return undefined;
  return url.replace(/^http:/, "https:").replace(/&edge=curl/, "").replace(/zoom=\d/, `zoom=${zoom}`);
}
