import { notFound } from "next/navigation";
import IssueClient from "./IssueClient";
import { getIssueData, isIssueNotFoundError } from "@/lib/pageData";
import { buildIssueJsonLd } from "@/lib/issueSeo";
import { safeJsonLd } from "@/lib/jsonLd";

export default async function IssuePage({ params }) {
  const { id } = await params;
  let initialIssue = null;

  try {
    initialIssue = await getIssueData(id);
  } catch (error) {
    if (isIssueNotFoundError(error)) notFound();
    throw error;
  }

  const jsonLd = initialIssue ? buildIssueJsonLd(initialIssue, id) : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
        />
      )}
      <IssueClient initialIssue={initialIssue} />
    </>
  );
}
