import SeriesClient from "./SeriesClient";
import { getSeriesData } from "@/lib/pageData";

// Server-renders the series header and issue grid into the HTML (the page
// used to render empty and fetch /api/series/[id] from the browser). The
// data is the same cached read layout.js uses for the page title, so one
// request does the work once.
export default async function SeriesPage({ params }) {
  const { id } = await params;
  const initialSeries = await getSeriesData(id);
  return <SeriesClient initialSeries={initialSeries} />;
}
