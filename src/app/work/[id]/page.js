import { notFound } from "next/navigation";
import WorkClient from "./WorkClient";
import { getWorkData } from "@/lib/workPage";
import { SITE_URL } from "@/lib/siteUrl";

const DESCRIPTION_LABELS = {
  TPB: "trade paperbacks", HC: "hardcovers", Deluxe: "deluxe editions", Omnibus: "omnibuses",
  Compendium: "compendiums", Absolute: "absolute editions", "Library Edition": "library editions",
  "Artist's Edition": "artist's editions", Collected: "collected editions",
  "Graphic Novel": "graphic novels", Specials: "specials",
};

function years(work) {
  if (work.year_start && work.year_end && work.year_start !== work.year_end) return `${work.year_start}–${work.year_end}`;
  return String(work.year_start || work.year_end || "");
}

function descriptionFor(data) {
  const labels = [];
  if (data.work.issue_count) labels.push("single issues");
  labels.push(...data.groups.map((group) => DESCRIPTION_LABELS[group.label] || group.label.toLowerCase()));
  const context = [data.work.publisher, years(data.work)].filter(Boolean).join(", ");
  const total = data.work.issue_count + data.total_books;
  return `Every edition of ${data.work.title}${context ? ` (${context})` : ""}: ${total} book${total === 1 ? "" : "s"}${labels.length ? ` across ${labels.join(", ")}` : ""}.`;
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const data = await getWorkData(id);
  if (!data) return {};
  const title = `${data.work.title}: all editions`;
  const description = descriptionFor(data);
  const url = `${SITE_URL}/work/${id}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title: `${title} | ComixCatalog`, description, url, type: "website" },
    twitter: { card: "summary_large_image", title: `${title} | ComixCatalog`, description },
  };
}

export default async function WorkPage({ params }) {
  const { id } = await params;
  const data = await getWorkData(id);
  if (!data) notFound();
  return <WorkClient data={data} />;
}
