// One-shot publisher for the "what to read before Doomsday / Secret Wars /
// X-Men" reading-guide post. Uses the service-role key (bypasses RLS) and
// upserts into blog_posts on the slug's unique constraint — safe to
// re-run after editing POST.content to push updates to the live post.
//
// Usage:
//   node scripts/publishDoomsdayReadingGuide.js

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { createClient } from "@supabase/supabase-js";

const ADMIN_ID = "9ec650a2-8870-4175-82da-99d72cab9efc";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Absolute site URL for internal /series links (works regardless of where
// this script is run from) and the public canonical-covers storage prefix.
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://www.comixcatalog.com";
const COVER = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/canonical-covers`;

const POST = {
  title: "The Reading Guide: What to Read Before Avengers: Doomsday, Secret Wars, and the New X-Men",
  slug: "reading-guide-doomsday-secret-wars-x-men",
  excerpt:
    "Avengers: Doomsday hits theaters December 18, 2026, with Secret Wars right behind it in 2027 and a full X-Men reboot in the wings. Here's the comics homework that actually pays off — Doom, Battleworld, and two generations of mutants.",
  content: `Marvel just laid out the next three years in one breath: **Avengers: Doomsday** on December 18, 2026, **Avengers: Secret Wars** on December 17, 2027, and a standalone X-Men film after that (director Jake Schreier, Samara Weaving confirmed as Emma Frost, full cast expected by end of 2026). Robert Downey Jr. is Doctor Doom. The classic X-Men cast — Patrick Stewart, Ian McKellen, Alan Cumming, Rebecca Romijn, James Marsden, Channing Tatum, Kelsey Grammer — is folding straight into the Avengers side before the reboot even casts its own team.

That's a lot of continuity stacked on top of itself. If you want to walk in knowing why any of this matters instead of just recognizing faces, here's where to start — every book below links straight to its catalog page so you can pull it up, check what printings exist, and log it once you've read it.

## Start with Doom, not the Avengers

Everything downstream of Doomsday traces back to one character. Skip the scattered appearances and go straight to the two books that built the version of Doom this movie is clearly drawing from.

[![Books of Doom #1 (2006), Brubaker](${COVER}/comicvine/books-of-doom/vol-21927/132214-the-books-of-doom-book-1.jpg)](${SITE}/series/32f911aa-dbbe-43ba-b2b7-5035dc0909d3)

- **[Books of Doom](${SITE}/series/32f911aa-dbbe-43ba-b2b7-5035dc0909d3)** (Ed Brubaker, 2005-06) — the definitive modern origin. Six issues, no filler. If you only read one thing on this list, make it this.

[![Fantastic Four (2009), Hickman & Eaglesham](${COVER}/comicvine/fantastic-four/vol-6211/44623-vive-le-fantastique.jpg)](${SITE}/series/3d6bd260-847d-451a-9638-f4ea3a91dee2)

- **[Fantastic Four](${SITE}/series/3d6bd260-847d-451a-9638-f4ea3a91dee2)** by Jonathan Hickman (2009-12) — reframes Doom as a multiversal-scale threat instead of a guy in a castle with a grudge. This run is the direct ancestor of the Secret Wars story Marvel is now putting on screen.

## The Secret Wars precedent

"Secret Wars" has meant two very different things in Marvel history, and it's worth knowing both before the movie.

[![Marvel Super Heroes Secret Wars #1 (1984), Shooter & Zeck](${COVER}/comicvine/marvel-super-heroes-secret-wars/vol-3352/57504-the-war-begins.jpg)](${SITE}/series/510b2557-b30e-4492-8f29-07ceac6ef47d)

- **[Secret Wars](${SITE}/series/510b2557-b30e-4492-8f29-07ceac6ef47d)** (1984, Jim Shooter & Mike Zeck) — the original. A god-like being called the Beyonder yanks Marvel's heroes and villains onto a patchwork planet called Battleworld to fight it out. Structurally simple, but it's the template: heroes and villains, forced together, one arena.

[![Secret Wars (2015), Hickman & Ribic](${COVER}/comicvine/secret-wars/vol-81833/487843-the-end-times.jpg)](${SITE}/series/3b27768e-6bb1-4815-814f-4bea16b37f3a)

- **[Secret Wars](${SITE}/series/3b27768e-6bb1-4815-814f-4bea16b37f3a)** (2015, Jonathan Hickman & Esad Ribic) — the one that actually matters here. Doom survives the total collapse of the multiverse and rebuilds the last scraps of every reality into a single Battleworld, ruling it as *God Emperor Doom*. This is almost certainly the shape of the film — read the build-up too if you have time:

[![New Avengers (2013), Hickman](${COVER}/comicvine/new-avengers/vol-55330/376665-memento-mori.jpg)](${SITE}/series/e97936cb-ad6d-4501-81a9-264c1108398d)

[![Avengers (2013), Hickman & Hitch](${COVER}/comicvine/avengers/vol-54428/371103-avengers-world.jpg)](${SITE}/series/eb8cb0c8-eaca-4973-a54f-29ec79c8fd4a)

- **[New Avengers](${SITE}/series/e97936cb-ad6d-4501-81a9-264c1108398d)** and **[Avengers](${SITE}/series/eb8cb0c8-eaca-4973-a54f-29ec79c8fd4a)** (both Hickman, 2013-15) spend two years explaining why realities are colliding in the first place. Optional, but it's the connective tissue between "Doom is a villain" and "Doom rebuilds the universe."

## The team Doomsday is actually assembling

A lot of Doomsday's cast comes pre-loaded from other corners of the MCU. You don't need deep cuts here, just the beat that explains why each group is in the room:

[![Fantastic Four #1 (1961), Lee & Kirby](${COVER}/comicvine/fantastic-four/vol-2045/5558-the-fantastic-four.jpg)](${SITE}/series/82582822-1b0c-4e57-bb24-2f9ec25c6373)

- **Fantastic Four** (Pedro Pascal, Vanessa Kirby, Joseph Quinn, Ebon Moss-Bachrach) — if *First Steps* didn't already cover it for you, **[Fantastic Four #1](${SITE}/series/82582822-1b0c-4e57-bb24-2f9ec25c6373)** (Stan Lee & Jack Kirby, 1961) is still the fastest way to understand why this team and Doom are permanently linked.

[![Thunderbolts #1 (2022), Zub](${COVER}/comicvine/thunderbolts/vol-144863/944944-new-york-s-finest.jpg)](${SITE}/series/5ea4c7f9-2e57-4688-8d22-cfd005d0ee0c)

- **Thunderbolts** (Florence Pugh, Lewis Pullman, David Harbour, Hannah John-Kamen) — the **[Thunderbolts](${SITE}/series/5ea4c7f9-2e57-4688-8d22-cfd005d0ee0c)** run (Jim Zub, 2022-) is the closest comics analog to the "damaged people forced into a team" premise the recent film ran with.

[![The Uncanny X-Men, Claremont & Byrne](${COVER}/comicvine/the-uncanny-x-men/vol-3092/21057-mind-out-of-time.jpg)](${SITE}/series/acdfa2bd-810c-4929-9019-5e70fabab4da)

- **The legacy X-Men** (Stewart, McKellen, Cumming, Romijn, Marsden, Tatum) — this cast has effectively been playing these roles since 2000, but if you want the comics DNA under the performances: **[The Uncanny X-Men](${SITE}/series/acdfa2bd-810c-4929-9019-5e70fabab4da)** by Chris Claremont, especially the **Dark Phoenix Saga** (#129-137) and **God Loves, Man Kills** — the graphic novel that *X2* and a good chunk of this cast's tone is quietly built on.

## Get ahead of the new X-Men

The reboot is a separate production from Doomsday's legacy cameos, and it's clearly aiming for a different tone. With Emma Frost confirmed and Kitty Pryde, Beast, and Rogue circling as rumors, the smart move is reading the two books that define those characters at their best — plus the run that most likely shaped the studio's whole approach to relaunching this franchise.

[![House of X (2019), Hickman & Larraz](${COVER}/comicvine/house-of-x/vol-120309/714236-the-house-that-xavier-built.jpg)](${SITE}/series/e8769b3e-7753-4159-bbba-b4741ef801d7)

[![Powers of X (2019), Hickman & Silva](${COVER}/comicvine/powers-of-x/vol-120407/714669-the-last-dream-of-professor-x.jpg)](${SITE}/series/c1421d5d-0cb5-4ecd-b17f-2f1a3f7a7156)

- **[House of X](${SITE}/series/e8769b3e-7753-4159-bbba-b4741ef801d7)** / **[Powers of X](${SITE}/series/c1421d5d-0cb5-4ecd-b17f-2f1a3f7a7156)** (Jonathan Hickman, 2019) — the modern X-Men relaunch that reframed the entire franchise around Krakoa, mutant nationhood, and Moira MacTaggert's hidden timeline. Given Hickman's fingerprints are already on the Secret Wars side of this story, this is the single most useful comic for guessing where a reboot goes next.
- **Uncanny X-Men #129-131** (Claremont & Byrne, 1980, same run pictured above) — Emma Frost and Kitty Pryde's first appearances, both introduced in the same three issues via the Hellfire Club. Efficient and still the best version of both characters' introductions.

[![Gambit #1 (1993), Nicieza & Bagley](${COVER}/comicvine/gambit/vol-5011/94616-tithing.jpg)](${SITE}/series/557acdd5-1507-4220-842e-6f138e869baf)

- **[Gambit](${SITE}/series/557acdd5-1507-4220-842e-6f138e869baf)** (1993 limited series) — if Channing Tatum's Gambit gets real screen time, this is the classic entry point. **Uncanny X-Men #266** (his first appearance) is the other one, folded into the run pictured above.

## Track it as you go

If you're pulling any of these off a shelf or a back-issue bin, log them in your ComixCatalog library as you read — grade, notes, and all. Two years from now when Secret Wars actually lands, you'll have a record of exactly what got you there.`,
};

async function run() {
  console.log(`Publishing: "${POST.title}"`);
  console.log(`Slug: /blog/${POST.slug}`);

  const { data, error } = await supabase
    .from("blog_posts")
    .upsert(
      {
        title: POST.title,
        slug: POST.slug,
        excerpt: POST.excerpt,
        content: POST.content,
        published: true,
        published_at: new Date().toISOString(),
        author_id: ADMIN_ID,
      },
      { onConflict: "slug" }
    )
    .select()
    .single();

  if (error) {
    console.error("Upsert failed:", error);
    process.exit(1);
  }

  console.log("✓ Published.");
  console.log(`  id:   ${data.id}`);
  console.log(`  url:  ${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/blog/${data.slug}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
