/** Skeleton rows while the character library reads the saved storyboards (UI pass of 2026-10-25). */
export default function LibraryLoading(){
 return <section className="space-y-6" aria-busy="true"><div><p className="kicker">Characters</p><h1 className="page-title">Characters by video</h1><p role="status" className="sr-only">Loading your characters…</p></div>
  <div className="space-y-6" aria-hidden="true">{[0,1].map(i=><div key={i} className="card space-y-4"><div className="skel w-2/5"/><div className="grid gap-4 sm:grid-cols-3">{[0,1,2].map(j=><div key={j} className="card p-0 overflow-hidden"><div className="skel h-48 m-0 rounded-none"/><div className="p-3"><div className="skel w-3/5"/><div className="skel w-4/5"/></div></div>)}</div></div>)}</div>
 </section>;
}
