import { AgentCard } from "@/components/agent-card";
import { PageHeading } from "@/components/page-heading";
import { getAgents } from "@/lib/repositories/staffer";

export default async function AgentsPage() {
  const agents = await getAgents();

  return (
    <>
      <PageHeading
        eyebrow="AI staff directory"
        title="Meet the team."
        description="Each agent has a human profile, specialist skills, limited tools, an autonomy level, and explicit approval boundaries. Live mode reads these through tenant-aware repositories."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{agents.map((agent) => <AgentCard key={agent.id} agent={agent} />)}</div>
    </>
  );
}
