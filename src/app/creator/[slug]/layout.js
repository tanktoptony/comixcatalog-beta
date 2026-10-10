import { getCreatorPage } from "@/lib/creatorData";
import { buildCreatorDescription } from "@/lib/creatorPage";
import { SITE_URL } from "@/lib/siteUrl";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const creator = await getCreatorPage(slug);
  if (!creator) return {};
  const title = `${creator.name} comics: runs, key issues and credits`;
  const description = buildCreatorDescription(creator);
  const url = `${SITE_URL}/creator/${creator.slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "profile" },
  };
}

export default function CreatorLayout({ children }) {
  return children;
}
