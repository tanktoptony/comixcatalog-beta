// Everything the Instagram bot says, in Anthony's voice. Edit this file, not
// the bot, when a post reads wrong.
//
// House rules for anything here: sounds like a person who has collected
// since he was a kid, knows things, and wears it lightly. A little
// sarcastic, good natured, funny. First person is fine. No hype-bro, no
// museum voice, no corporate. Never "the database is the moat" on a public
// post. Short: Instagram truncates captions after ~125 characters until
// someone taps "more", so the first line has to earn the tap.
//
// Sections:
//   KEY_ISSUE_BLURBS  one blurb per row in the key_issues table, keyed
//                     "title|issue". The bot posts the cover with this. If a
//                     key issue has no blurb it falls back to the plain
//                     reason from the table.
//   PERSONAL_POSTS    brand-card posts about the person and the site. Each
//                     posts once (ledgered by id).
//   COVER_INTROS      openers for the Cover Spotlight type.
//   NEW_INTROS        openers for New to the Catalog.
//   VALUE_INTROS      openers for the comps-backed value post.
//   CTAS              closers. Rotated by day so the feed doesn't repeat.

export const KEY_ISSUE_BLURBS = {
  "Action Comics|1": "The one that started the whole genre. A guy in a cape lifting a car, and 88 years later we are all still here arguing about grades. Fewer than 100 copies are thought to exist. You do not own one. Neither do I.",
  "Detective Comics|27": "First Batman. Six pages. He throws a guy into a vat of acid and the cops are basically fine with it. Simpler times.",
  "Batman|1": "First Joker AND first Catwoman in the same book, which is the comics equivalent of a rookie card that also happens to be a rookie card. Also, Joker was supposed to die in this issue. An editor said no. Good call.",
  "Captain America Comics|1": "Cap punches Hitler on the cover, nine months before the US entered the war. Simon and Kirby got actual threats over it. Still the best cover of the 1940s and it is not close.",
  "Showcase|4": "The Silver Age starts here. Barry Allen, a lab accident, and a costume that finally looked like it could move. Everything Marvel did in the 60s is downstream of this book.",
  "Showcase|22": "Hal Jordan. Test pilot, no fear, gets a ring from a dying alien. Green Lantern went from a magic lantern guy to space cop in one issue, and comics got a lot more sci-fi because of it.",
  "Fantastic Four|1": "Marvel's first family, and honestly Marvel's first anything. Lee and Kirby doing a superhero book about people who bicker. Nobody had done that. Everybody does it now.",
  "Journey into Mystery|83": "Thor shows up in a horror anthology, because that is how Marvel launched characters in 1962: quietly, in someone else's book, hoping nobody minded. They did not mind.",
  "Amazing Fantasy|15": "The book. Spider-Man's first appearance, in the last issue of a series that was being cancelled. The best character Marvel ever made debuted in a cancellation.",
  "The Incredible Hulk|1": "He was grey in this issue. The printer could not hold the grey consistently, so Marvel switched him to green with #2 and never looked back. The first appearance of the Hulk is also the first appearance of a printing problem.",
  "Tales of Suspense|39": "Iron Man, in a gold-ish grey suit that looks like a boiler. Stan Lee said he wanted to make readers like a rich arms dealer on purpose, as a challenge. It worked, apparently, for sixty years.",
  "The Avengers|1": "Loki tricks the Hulk, everybody shows up to fight him, and they decide to keep meeting. That is the whole origin. The greatest team in comics formed basically by accident.",
  "The X-Men|1": "Where it started for a lot of us, me included. Five kids, a bald guy in a wheelchair, and Magneto in issue one. The book that got cancelled, came back, and ate the 90s.",
  "Tales of Suspense|57": "Hawkeye's first appearance, and he is a villain. A carnival archer who falls for Black Widow and makes some bad choices. Relatable.",
  "Daredevil|1": "Blind lawyer, yellow costume (yes, yellow), and a Bill Everett cover. The red suit is #7. The yellow one is the one that costs money.",
  "Tales of Suspense|52": "Black Widow's first appearance. Soviet spy, evening gown, no superpowers, out-thinks Iron Man. Fifty-something years before the movie, she was already the smartest person in the room.",
  "Fantastic Four|48": "Silver Surfer and Galactus in one issue. Kirby drew a herald of a planet-eater on a surfboard and everyone just went with it, because Kirby.",
  "Fantastic Four|52": "First Black Panther. King of a hidden, hyper-advanced African nation, and he beats the Fantastic Four in his debut to see if they are worth his time. 1966. Way ahead of everybody.",
  "Detective Comics|359": "Barbara Gordon becomes Batgirl. Created partly because the TV show wanted a female character, and she turned out to be one of the best things DC ever made. Sometimes the studio note is right.",
  "Green Lantern|76": "O'Neil and Adams start the Hard-Traveling Heroes run. Green Lantern gets asked why he helps aliens but not Black Americans and has no answer. Comics grew up a little in this issue.",
  "Batman|232": "First Ra's al Ghul. Immortal eco-terrorist with a daughter who is into Batman. Batman fights him shirtless in the desert. Neal Adams drew it. Peak.",
  "The Amazing Spider-Man|101": "First Morbius. Spidey has six arms in this one, which is a thing that happened and Marvel would like you to forget. The living vampire stuck around anyway.",
  "Marvel Spotlight|5": "Johnny Blaze sells his soul to save his stepdad and gets a flaming skull for his trouble. Ghost Rider's first appearance. Also a stunt cyclist, because it was 1972 and Evel Knievel was on TV every weekend.",
  "The Amazing Spider-Man|122": "The Green Goblin dies, one issue after Gwen. Norman gets impaled on his own glider. He got better, obviously, but at the time this was the end of the Bronze Age's first real villain.",
  "The Amazing Spider-Man|121": "Gwen Stacy dies and Spider-Man might have been the one who killed her. The snap sound effect is still argued about. This is the issue where superhero comics learned that things could stay broken.",
  "The Incredible Hulk|181": "Wolverine's first full appearance. He is a Canadian government agent sent to stop the Hulk, he is short, he is angry, and he has been the best character in the Marvel Universe ever since. Fight me.",
  "Marvel Premiere|15": "First Iron Fist. Kung fu was huge, so Marvel made a rich kid who punches like a dragon. Somehow it has aged better than most of what else was huge in 1974.",
  "The Amazing Spider-Man|129": "First Punisher, and he is trying to kill Spider-Man. A one-off villain who turned into a franchise. Also has one of the best Gil Kane covers of the decade.",
  "Giant-Size X-Men|1": "The relaunch. Wolverine, Storm, Nightcrawler, Colossus, Thunderbird on the same team for the first time. If X-Men was your gateway, this is the book that built the door.",
  "Ms. Marvel|1": "Carol Danvers gets her own book. It took Marvel a while to figure out what to do with her, but the first appearance is the first appearance. Now she is on lunchboxes.",
  "The X-Men|137": "The end of the Dark Phoenix Saga. Jean dies on the moon. Claremont and Byrne at the absolute top of their game, and the editor made them kill her because she had destroyed a planet. Fair.",
  "The New Teen Titans|2": "First Deathstroke. Wolfman and Perez made a mercenary so good he crossed over into every corner of DC and eventually into everybody's living room. Yes, that is where Deadpool's name comes from.",
  "The Amazing Spider-Man|252": "The black suit, first time in the main title. It came back from Secret Wars, it looked incredible, and it turned out to be alive. We would find out how bad that was in about four years.",
  "Crisis on Infinite Earths|8": "Barry Allen dies saving the multiverse and stays dead for 23 years, which in comics is basically forever. The Flash running himself to death is still one of the great Perez pages.",
  "Crisis on Infinite Earths|7": "Supergirl dies. The Perez cover of Superman holding her is on the short list of most imitated covers ever. DC meant it, too. She was gone for decades.",
  "The Amazing Spider-Man|300": "First full Venom. Todd McFarlane's Spider-Man, a 25th anniversary issue, and the debut of the villain every 90s kid drew on their notebook. I was one of those kids.",
  "Batman|428": "A Death in the Family. Readers called a 900 number and voted to let the Joker kill Robin. By a margin of 72 votes. Democracy is a strange thing.",
  "The Uncanny X-Men|266": "First full Gambit. Trench coat, playing cards, an accent Claremont typed phonetically. The 90s X-Men were a lot, and Gambit was the most.",
  "The New Mutants|98": "First Deadpool. Rob Liefeld drew a mercenary with a mouth and Fabian Nicieza wrote the mouth. Nobody involved expected a movie franchise. Nobody involved expected anything.",
  "The Amazing Spider-Man|361": "First full Carnage. Venom but worse, in every sense, drawn by Bagley. Red symbiote, serial killer host, and the reason a lot of us learned the word 'symbiote' at age ten.",
  "Spawn|1": "Image Comics launches with the biggest-selling independent comic in history, 1.7 million copies. McFarlane left Marvel, took his fans with him, and built a cape out of nightmares. Still weird. Still great.",
  "The Batman Adventures|12": "First comic-book Harley Quinn. She was invented for the animated series, and this is where she crossed into comics. If Batman: The Animated Series flipped your switch as a kid, this is your grail. It is mine.",
  "Superman|75": "The Death of Superman. Black polybag, black armband, news coverage on every channel. Everyone bought ten. Everyone kept them sealed. That is why they are not worth what you think.",
  "The Walking Dead|1": "A zombie book in 2003, black and white, that nobody expected to last past issue 6. It ran 193 issues and changed television. The first issue had a print run of around 7,000. Good luck.",
};

