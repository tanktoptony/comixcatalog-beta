import "server-only";
import { unstable_cache } from "next/cache";
import { getServiceClient } from "@/lib/supabase/service";
import { resolveCovers } from "@/lib/catalog/covers";
import { getSeriesData } from "@/lib/pageData";
import { editionGroup, EDITION_GROUP_ORDER } from "@/lib/searchWorks";
import { compareEditionBooks, editionBookLabel } from "@/lib/workPagePure";

const CHUNK_SIZE = 300;

function chunks(values) {
  const result = [];
  for (let index = 0; index < values.length; index += CHUNK_SIZE) result.push(values.slice(index, index + CHUNK_SIZE));
  return result;
}

async function queryChunks(values, query) {
  const rows = [];
  for (const group of chunks(values)) {
    const { data, error } = await query(group);
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows;
}

function publicCover(path) {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/canonical-covers/${path}`;
}

async function loadWorkData(id) {
  const supabase = getServiceClient();
  const { data: work, error: workError } = await supabase
    .from("series")
    .select("id,gcd_id,title,year_start_cached,year_end_cached,issue_count_cached,resolved_publisher_cached,card_cover_path")
    .eq("id", id)
    .maybeSingle();
  if (workError) throw workError;
  if (!work) return null;

  const { data: links, error: linksError } = await supabase
    .from("series_editions")
    .select("edition_gcd_id,work_gcd_id,role")
    .eq("work_gcd_id", work.gcd_id);
  if (linksError) throw linksError;

  const editionIds = [...new Set((links ?? []).map((row) => Number(row.edition_gcd_id)).filter(Number.isFinite))];
  const [seriesRows, formatRows] = await Promise.all([
    queryChunks(editionIds, (group) => supabase.from("series")
      .select("id,gcd_id,title,year_start_cached,issue_count_cached,card_cover_path").in("gcd_id", group)),
    queryChunks(editionIds, (group) => supabase.from("gcd_series")
      .select("gcd_id,publishing_format,binding").in("gcd_id", group)),
  ]);
  const linkById = new Map((links ?? []).map((row) => [Number(row.edition_gcd_id), row]));
  const formatById = new Map(formatRows.map((row) => [Number(row.gcd_id), row]));
  const editions = seriesRows.map((row) => ({
    ...row,
    role: linkById.get(Number(row.gcd_id))?.role,
    format: formatById.get(Number(row.gcd_id)) ?? {},
  }));
  const issues = await queryChunks(editionIds, (group) => supabase.from("gcd_issues")
    .select("gcd_id,series_gcd_id,issue_number,title,key_date,variant_of_gcd_id")
    .in("series_gcd_id", group));
  const nonVariants = issues.filter((issue) => issue.variant_of_gcd_id == null);
  const covers = await resolveCovers(supabase, nonVariants.map((issue) => ({
    gcd_issue_id: issue.gcd_id,
    series_gcd_id: issue.series_gcd_id,
    series_title: null,
    issue_number: issue.issue_number,
    year: Number(String(issue.key_date ?? "").slice(0, 4)) || null,
  })));
  const editionById = new Map(editions.map((row) => [Number(row.gcd_id), row]));
  const countBySeries = new Map();
  for (const issue of nonVariants) countBySeries.set(Number(issue.series_gcd_id), (countBySeries.get(Number(issue.series_gcd_id)) ?? 0) + 1);
  const grouped = new Map();
  for (const issue of nonVariants) {
    const edition = editionById.get(Number(issue.series_gcd_id));
    if (!edition) continue;
    const group = editionGroup(edition);
    const best = covers.get(issue.gcd_id);
    const year = Number(String(issue.key_date ?? "").slice(0, 4)) || null;
    const book = {
      id: `gcd-${issue.gcd_id}`,
      href: `/issue/gcd-${issue.gcd_id}`,
      label: editionBookLabel({ role: edition.role, seriesTitle: edition.title, workTitle: work.title,
        issueNumber: issue.issue_number, seriesBookCount: countBySeries.get(Number(issue.series_gcd_id)) }),
      title: issue.title || edition.title,
      year,
      cover: publicCover(best?.storage_path),
      series_id: edition.id,
      series_year: edition.year_start_cached,
      issue_number: issue.issue_number,
    };
    if (!grouped.has(group.label)) grouped.set(group.label, { ...group, books: [] });
    grouped.get(group.label).books.push(book);
  }
  const groups = EDITION_GROUP_ORDER.filter((label) => grouped.has(label)).map((label) => {
    const group = grouped.get(label);
    group.books.sort(compareEditionBooks);
    return { label: group.label, slug: group.slug, books: group.books.map(({ series_year, issue_number, ...book }) => book) };
  });
  const seriesData = await getSeriesData(work.id);
  const single_issues = (seriesData?.issues ?? []).slice(0, 12).map((issue) => ({
    ...issue,
    href: `/issue/${issue.id}`,
    label: issue.issue_number ? `#${issue.issue_number}` : "Issue", title: issue.title || work.title,
    year: issue.release_year,
  }));

  return {
    work: { id: work.id, title: work.title, publisher: work.resolved_publisher_cached,
      year_start: work.year_start_cached, year_end: work.year_end_cached,
      issue_count: Number(work.issue_count_cached) || 0, cover: publicCover(work.card_cover_path) },
    groups,
    total_books: groups.reduce((sum, group) => sum + group.books.length, 0),
    single_issues,
  };
}

export function getWorkData(id) {
  return unstable_cache(() => loadWorkData(id), ["work-page-v1", id], { revalidate: 600 })();
}
