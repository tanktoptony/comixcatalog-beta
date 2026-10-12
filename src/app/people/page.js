import PeopleClient from "./PeopleClient";

export const metadata = {
  title: "Find collectors | ComixCatalog",
  robots: { index: false, follow: false },
};

export default function PeoplePage() {
  return <PeopleClient />;
}