// Brand-card posts about the person behind the site. Each has a stable id
// for the ledger, card text (kicker/headline/subtext, short) and the caption
// body. Add to the end; the bot posts them in order, one per Brand slot.
export const PERSONAL_POSTS = [
  {
    id: "origin-xmen-btas",
    kicker: "Origin story",
    headline: "It was the cartoons.",
    subtext: "X-Men. Batman: The Animated Series. A preteen with a Saturday morning and no self-control.",
    captionBody: "People ask why a grown man built a comic database in his spare time. The honest answer is the 90s X-Men cartoon and Batman: The Animated Series got to me at exactly the wrong age and I never recovered. Everything since has been trying to keep track of what I own. This is the version that finally works.",
  },
  {
    id: "graham-crackers-house-of-m",
    kicker: "Getting back in",
    headline: "I asked the guy at the counter.",
    subtext: "Graham Crackers Comics, Chicago. 'Where do I even start?' He said House of M.",
    captionBody: "Getting back into comics as an adult is weirdly hard. Twenty years of continuity, nine Spider-Man titles, and everyone online has an opinion. I walked into Graham Crackers Comics and asked the guy at the counter where to start. He handed me House of M. I loved it. That conversation is half the reason this site exists: someone should be able to get that answer without needing a guy at a counter. (Still go to the counter, though. Support your shop.)",
  },
  {
    id: "wantlist-is-the-point",
    kicker: "Real talk",
    headline: "The wantlist is the whole point.",
    subtext: "What you own is a spreadsheet. What you are missing is a hunt.",
    captionBody: "Every collection app shows you what you own. Fine. I care about the other list. The three issues between me and a complete run. The one book I keep almost buying. ComixCatalog tracks the gaps, not just the shelf, because the gaps are where the fun is.",
  },
  {
    id: "no-marketplace-hype",
    kicker: "Honest update",
    headline: "The marketplace isn't live yet.",
    subtext: "We say so on the page. You will not find a 'coming soon' that is actually 'never.'",
    captionBody: "Some sites tell you a feature is 'coming soon' for three years. Ours says the marketplace is in development because it is in development. When you can buy and sell here, I will say so, loudly. Until then: catalog, collect, and find out what your books are actually worth.",
  },
  {
    id: "covers-obsession",
    kicker: "Behind the scenes",
    headline: "121,000 covers and counting.",
    subtext: "Every one linked to the exact issue. When one is wrong, I hear about it. Then I fix it.",
    captionBody: "There are over 121,000 cover scans in the catalog now, every one tied to a specific issue and printing. Getting the wrong cover on a book is the fastest way to lose a collector's trust, so when it happens (it happens), it gets fixed. If you spot one, tell me. Seriously. It makes the site better for the next person.",
  },
  {
    id: "founding-collectors",
    kicker: "Founding Collectors",
    headline: "Free Pro for life. For now.",
    subtext: "The first hundred collectors get Pro permanently. No card. No catch. Spots are going.",
    captionBody: "If you sign up while Founding Collector spots are open, you get Collector Pro for life, free, no card. That is market values, grades and cert numbers, and an insurance-ready PDF of your whole collection. I would rather have a hundred people who were here early than a thousand who paid. Link in bio.",
  },
  {
    id: "solo-built",
    kicker: "Who makes this",
    headline: "One guy. Nights and weekends.",
    subtext: "No VC. No ad network. Built by a collector who got tired of spreadsheets.",
    captionBody: "ComixCatalog is built by one person, around a day job, because the tool I wanted did not exist. That means it moves fast in weird directions and occasionally something breaks on a Tuesday. It also means when you send feedback, the person reading it is the person who can fix it. Usually that night.",
  },
];

