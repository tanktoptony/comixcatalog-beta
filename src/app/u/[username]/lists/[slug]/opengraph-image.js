import { homeImage } from "@/app/opengraph-image";
import { getListPage } from "@/lib/listsData";
import { OG_SIZE, renderShelfCard } from "@/lib/og/card";

export const alt = "A comic list on ComixCatalog";
export const size = OG_SIZE;
export const contentType = "image/png";
export const revalidate = 3600;

export default async function Image({ params }) {
  try {
    const { username, slug } = await params;
    const data = await getListPage(username, slug);
    if (!data) return homeImage();

    return renderShelfCard({
      covers: data.items
        .slice(0, 6)
        .map((item) => item.cover)
        .filter(Boolean),
      title: data.list.title,
      eyebrow: `A list by @${username}`,
      lines: [`${data.items.length} books`],
      stats: [],
    });
  } catch {
    return homeImage();
  }
}
