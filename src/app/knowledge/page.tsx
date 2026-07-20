import { EmptyState } from "@/components/empty-state";
import { Icons } from "@/components/icons";
import { PageHeading } from "@/components/page-heading";
import { StatusBadge } from "@/components/status-badge";
import {
  ingestKnowledgeDocumentAction,
  requestKnowledgeMemoryPromotionAction,
  requestKnowledgeRetentionDeletionAction,
  retireKnowledgeDocumentAction,
  setKnowledgeLegalHoldAction,
} from "@/app/knowledge/actions";
import { getKnowledgeHubData } from "@/lib/repositories/staffer";

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; memoryScope?: string; sensitivity?: string; projectKey?: string; customerKey?: string; message?: string; error?: string }>;
}) {
  const params = await searchParams;
  const data = await getKnowledgeHubData({
    query: params.q ?? "",
    memoryScope: params.memoryScope ?? "",
    sensitivity: params.sensitivity ?? "",
    projectKey: params.projectKey ?? "",
    customerKey: params.customerKey ?? "",
  });

  return (
    <>
      <PageHeading
        eyebrow="Knowledge hub"
        title="Approved context, not uncontrolled memory."
        description="Upload or ingest source text, scan it, version it, split clean content into citation-ready chunks, and govern which agents and workflows may retrieve each memory scope."
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
        <form id="ingest" action={ingestKnowledgeDocumentAction} encType="multipart/form-data" className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
          <h2 className="font-semibold text-white">Upload or ingest approved knowledge</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            This creates a collection if needed, stores upload metadata, runs Staffer&apos;s file safety gate, extracts supported text, stores a version, chunks clean content, generates retrieval embeddings, and emits audit evidence.
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
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-slate-200">Upload document</span>
              <input
                name="documentFile"
                type="file"
                accept=".txt,.md,.markdown,.csv,.json,.xml,.pdf,.docx,text/plain,text/markdown,text/csv,application/json,application/xml,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-500 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
              />
              <span className="text-xs leading-5 text-slate-500">Plain text, Markdown, CSV, JSON and XML are extracted automatically. PDF/DOCX uploads are retained for manual extraction review.</span>
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
            <div className="grid gap-4 md:grid-cols-3">
              <label className="grid gap-2 text-sm">
                <span className="font-medium text-slate-200">Memory scope</span>
                <select name="memoryScope" defaultValue="company" className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-slate-100 outline-none focus:border-blue-400">
                  <option value="task">Task memory</option>
                  <option value="customer">Customer memory</option>
                  <option value="project">Project memory</option>
                  <option value="company">Company knowledge</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm">
                <span className="font-medium text-slate-200">Project key</span>
                <input name="projectKey" placeholder="support, product..." className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-slate-100 outline-none focus:border-blue-400" />
              </label>
              <label className="grid gap-2 text-sm">
                <span className="font-medium text-slate-200">Customer key</span>
                <input name="customerKey" placeholder="customer or account key" className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-slate-100 outline-none focus:border-blue-400" />
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
              <textarea name="content" rows={10} placeholder="Paste approved source content here, or upload an extractable text document above..." className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-slate-100 outline-none focus:border-blue-400" />
            </label>
            <button className="rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-400">Upload, scan, version and chunk</button>
          </div>
        </form>

        <div className="space-y-6">
          <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
            <h2 className="font-semibold text-white">Citation-aware filtered search</h2>
            <form className="mt-4 grid gap-3">
              <input name="q" defaultValue={data.query} placeholder="Search approved knowledge..." className="min-w-0 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-slate-100 outline-none focus:border-blue-400" />
              <div className="grid gap-3 sm:grid-cols-2">
                <select name="memoryScope" defaultValue={data.filters?.memoryScope ?? ""} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400">
                  <option value="">All memory scopes</option>
                  <option value="task">Task memory</option>
                  <option value="customer">Customer memory</option>
                  <option value="project">Project memory</option>
                  <option value="company">Company knowledge</option>
                </select>
                <select name="sensitivity" defaultValue={data.filters?.sensitivity ?? ""} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400">
                  <option value="">All sensitivities</option>
                  <option value="internal">Internal</option>
                  <option value="confidential">Confidential</option>
                  <option value="restricted">Restricted</option>
                </select>
                <input name="projectKey" defaultValue={data.filters?.projectKey ?? ""} placeholder="Project key filter" className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400" />
                <input name="customerKey" defaultValue={data.filters?.customerKey ?? ""} placeholder="Customer key filter" className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400" />
              </div>
              <button className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/7">Search with filters</button>
            </form>
            {data.query && data.searchResults.length === 0 ? <p className="mt-4 text-sm text-slate-500">No approved chunks matched “{data.query}”.</p> : null}
            <div className="mt-5 space-y-4">
              {data.searchResults.map((result) => (
                <article key={result.chunkId} className="rounded-xl border border-white/8 bg-black/10 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="font-medium text-slate-200">{result.documentTitle}</h3>
                    <span className="text-xs text-slate-500">{result.memoryScope ?? "company"} memory</span>
                    <span className="text-xs text-cyan-300">{result.collectionName} · chunk {result.chunkIndex}</span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-400">{result.excerpt}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span>Sensitivity: {result.sensitivity ?? "internal"}</span>
                    {typeof result.semanticSimilarity === "number" ? <span>Semantic: {Math.round(result.semanticSimilarity * 100)}%</span> : null}
                    {result.projectKey ? <span>Project: {result.projectKey}</span> : null}
                    {result.customerKey ? <span>Customer: {result.customerKey}</span> : null}
                  </div>
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
                        <p className="mt-1 text-xs text-slate-500">
                          {document.memoryScope ?? "company"} memory
                          {document.projectKey ? ` · project ${document.projectKey}` : ""}
                          {document.customerKey ? ` · customer ${document.customerKey}` : ""}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">{document.collectionName ?? "Unassigned collection"} · v{document.version}</p>
                      </div>
                      <StatusBadge value={document.status} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span>Upload: {document.uploadStatus ?? "not_required"}</span>
                      <span>Scan: {document.scanStatus}</span>
                      <span>Extraction: {document.extractionStatus}</span>
                      <span>Embeddings: {document.embeddingStatus}</span>
                      {document.originalFilename ? <span>File: {document.originalFilename}</span> : null}
                      {document.fileSizeBytes ? <span>{Math.round(document.fileSizeBytes / 1024)} KB</span> : null}
                      {document.legalHold ? <span className="text-amber-200">Legal hold</span> : null}
                      {document.retentionUntil ? <span>Retain until {new Date(document.retentionUntil).toLocaleDateString("en-GB")}</span> : null}
                    </div>
                    {document.scanSummary ? <p className="mt-2 text-xs leading-5 text-slate-600">{document.scanSummary}</p> : null}
                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                      <form action={requestKnowledgeMemoryPromotionAction} className="rounded-xl border border-white/8 bg-black/10 p-3">
                        <input type="hidden" name="documentId" value={document.id} />
                        <label className="grid gap-2 text-xs text-slate-400">
                          Promote to scope
                          <select name="targetMemoryScope" defaultValue="company" className="rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-slate-100 outline-none focus:border-blue-400">
                            <option value="customer">Customer memory</option>
                            <option value="project">Project memory</option>
                            <option value="company">Company knowledge</option>
                          </select>
                        </label>
                        <input name="reason" required placeholder="Promotion reason" className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-blue-400" />
                        <button
                          disabled={(document.memoryScope ?? "company") === "company"}
                          className="mt-2 rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                        >
                          {(document.memoryScope ?? "company") === "company" ? "Already company knowledge" : "Request promotion approval"}
                        </button>
                      </form>

                      <form action={requestKnowledgeRetentionDeletionAction} className="rounded-xl border border-rose-400/15 bg-rose-400/[0.04] p-3">
                        <input type="hidden" name="documentId" value={document.id} />
                        <input name="reason" required placeholder="Retention deletion reason" className="w-full rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-rose-400" />
                        <button className="mt-2 rounded-lg border border-rose-400/30 px-3 py-1.5 text-xs font-semibold text-rose-100 transition hover:bg-rose-400/10">Request deletion approval</button>
                        <p className="mt-2 text-[11px] leading-4 text-slate-600">Creates an approval first; approval soft-retires retrieval while keeping audit metadata.</p>
                      </form>

                      <form action={setKnowledgeLegalHoldAction} className="rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-3">
                        <input type="hidden" name="documentId" value={document.id} />
                        <input type="hidden" name="legalHold" value={document.legalHold ? "false" : "true"} />
                        <label className="grid gap-2 text-xs text-slate-400">
                          Reason
                          <input name="reason" placeholder="Legal hold reason" className="rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-slate-100 outline-none focus:border-amber-400" />
                        </label>
                        {document.legalHold ? (
                          <label className="mt-2 grid gap-2 text-xs text-slate-400">
                            Retention days after removal
                            <input name="retentionDays" type="number" min="1" defaultValue="365" className="rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-slate-100 outline-none focus:border-amber-400" />
                          </label>
                        ) : null}
                        <button className="mt-2 rounded-lg border border-amber-400/30 px-3 py-1.5 text-xs font-semibold text-amber-100 transition hover:bg-amber-400/10">
                          {document.legalHold ? "Remove legal hold" : "Enable legal hold"}
                        </button>
                      </form>

                      <form action={retireKnowledgeDocumentAction} className="rounded-xl border border-white/8 bg-black/10 p-3">
                        <input type="hidden" name="documentId" value={document.id} />
                        <input name="reason" placeholder="Retirement reason" className="w-full rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-blue-400" />
                        <button
                          disabled={document.legalHold || !document.retentionUntil || new Date(document.retentionUntil) > new Date()}
                          className="mt-2 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/7 disabled:cursor-not-allowed disabled:text-slate-600"
                        >
                          Retire expired document
                        </button>
                      </form>
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
