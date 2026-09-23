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
    id: "which-number-one",
    kicker: "Real talk",
    headline: "Spider-Man has been restarted more times than my router.",
    subtext: "1963. 1999. 2014. 2018. 2022. All of them are issue #1. Only one is worth a house.",
    captionBody: "Try buying \"Amazing Spider-Man #1\" without saying which one. 1963? 1999? 2014? 2018? 2022? They are all issue number one, they are not remotely the same book, and the price difference between them is a car. This is the single most annoying thing about collecting a long-running title, and it is the first problem I built ComixCatalog to solve: search a series and you get the runs, grouped, with the start year on each one. Then you click the right one.",
  },
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

// Openers by post type. The bot picks by day index so consecutive days
// differ. Each should stand alone as the first line of a caption.
export const COVER_INTROS = [
  "Cover of the day.",
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

// ── Cover Spotlight notes ──────────────────────────────────────────────
//
// Cover Spotlight used to be an intro line, the title, and a CTA. Nothing
// about the book. That is the bland template the founder rejected for key
// issues, and it survived here because only the key-issue type ever got a
// blurb. Since the spotlight now runs twice a week instead of once, it
// needed something to say.
//
// Keyed by series title. Written about the RUN, not a specific issue, so a
// note stays true whichever cover from that series comes up.
export const SERIES_SPOTLIGHT_NOTES = {
  "Batman": "Detective Comics gave him a home. This book gave him a life. Eighty-odd years of one guy refusing to process anything.",
  "Detective Comics": "The book DC is named after, still running. Issue 27 is the one you cannot afford. The rest are the fun part.",
  "Action Comics": "Where the whole genre starts. Every cape that came after is downstream of a strongman lifting a car on a newsstand in 1938.",
  "The Amazing Spider-Man": "The longest argument in comics about whether a guy in his twenties can catch a break. Answer: no, and that is why it works.",
  "X-Men": "Started as five kids in a mansion, got cancelled, came back, and ate the entire 90s. My gateway book, so I am not objective about it.",
  "House of X": "Hickman walks in and reorganizes sixty years of mutant continuity in twelve issues without breaking any of it. Ridiculous flex.",
  "Powers of X": "The other half of the trick. Read them interleaved, the way the reading order says, or you are only getting half the book.",
  "Immortal X-Men": "The Quiet Council arc. Politics, betrayal, and Mister Sinister enjoying himself far too much.",
  "Immortal Hulk": "A horror book wearing a superhero book's jacket. Ewing and Bennett made the Hulk genuinely frightening again, which nobody had managed in decades.",
  "Daredevil": "The best-written Marvel character by a distance, because everything that happens to Matt Murdock is his own fault and the book knows it.",
  "Moon Knight": "A guy with more personalities than the book has issues, and somehow the most coherent character Marvel has.",
  "Black Panther": "Wakanda as a real place with real politics, not a backdrop. The Coates run reads like a political novel that happens to have a guy in a cat suit.",
  "Fantastic Four": "Marvel's first family and Marvel's first anything. A superhero book about people who bicker. Nobody had done that before 1961.",
  "Avengers": "A team that formed by accident because Loki tried to frame the Hulk. Still the best origin in comics precisely because nobody planned it.",
  "Captain America": "Punched Hitler on the cover nine months before the US entered the war. Everything since has been the character arguing with America about what he meant.",
  "Thor": "Debuted quietly in a horror anthology, because that is how Marvel launched characters in 1962. Ended up carrying the cosmic side of the whole line.",
  "Iron Man": "Stan Lee's stated goal was making readers root for a rich arms dealer. Sixty years later it somehow still works.",
  "Wolverine": "Short, angry, Canadian, and the best character in the Marvel Universe. I will not be taking questions.",
  "Deadpool": "Named after a Teen Titans villain, which is the single funniest fact in comics and nobody at Marvel will admit it.",
  "Punisher": "Introduced as a one-off Spider-Man villain and immediately refused to leave. A franchise that started as a guest star.",
  "Venom": "Started as a suit Spider-Man picked up on another planet and brought home. Everything after that is Marvel finding out what they had.",
  "Superman": "The hardest character to write well, because a guy who can do anything has to choose not to, every single issue.",
  "The Flash": "The book that restarted the Silver Age. A lab accident, a costume that finally looked like it could move, and comics changed.",
  "Green Lantern": "A space cop with a ring powered by willpower. The O'Neil and Adams run asked him why he helps aliens but not Black Americans, and comics grew up a little.",
  "Wonder Woman": "Created by a man who also invented the lie detector, which explains more about the lasso than most people expect.",
  "Justice League": "The book where DC's whole roster has to be in a room together and get along. It rarely goes well, which is the point.",
  "Aquaman": "Spent forty years as the punchline and the last twenty quietly being one of DC's best-designed characters. The jokes have not caught up.",
  "Nightwing": "The rare sidekick who grew up, moved out, and got better than the man who raised him. Bludhaven is worse than Gotham and he stayed anyway.",
  "Catwoman": "First appeared in Batman #1, same issue as the Joker. One of them got the movies. She got the better book.",
  "Harley Quinn": "Invented for a cartoon in 1992 and reverse-engineered into the comics because she was too good to leave on TV.",
  "Saga": "The best-looking ongoing in comics and the one I hand people who say they do not read comics. Fiona Staples draws faces better than anyone working.",
  "The Walking Dead": "193 issues, one ending, no relaunches, no variant-cover gimmicks. Kirkman said he would finish it and he finished it.",
  "Invincible": "Starts as a cheerful teen superhero book. Then issue 7 happens. You will remember where you were sitting.",
  "Spawn": "The best-selling independent comic ever made, still running, still McFarlane. Say what you like about the plot, the capes look incredible.",
  "Watchmen": "Twelve issues, no sequel needed, and every page is built like a machine. Read it once for the story and again for the layouts.",
  "Sandman": "Gaiman writing a horror anthology disguised as a fantasy epic disguised as a book about stories. The one that made people take the medium seriously.",
  "Y: The Last Man": "Sixty issues about the last man alive, and it is really about his sister, his mother, and everyone who has to live in what is left.",
  "Preacher": "Ennis and Dillon at their most unhinged. It is very funny, it is very mean, and it does not care whether you are comfortable.",
  "Monstress": "Sana Takeda's art belongs in a gallery. That it comes out monthly at newsstand pricing is faintly absurd.",
  "Ice Cream Man": "An anthology where every issue is a different flavour of wrong. No continuity to catch up on. Start anywhere, regret it immediately.",
  "Teenage Mutant Ninja Turtles": "Started as a black-and-white parody of Daredevil that got completely out of hand. The 1984 first printing is one of the great indie grails.",
  "Something Is Killing the Children": "Tynion doing horror properly. The monsters are real, the adults knew, and a teenager with two swords is the only functioning adult in the book.",
  "The Department of Truth": "Every conspiracy theory becomes true if enough people believe it. Simmonds draws it like a collage having a breakdown.",
  "Absolute Batman": "A Batman with no money and no Alfred, which turns out to be the most interesting question anyone has asked about him in years.",
  "Ultimate Spider-Man": "Hickman's version, where Peter is already married with kids and only now becoming Spider-Man. The best relaunch premise in years.",
  "Star Wars: Darth Vader": "The books where Vader is the protagonist are better than they have any right to be, because he cannot be redeemed and everyone involved knows it.",
  "Stranger Things": "Licensed tie-ins are usually filler. These fill the gaps between seasons and are genuinely worth owning.",
  "Sonic the Hedgehog": "The longest-running licensed video game comic ever made, and the fanbase will tell you so at length, correctly.",
  "Absolute Wonder Woman": "Raised in Hell instead of Themyscira. The Absolute line keeps asking what happens if you take away the one thing that made the character easy, and this is the best answer so far.",
  "Absolute Superman": "No Krypton, no Kents, no Metropolis. A Superman who has to earn the S, which is a harder and much better book than it sounds.",
  "Absolute Martian Manhunter": "The strangest book on the stands right now, and I mean that as a compliment. Deniz Camp and Javier Rodriguez are doing things with page layout that should not work.",
  "Absolute Green Lantern": "Al Ewing writing horror-flavoured Green Lantern. The ring is not a gift here and you can feel it on every page.",
  "Absolute Flash": "Speed as a curse rather than a gift. Every Absolute book takes the character's best day away from them and this one takes the running.",
  "Ultimate X-Men": "Peach Momoko writing and drawing a mutant book set in Japan that looks like nothing else Marvel publishes. Worth it for the art alone.",
  "Ultimate Black Panther": "Wakanda against Khonshu and Ra instead of the usual. The new Ultimate line's whole trick is asking what the character fights when the familiar villains are gone.",
  "Ultimate Wolverine": "Logan as a Winter Soldier figure in the Eurasian Republic. The most interesting thing anyone has done with him in years.",
  "Ultimates": "Hickman's version, where the team is a resistance movement against a world already lost. Reads more like a heist book than a superhero one.",
  "Ultimate Invasion": "The four issues the entire new Ultimate line is built on. Start here or nothing else makes sense.",
  "Spider-Boy": "A sidekick everyone forgot because of a magic deal, which is either a great hook or the most Spider-Man sentence ever written. Both, probably.",
  "TVA": "The Time Variance Authority doing paperwork across the multiverse. Funnier than it has any business being.",
  "One World Under Doom": "Doom finally gets what he always said he wanted, which is the only interesting thing you can do with a villain who is always right.",
  "Star Wars": "Marvel has published Star Wars in three separate eras now. The 1977 run is the collectible one, the current run is the readable one.",
  "The Nice House on the Lake": "The world ends in issue one and then it gets worse. Tynion and Bueno built a horror book where the scariest thing is the group chat.",
  "Spider-Man": "The title that is not Amazing, which is a sentence only comics could produce. Usually where Marvel parks its best artists.",
  "Robin": "There have been five of them and the fandom will fight you about the order. Damian is the one currently making it interesting.",
  "Birds of Prey": "Oracle running a team from a chair, which was the most quietly progressive thing in 90s superhero comics and nobody made a fuss about it.",
  "Poison Ivy": "Took a Batman villain, gave her a solo book and an actual argument, and it turned out she was right about most of it.",
  "House of Slaughter": "The Something Is Killing the Children spin-off that earned its own shelf. The masks alone are worth the cover price.",
  "Geiger": "Geoff Johns doing post-apocalyptic westerns with Gary Frank on art. Nuclear-powered man, glowing dogs, no notes needed.",
  "Radiant Black": "A guy in his thirties with student debt gets sentai powers. The money problems do not go away, which is the whole point.",
  "Killadelphia": "Vampires in Philadelphia, and the head vampire is a founding father. Rodney Barnes is not being subtle and it works.",
  "Local Man": "A washed-up 90s superhero moves back to his small hometown. Two art styles, two timelines, one very good book about failing.",
  "We Live": "A kids-and-monsters apocalypse that is far sadder than the cover art prepares you for. Bring tissues.",
  "Stray Dogs": "Don Bluth-looking talking animals in a serial killer story. The tonal whiplash is deliberate and it is devastating.",
  "Vanish": "Cullen Bunn and Ryan Stegman doing an extremely angry book about what happens to the chosen one after the chosen-one story ends.",
  "Once & Future": "Arthurian legend as a weapon of British nationalism, fought off by a retired monster hunter and her grandson. Gillen having a lot of fun.",
  "Power Rangers": "BOOM turned a toy commercial into a genuinely good space opera, which nobody saw coming.",
  "Mighty Morphin Power Rangers": "The long-running half of BOOM's Rangers line. Shattered Grid is the arc people mean when they say these books got good.",
};

// Fallback for a series with no hand-written note. Says something specific
// and TRUE from the catalog's own data — run length, era, publisher — rather
// than reaching for another generic line. A spotlight that cannot say
// anything real about the book should at least say a real number.
export function spotlightNote({ title, issueCount, yearStart, yearEnd, publisher } = {}) {
  const hand = SERIES_SPOTLIGHT_NOTES[String(title ?? "").trim()];
  if (hand) return hand;

  const count = Number(issueCount);
  const start = Number(yearStart);
  const end = Number(yearEnd) || start;
  const span = Number.isFinite(start) && Number.isFinite(end) && end > start ? `${start} to ${end}` : null;
  const pub = publisher ? String(publisher).replace(/\s+Comics$/i, "") : null;

  if (Number.isFinite(count) && count >= 100) {
    return span
      ? `${count} issues, ${span}. Runs like this are why a wantlist beats a memory.`
      : `${count} issues deep. Runs like this are why a wantlist beats a memory.`;
  }
  if (Number.isFinite(count) && count > 1 && count <= 12) {
    return span
      ? `${count} issues, ${span}, done. A complete run you can actually finish.`
      : `${count} issues, start to finish. A complete run you can actually finish.`;
  }
  if (span && pub) return `${pub}, ${span}. Worth owning for the cover alone.`;
  if (Number.isFinite(start)) return `${start}. Worth owning for the cover alone.`;
  return null;
}