// Direct sign-up asks. These recur (round-robin by day) rather than
// posting once, because "please make an account" is a message you have to
// say more than once. Brand-card format. Keep them short and a little
// cheeky; the founder's brief was, verbatim, "tell people to sign the fuck
// up." Instagram's reach filters do not love actual profanity in captions,
// so the energy is here and the word is not. Add it back if you want it.
export const SIGNUP_POSTS = [
  {
    id: "signup-just-do-it",
    kicker: "A polite request",
    headline: "Sign up. It is free.",
    subtext: "No card. No trial that turns into a charge. Just make the account and start clicking the comics you own.",
    captionBody: "I do not do a lot of asks on here, so here is one. Make an account. It is free, there is no card, and the first thing you will do is search a series you love and start clicking the issues you own. It takes about ninety seconds to feel like a real collector with a real collection. Link in bio.",
  },
  {
    id: "signup-spreadsheet",
    kicker: "Real talk",
    headline: "Your spreadsheet is lying to you.",
    subtext: "It has no covers, no values, no wantlist, and you have not updated it since 2023. Come on.",
    captionBody: "You have a spreadsheet. I had a spreadsheet. It had no covers, no idea what anything was worth, and a tab called 'want' I never opened. ComixCatalog is the spreadsheet with everything filled in for you. Free account, link in bio. Bring the spreadsheet, there is a CSV import.",
  },
  {
    id: "signup-founding",
    kicker: "Clock is running",
    headline: "Free Pro for life. Still open.",
    subtext: "Founding Collector spots are limited. When they are gone, Pro costs money like everything else.",
    captionBody: "Founding Collector spots are still open, which means a new account right now gets Collector Pro permanently, free. Market values, grades and certs, the insurance PDF, all of it. When the spots are gone this offer is gone and I will not bring it back. Link in bio. Go.",
  },
  {
    id: "signup-wantlist",
    kicker: "Do this before your next con",
    headline: "Make the wantlist.",
    subtext: "Walk in knowing exactly which issues you need. Walk out without buying #14 for the third time.",
    captionBody: "The single most useful thing on the site is the wantlist, and you cannot use it without an account. Make one. Add the ten books you are hunting. Next time you are at a shop or a con you will pull out your phone instead of guessing, and you will not buy #14 for the third time. Free. Link in bio.",
  },
  {
    id: "signup-profile",
    kicker: "Show off",
    headline: "Your collection deserves a page.",
    subtext: "comixcatalog.com/u/yourname. Covers, stats, wantlist. Send it to the friend who does not believe you.",
    captionBody: "Every account gets a public page: your covers, your stats, your wantlist, at comixcatalog.com/u/yourname. It is the link you send to the friend who does not believe you own that book. Make the account, add the books, send the link. Link in bio to start.",
  },
];

