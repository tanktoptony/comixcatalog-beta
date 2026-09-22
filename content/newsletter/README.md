# Newsletter issues

One Markdown file per issue: frontmatter (`subject`, `preheader`) then the body in the same subset the blog renders. Voice: the founder's, first person, short. One email every few weeks, not more.

    node scripts/sendNewsletter.js content/newsletter/<issue>.md                   # dry run + writes .preview.html
    node scripts/sendNewsletter.js content/newsletter/<issue>.md --test=you@x.com  # one real email to you
    node scripts/sendNewsletter.js content/newsletter/<issue>.md --apply           # the list

Or run the "Newsletter send" workflow in GitHub Actions with the file path. Sends are recorded in `.sent.json`; an issue cannot go out twice unless you remove it there.

Every email carries a signed one-click unsubscribe (footer link + List-Unsubscribe headers). Never send to anyone with `unsubscribed_at` set; the script enforces this, do not bypass it.

Before the first real send: verify `comixcatalog.com` as a sending domain in Resend (Domains, add the DNS records), put `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in GitHub repo secrets and Vercel, then `--test` yourself and read it on a phone.
