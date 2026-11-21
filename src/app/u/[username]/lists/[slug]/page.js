import { notFound } from "next/navigation";
import ListView from "@/components/lists/ListView";
import PrivateListGate from "@/components/lists/PrivateListGate";
import {
  getListPage,
  getListPathRecord,
} from "@/lib/listsData";

export async function generateMetadata({ params }) {
  const { username, slug } = await params;
  const data = await getListPage(username, slug);

  if (!data) {
    const record = await getListPathRecord(username, slug);
    return record ? { robots: { index: false, follow: false } } : {};
  }

  const description =
    data.list.description ||
    data.items
      .slice(0, 3)
      .map((item) => item.title)
      .join(", ");

  return {
    title: `${data.list.title}, a comic list by @${username}`,
    description,
    openGraph: {
      title: data.list.title,
      description,
      images: [`/u/${username}/lists/${slug}/opengraph-image`],
    },
    twitter: {
      card: "summary_large_image",
      title: data.list.title,
      description,
    },
  };
}

export default async function ListPage({ params }) {
  const { username, slug } = await params;
  const data = await getListPage(username, slug);

  if (data) return <ListView initialData={data} />;

  const record = await getListPathRecord(username, slug);
  if (!record) notFound();

  return (
    <PrivateListGate
      username={username}
      slug={slug}
      ownerId={record.owner.id}
    />
  );
}
