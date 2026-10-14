/**
 * Page transition. A template, unlike a layout, remounts on every navigation,
 * so each page arrives with a short fade and rise.
 *
 * A CSS animation rather than Framer Motion: it starts from the server HTML,
 * so the page is never left invisible waiting for JavaScript to hydrate. It
 * animates opacity and transform only, with fill-mode `backwards` so nothing
 * of it remains once it ends. A transform animation that is still filling
 * (`forwards`/`both`) makes this wrapper the containing block for every
 * `position: fixed` element inside it, and the pinned section then scrolls
 * away instead of pinning.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
