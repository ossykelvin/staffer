import { EmptyState } from "@/components/empty-state";
import { Icons } from "@/components/icons";
import { PageHeading } from "@/components/page-heading";
import { StatusBadge } from "@/components/status-badge";
import { ingestKnowledgeDocumentAction } from "@/app/knowledge/actions";
import { getKnowledgeHubData } from "@/lib/repositories/staffer";

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; message?: string; error?: string }>;
}) {
  const params = await searchParams;
  const data = await getKnowledgeHubData(params.q ?? "");

  return (
    <>
      <PageHeading
        eyebrow="Knowledge hub"
        title="Approved context, not uncontrolled memory."
        description="Ingest source text, version it, split it into citation-ready chunks, and govern which agents may retrieve each collection."
        action={
          <a href="#ingest" className="rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-400">
            Ingest knowledge
          </a>
        }
      />
      {params.message ? <div className="mb-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">{params.message}</div> : null}
      {params.error ? <div className="mb-6 rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-100">{params.error}</div> : null}

      {data.collections.length === 0 ? (
        <EmptyState title="No collections yet" description="Ingest an approved source to create the first governed knowledge collection." icon={Icons.knowledge} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {data.collections.map((collection) => (
            <div key={collection.id} className="rounded-2xl border border-white/8 bg-white/[0.04] p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wider text-slate-600">Collection</p>
                  <h2 className="mt-3 font-semibold">{collection.name}</h2>
                </div>
                <StatusBadge value={collection.accessMode} />
              </div>
              <p className="mt-6 text-3xl font-semibold">{collection.chunkCount}</p>
              <p className="mt-1 text-xs text-slate-500">searchable chunks from {collection.documentCount} documents</p>
              <div className="mt-5 border-t border-white/7 pt-4 text-xs text-slate-400">
                <p className="text-cyan-300">{collection.sensitivity}</p>
                <p className="mt-1">{collection.reviewDueCount ?? 0} review due · {collection.retentionDays ?? "policy"} day retention</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <section className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <form id="ingest" action={ingestKnowledgeDocumentAction} className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
          <h2 className="font-semibold text-white">Ingest approved source text</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            This creates a collection if needed, stores a document version, chunks text, records citations, queues embedding status, and emits an audit event.
          </p>
          <div className="mt-5 grid gap-4">
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-slate-200">Collection name</span>
              <input name="collectionName" required placeholder="Customer support knowledge" className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-slate-100 outline-none focus:border-blue-400" />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-slate-200">Collection key</span>
              <input name="collectionKey" placeholder="customer-support" className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-slate-100 outline-none focus:border-blue-400" />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-slate-200">Document title</span>
              <input name="title" required placeholder="Refund policy v1" className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-slate-100 outline-none focus:border-blue-400" />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-slate-200">Source URL or reference</span>
              <input name="sourceUrl" placeholder="https://..." className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-slate-100 outline-none focus:border-blue-400" />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm">
                <span className="font-medium text-slate-200">Sensitivity</span>
                <select name="sensitivity" className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-slate-100 outline-none focus:border-blue-400">
                  <option value="internal">Internal</option>
                  <option value="confidential">Confidential</option>
                  <option value="restricted">Restricted</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm">
                <span className="font-medium text-slate-200">Access mode</span>
                <select name="accessMode" className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-slate-100 outline-none focus:border-blue-400">
                  <option value="organisation">Organisation</option>
                  <option value="restricted">Restricted agents only</option>
                </select>
              </label>
            </div>
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-slate-200">Allowed agent keys for restricted collections</span>
              <input name="agentKeys" placeholder="anna, lawal, kristin" className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-slate-100 outline-none focus:border-blue-400" />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm">
                <span className="font-medium text-slate-200">Review interval days</span>
                <input name="reviewIntervalDays" type="number" min="1" defaultValue="90" className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-slate-100 outline-none focus:border-blue-400" />
              </label>
              <label className="grid gap-2 text-sm">
                <span className="font-medium text-slate-200">Retention days</span>
                <input name="retentionDays" type="number" min="1" defaultValue="365" className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-slate-100 outline-none focus:border-blue-400" />
              </label>
            </div>
            <label className="flex items-center gap-3 rounded-xl border border-white/8 bg-black/10 p-3 text-sm text-slate-300">
              <input name="legalHold" type="checkbox" className="size-4" />
              Legal hold: do not apply retention expiry
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-slate-200">Approved source text</span>
              <textarea name="content" required rows={10} placeholder="Paste the approved source content here..." className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-slate-100 outline-none focus:border-blue-400" />
            </label>
            <button className="rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-400">Ingest, version and chunk</button>
          </div>
        </form>

        <div className="space-y-6">
          <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
            <h2 className="font-semibold text-white">Citation-aware search</h2>
            <form className="mt-4 flex gap-3">
              <input name="q" defaultValue={data.query} placeholder="Search approved knowledge..." className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-slate-100 outline-none focus:border-blue-400" />
              <button className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/7">Search</button>
            </form>
            {data.query && data.searchResults.length === 0 ? <p className="mt-4 text-sm text-slate-500">No approved chunks matched “{data.query}”.</p> : null}
            <div className="mt-5 space-y-4">
              {data.searchResults.map((result) => (
                <article key={result.chunkId} className="rounded-xl border border-white/8 bg-black/10 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="font-medium text-slate-200">{result.documentTitle}</h3>
                    <span className="text-xs text-cyan-300">{result.collectionName} · chunk {result.chunkIndex}</span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-400">{result.excerpt}</p>
                  <p className="mt-3 break-all font-mono text-[11px] text-slate-600">Citation: {JSON.stringify(result.citation)}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
            <h2 className="font-semibold text-white">Recent source documents</h2>
            {data.documents.length === 0 ? (
              <p className="mt-4 text-sm leading-6 text-slate-500">No live documents yet. Ingest a source to create versioned, citation-ready chunks.</p>
            ) : (
              <div className="mt-5 space-y-3">
                {data.documents.map((document) => (
                  <div key={document.id} className="rounded-xl border border-white/8 bg-black/10 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-medium text-slate-200">{document.title}</h3>
                        <p className="mt-1 text-xs text-slate-500">{document.collectionName ?? "Unassigned collection"} · v{document.version}</p>
                      </div>
                      <StatusBadge value={document.status} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span>Scan: {document.scanStatus}</span>
                      <span>Extraction: {document.extractionStatus}</span>
                      <span>Embeddings: {document.embeddingStatus}</span>
                      {document.legalHold ? <span className="text-amber-200">Legal hold</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
