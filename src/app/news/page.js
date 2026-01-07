"use client";

export default function NewsPage() {
  const updates = [
    {
      title: "Welcome to ComixCatalog (Beta)",
      date: "January 2026",
      body: `BETA IS NOW LIVE! Guys, I can't tell you how excited I am to share this first step with you. And let me be clear: that is exactly what this is — only a first step. This will not be the most robust website you have encountered, but the first and most important features are here: searching issues, viewing detailed pages, and organizing your Collection and Wishlist. Over the coming weeks and months, I will be expanding data coverage, improving performance, and adding new features based on your feedback.

      Some things to note as you get started:
      - This is a beta, so expect bugs and rough edges. Please report any issues you encounter to help shape the platform.
      - The database is user-powered for now. If you notice missing issues or variants, please consider adding them!
      - Your collections and wishlists are private by default. No one else can see what you own or want.
      - Future features will include pricing tools, verified cataloging, and a marketplace for buying and selling.

      Our next steps are a few quality of life improvements after spending the past several months with nose to the grindstone working through what this first iteration would look like. Lots of days and weeks banging my head against the wall, so I'm looking to take a few days of mental R&R and knock out some of the easier stuff for the site. However, be aware that imminent changes include:

      - Improved mobile responsiveness
      - User Profiles and public collections/wishlists
      - Community features (comments, reviews, ratings, messaging)
      - Additional data fields on issue detail pages
      - Better error handling and loading states
      - Patreon perk implementation (profile badges, early access, etc.)
      - Potential for AI and Comic Book image recognition down the line

      ***All of this before we institute the marketplace and truly give all of you the complete online comic collecting and purchasing experience you deserve.***

      Thank you all for even the small modicum of interest we've managed to generate at this point - if you'd like to support further and still be part of the founding collectors guild, perhaps you will consider donating to our Patreon (https://www.patreon.com/comixcatalog)to assist in development costs.
      I'm incredibly excited to see where we can take this together. Happy New Year to all of you and thanks again for joining the party. 
      Excelsior!
      - Anthony
      Founder, ComixCatalog
      
      `,
    },
    {
      title: "Welcome to ComixCatalog (Beta)",
      date: "December 2025",
      body: `
ComixCatalog is an early beta focused on one core idea: giving comic collectors a clean, trustworthy way to track what they own and what they want.

Right now, you can search issues, view detailed pages, and organize your Collection and Wishlist. This beta is intentionally narrow — the goal is to get the foundation right before expanding into pricing tools, larger datasets, and marketplace features.

If you’re using ComixCatalog at this stage, you’re helping shape what it becomes. Feedback, bug reports, and feature ideas are not just welcome — they’re essential.
      `,
    },
    {
      title: "ComixCatalog Origin Update #1",
      date: "November 2025",
      body: `
ComixCatalog began as a personal solution for collectors who were tired of vague listings, missing covers, and incomplete databases across existing platforms.

Over the past month, the focus has been on rebuilding the front-end, establishing a clear collection vs wishlist model, and laying the groundwork for verified cataloging. Next up: expanding data coverage and preparing a small Founding Collectors test group.
      `,
    },
  ];

  return (
    <section className="comic-panel news-page">
      <div className="section-label badge-x">News & Updates</div>
      <h1 className="hero-title mb-6">ComixCatalog Developer Updates</h1>

      {updates.map((post, i) => (
        <article key={i} className="news-post mb-10">
          <h2>{post.title}</h2>

          <p className="news-post-date">{post.date}</p>

          <p className="news-post-body whitespace-pre-line">{post.body.trim()}</p>
        </article>
      ))}
    </section>
  );
}
