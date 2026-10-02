// Shown the moment a link is clicked, while the page's data loads: the
// sidebar stays put and the content area becomes this outline. Because it's a
// loading boundary, links also prefetch everything down to here, so the
// switch is instant even though each page is built fresh on the server.
export default function Loading() {
  const bar = "animate-pulse rounded bg-stone-200/80";
  return (
    <div role="status" aria-live="polite" aria-label="Loading">
      <span className="sr-only">Loading…</span>
      <div className="-mx-4 -mt-4 mb-4 border-b border-stone-200 bg-white px-4 pt-4 pb-3 lg:-mx-6 lg:-mt-5 lg:px-6 lg:pt-5">
        <div className={`${bar} h-6 w-40`} />
        <div className={`${bar} mt-2 h-4 w-72 max-w-full`} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border border-stone-200 bg-white p-3">
            <div className={`${bar} h-3 w-20`} />
            <div className={`${bar} mt-3 h-6 w-24`} />
          </div>
        ))}
      </div>
      <div className="mt-4 overflow-hidden rounded-lg border border-stone-200 bg-white">
        <div className="border-b border-stone-200 bg-stone-50/80 px-3 py-2.5">
          <div className={`${bar} h-3 w-28`} />
        </div>
        <div className="space-y-3 p-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={`${bar} h-4`} style={{ width: `${92 - i * 9}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
