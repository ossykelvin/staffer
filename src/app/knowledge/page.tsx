import { EmptyState } from "@/components/empty-state";
import { Icons } from "@/components/icons";
import { PageHeading } from "@/components/page-heading";

const collections = [
  { name: "Company policies", items: 18, status: "Ready" },
  { name: "Product documentation", items: 42, status: "Ready" },
  { name: "Customer support knowledge", items: 67, status: "Needs review" },
  { name: "Architecture decisions", items: 12, status: "Ready" },
];

export default function KnowledgePage() {
  return (
    <>
      <PageHeading
        eyebrow="Knowledge hub"
        title="Approved context, not uncontrolled memory."
        description="Store source documents, version them, split them into searchable chunks, and decide which agents may retrieve each collection."
        action={
          <button
            type="button"
            disabled
            title="Upload is blocked until ingestion, scanning, citations, and collection access control exist."
            className="cursor-not-allowed rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-500"
          >
            Upload blocked
          </button>
        }
      />
      {collections.length === 0 ? (
        <EmptyState title="No collections yet" description="Approved knowledge collections will appear here once ingestion is implemented." icon={Icons.knowledge} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {collections.map((collection) => (
            <div key={collection.name} className="rounded-2xl border border-white/8 bg-white/[0.04] p-5">
              <p className="text-xs uppercase tracking-wider text-slate-600">Collection</p>
              <h2 className="mt-3 font-semibold">{collection.name}</h2>
              <p className="mt-6 text-3xl font-semibold">{collection.items}</p>
              <p className="mt-1 text-xs text-slate-500">indexed items</p>
              <p className="mt-5 border-t border-white/7 pt-4 text-xs text-cyan-300">{collection.status}</p>
            </div>
          ))}
        </div>
      )}
      <div className="mt-6 rounded-2xl border border-dashed border-white/10 bg-white/[0.025] p-10 text-center">
        <h2 className="font-semibold">Vector search wiring is intentionally deferred</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
          Ingestion, chunking, embeddings, access policies, citations and retention are planned for PB-020.
        </p>
      </div>
    </>
  );
}
