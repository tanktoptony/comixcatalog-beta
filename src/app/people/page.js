import PeopleClient from "./PeopleClient";

export const metadata = {
  title: "Find collectors | ComixCatalog",
  robots: { index: false, follow: false },
};

export default async function PeoplePage({ searchParams }) {
  const { tab } = await searchParams;
  return <PeopleClient initialTab={tab === "followers" ? "followers" : "following"} />;
}
