import { notFound, permanentRedirect } from "next/navigation";
import IssueClient from "./IssueClient";
import { getIssueData, getIssuePageData, isIssueNotFoundError, resolveIssueEdition } from "@/lib/pageData";
import { redirectForEdition } from "@/lib/issueEditions";
import { buildIssueJsonLd } from "@/lib/issueSeo";
import { safeJsonLd } from "@/lib/jsonLd";

export default async function IssuePage({ params, searchParams }) {
  const { id } = await params;
  const query = await searchParams;
  let initialIssue = null;

  try {
    // /issue/gcd-<n> is the one public URL (it is what the site links and
    // Google has indexed). A bare /issue/<n> permanently redirects to it.
    if (/^\d+$/.test(String(id))) {
      const edition = /^\d+$/.test(String(query?.edition ?? "")) ? `?edition=${query.edition}` : "";
      permanentRedirect(`/issue/gcd-${id}${edition}`);
    }
    const gcdMatch = String(id).match(/^gcd-(\d+)$/);
    // Not in the mirror (or the lookup failed): the old loader, as before.
    const routeEdition = gcdMatch ? await resolveIssueEdition(gcdMatch[1]) : null;
    if (routeEdition) {
      const target = redirectForEdition({ requestedGcdId: Number(gcdMatch[1]), ...routeEdition });
      if (target) permanentRedirect(target);

      const requestedEdition = /^\d+$/.test(String(query?.edition ?? "")) ? Number(query.edition) : routeEdition.baseGcdId;
      const selectedResolution = requestedEdition === routeEdition.editionGcdId
        ? routeEdition
        : await resolveIssueEdition(requestedEdition);
      const selectedEdition = selectedResolution?.baseGcdId === routeEdition.baseGcdId
        ? selectedResolution.editionGcdId
        : routeEdition.baseGcdId;
      initialIssue = await getIssuePageData(routeEdition.baseGcdId, selectedEdition, routeEdition.hasEditionColumns);
    } else {
      initialIssue = await getIssueData(id);
    }
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
      <IssueClient key={initialIssue?.id ?? id} initialIssue={initialIssue} />
    </>
  );
}
