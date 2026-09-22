# Blog drafts

One Markdown file per post, frontmatter on top (`title`, `slug`, `excerpt`), body in the subset `src/components/Markdown.jsx` renders: headings, bold/italic, links, lists, and standalone image lines.

Images go in the public `comic-covers` bucket under `blog/<slug>/` (screenshots: 1600px wide JPEG, ~250KB).

Publish:

    node scripts/publishBlogPost.js content/blog/<slug>.md            # dry run
    node scripts/publishBlogPost.js content/blog/<slug>.md --apply    # insert
    node scripts/publishBlogPost.js content/blog/<slug>.md --apply --update   # overwrite by slug

Voice: the founder's. A little sarcastic, good natured, funny, a fan who knows things. First person. No em dashes. The February 2026 posts are the reference. Reader-facing posts (how to use the site, how to get into comics, what it costs to complete a run) over build updates.

The file is the review step: it lands in git, the founder reads it, then publishes.
