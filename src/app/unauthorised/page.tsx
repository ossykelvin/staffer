import Link from "next/link";
import { PageHeading } from "@/components/page-heading";

export default function UnauthorisedPage() {
  return (
    <>
      <PageHeading
        eyebrow="Unauthorised"
        title="This workspace is protected."
        description="You need a valid Staffer membership for this organisation before viewing live records."
      />
      <Link href="/login" className="inline-flex rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500">
        Sign in
      </Link>
    </>
  );
}
