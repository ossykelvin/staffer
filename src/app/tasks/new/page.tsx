import { PageHeading } from "@/components/page-heading";
import { TaskCreateDemoForm } from "@/components/task-create-demo-form";
import { getAgents } from "@/lib/repositories/staffer";

export default async function NewTaskPage() {
  const agents = await getAgents();

  return (
    <>
      <PageHeading
        eyebrow="Create task"
        title="Stage a demo task."
        description="Use this form to exercise the task workflow without writing live data. Persistent creation unlocks after Supabase Auth, tenant repositories, and audit events are implemented."
      />
      <TaskCreateDemoForm owners={agents.map((agent) => agent.name)} />
    </>
  );
}