// Openers by post type. The bot picks by day index so consecutive days
// differ. Each should stand alone as the first line of a caption.
export const COVER_INTROS = [
  "Cover of the day. No notes.",
  "Look at this one.",
  "I would frame this.",
  "Pulled this from the catalog and had to stop.",
  "The kind of cover that sells the issue before you read a word.",
  "Not a key. Just a great cover. Those count too.",
];

export const NEW_INTROS = [
  "New in the catalog this week.",
  "Just added. Every issue, every printing, linked to the right cover.",
  "Fresh in the database.",
  "New series page went live. Go poke at it.",
];

export const VALUE_INTROS = [
  "What is it actually worth? Recent sold prices, not asking prices:",
  "Checked the comps on this one.",
  "Real sales, real number:",
  "Not a guess. Recent sales, median:",
];

export const CTAS = [
  "Full run, printings, and values on ComixCatalog. Link in bio.",
  "Track yours on ComixCatalog. Link in bio.",
  "Own it? Log it. ComixCatalog, link in bio.",
  "Chasing the run? ComixCatalog shows you what you are missing. Link in bio.",
  "Catalog it, grade it, know what it is worth. Link in bio.",
];

export function pickByDay(list, dayIndex = Math.floor(Date.now() / 86400000), offset = 0) {
  if (!list.length) return null;
  return list[(((dayIndex + offset) % list.length) + list.length) % list.length];
}

export function keyIssueBlurb(title, issueNumber) {
  return KEY_ISSUE_BLURBS[`${String(title).trim()}|${String(issueNumber).trim()}`] ?? null;
}
