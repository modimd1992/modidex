# ModiDex

**A free daily athlete-guessing game by JediModi Sports Network.** Play at **https://playmodidex.com**

Every day there's a mystery athlete for each sport, shown as a creature-style scouting card with a type, six base stats and a field-guide bio. You get 6 guesses to name the athlete. After the puzzle ends, the card shows the athlete's **Gen 1 comp**: the creature from the original 151 that they play like.

- Modes: **All Sports**, **NFL**, **NBA**, **MLB** (NHL is built but turned off, see below)
- Same puzzles for everyone each day, with a new set at midnight Eastern Time (set `timeZone` in `js/config.js`)
- Wordle-style feedback on conference, team, position, age, jersey number and type
- No bonus clues: just the card and your guess feedback (clues can be turned back on in `js/config.js`)
- Spoiler-free emoji share grid, plus streaks and stats per mode saved in the browser
- Static site: no build step, no backend, no accounts

### Catching and the Dex

Each puzzle is a wild encounter with the creature on the card. Solve it to throw a ball. The faster you solve, the better the ball:

| Solved on | Ball | Catch chance |
|---|---|---|
| Guess 1 | 🏆 Hall of Fame Ball | 100% |
| Guess 2 | ⭐ All-Star Ball | 75% |
| Guess 3 | 🎖️ Pro Ball | 50% |
| Guess 4–5 | 🔰 Rookie Ball | 30% |
| Guess 6 | none: registered as 👁 Seen | — |
| Not solved | it flees | — |

- If it breaks free, it's still registered as Seen. Each throw is rolled once and saved, so refreshing doesn't re-roll.
- **Each sport has its own Dex of 151.** Every sport has exactly 151 athletes, one for each original creature, so an NFL-only fan can complete the NFL Dex. All Sports catches count toward that athlete's sport. `node tools/validate.mjs` warns if a sport is missing a creature or doesn't have exactly 151 athletes. The Dex also has a **Total** tab: each creature counts once if caught in any sport, plus a grand total out of 453.
- **Badges** (`js/badges.js`, the 🎖️ Badges tab in the Dex): 12 collection badges (catch every creature in a set, like the Starter Trio or Legendary Birds, from any sport; gold when completed in every sport) and 15 play badges (first-guess solve, streaks, shinies, Clean Sweep, Perfect Week, Triple Crown, Dex milestones, leading a group's weekly board). Earned badges are saved in the Dex as `dex.badges` and published to the profile as `badges`, which friends see.
- **Partner** (`js/partner.js`): pick any caught creature as your partner. Every finished puzzle gives it XP (6 for a 1st-guess solve down to 1, and 1 for a loss; 4 XP per level). It evolves along its line at Lv 16/36 (3-stage lines) or Lv 25 (2-stage lines and Eevee). Saved as `dex.partner`, published to the profile as `partner`.
- **Trainer Card** (`js/trainercard.js`): a shareable 1080x1350 image with your username, partner, Dex counts, badges and best streak, drawn on a canvas. Open it from the Dex, the Partner window or Profile → Me.
- Ball names, icons and odds live in `CATCH` in `js/config.js`. They're original sports-themed names, not the trademarked ones.
- The Dex is saved in the player's browser, like stats. Clearing site data or switching phones starts a new Dex. Accounts would be needed to sync it.
- When adding athletes, run `node tools/validate.mjs`. It warns if any of the 151 creatures can't be caught.

**Rare encounters**
- **👑 Legendary** (Articuno, Zapdos, Moltres, Mewtwo, Mew): tougher to catch, at 🏆 100%, ⭐ 50%, 🎖️ 30% and 🔰 15%. Set `legendaryRate` in `CATCH`.
- **✨ Shiny**: about 1 in 25 puzzles (`CATCH.shinyOdds`), decided by the date so it's the same for every player. A shiny catch is marked ✨ in the Dex.
- The sport tabs show 👑 or ✨ while a rare puzzle is unplayed. `node tools/validate.mjs --upcoming 30` marks upcoming rare days.

**Evolution lines**
- Catching every member of a family (e.g. Charmander › Charmeleon › Charizard) earns a 🏅. There are 54 lines, defined in `FAMILIES` in `js/gen1.js`.
- The Dex has a 🏅 Lines view showing progress for each family.

---

## Run it on your computer

The game loads its data with `fetch`, so it needs a tiny local web server. Opening `index.html` by double-clicking won't work.

```bash
cd ~/Pokemon
python3 -m http.server 8080
```

Then open http://localhost:8080. Add `#nba`, `#nfl`, `#mlb` or `#all` to the URL to jump straight to a mode. These links work well in video descriptions.

---

## Files

```
index.html            page shell
css/styles.css        all styling (colors are variables at the top)
data/athletes.json    ← the athletes. Edit this.
data/schedule.json    optional: pin a specific athlete to a date
js/config.js          game name, launch date, sports, modes, clue schedule
js/types.js           the 18 types, their colors, icons and meaning
js/card.js            reusable athlete card (for future card features)
js/daily.js           picks each day's athlete (same for everyone)
js/compare.js         green / yellow / gray feedback rules
js/clues.js           bonus clue text
js/storage.js         streaks and saved games (browser localStorage)
js/share.js           emoji share text
js/main.js            screen logic
tools/validate.mjs    checks your data for mistakes
```

---

## Adding or editing athletes

Open `data/athletes.json` and copy an existing athlete block. Every field:

```json
{
  "id": "nba-stephen-curry",
  "name": "Stephen Curry",
  "aliases": ["Steph Curry", "Chef Curry"],
  "sport": "NBA",
  "league": "West",
  "division": "Pacific",
  "team": "Golden State Warriors",
  "teamAbbr": "GSW",
  "position": "PG",
  "number": 30,
  "birthDate": "1988-03-14",
  "type": "Water",
  "type2": null,
  "category": "Splash Cannon",
  "stats": { "hp": 100, "atk": 140, "def": 75, "skl": 150, "iq": 140, "spe": 105 },
  "bio": "It fires water cannons from far beyond the arc...",
  "comp": { "name": "Blastoise", "dex": 9, "why": "Long-range cannons that never stop firing." }
}
```

| Field | Notes |
|---|---|
| `id` | Unique, lowercase with dashes. Start it with the sport. |
| `aliases` | Optional nicknames the search box also matches. |
| `league` / `division` | MLB: `AL`/`NL` with `East`/`Central`/`West`. NFL: `AFC`/`NFC` with `East`/`North`/`South`/`West`. NBA: `East` (`Atlantic`, `Central`, `Southeast`) or `West` (`Northwest`, `Pacific`, `Southwest`). |
| `position` | NFL: QB RB FB WR TE OT OG C DE DT EDGE LB CB S K P. NBA: PG SG SF PF C G F. MLB: SP RP CP C 1B 2B 3B SS LF CF RF DH TWP (two-way). |
| `birthDate` | Use this instead of age. Age is calculated automatically, so it never goes stale. |
| `type`, `type2` | One of the 18 types in `js/types.js`. `type2` is optional. |
| `category` | The "___ Athlete" title on the card. |
| `stats` | Each from 1 to 150 (guide below). |
| `bio` | 1–2 sentences. **Don't use their name or team name**, or the puzzle gives itself away. |
| `comp` | A creature from the original 151 only (`dex` 1–151), plus a one-line reason. |

After editing, run the checker:

```bash
node tools/validate.mjs
```

It flags typos, invalid positions or divisions, duplicate IDs, out-of-range stats, bios that mention the athlete's name, and comps that are reused. To see upcoming answers (spoilers), run:

```bash
node tools/validate.mjs --upcoming 14
```

**How the rotation works:** each sport cycles through all its players before anyone repeats. All Sports avoids anyone who is a single-sport answer within 10 days, so nobody gets the same answer twice in a week. Pinned dates count toward the rotation.

**Heads up:** adding or removing athletes reshuffles the order of future puzzles. If players are mid-game when you deploy, today's puzzle may change for them. Deploy data changes late at night, or pin today's answer in `schedule.json` first.

### How the stats map

Stats are 1–150 ratings, set by hand from real performance. Roughly 140+ is elite, 100–120 is very good, and 60 or below is a weakness.

| Stat | NFL | NBA | MLB |
|---|---|---|---|
| HP | Durability, availability | Durability, minutes, motor | Durability, games / innings |
| ATK | Big plays: yards, TDs, sacks | Scoring volume and power | HR power, exit velo, pitch velocity |
| DEF | Defense, ball security, blocking | On-ball D, rim protection, boards | Fielding, or run prevention for pitchers |
| SKL | Accuracy, hands, routes, technique | Shooting touch, handle | Contact, or command for pitchers |
| IQ | Reads, vision, decisions | Playmaking, court vision | Plate discipline, or pitch mix |
| SPD | Speed and burst | Quickness, athleticism | Sprint speed, baserunning |

### Pin an athlete to a date (great for video tie-ins)

`data/schedule.json`:

```json
{
  "2026-12-25": { "nba": "nba-stephen-curry", "all": "mlb-shohei-ohtani" }
}
```

### Keeping rosters current

Each sport has 151 players (one per creature). They were chosen from each league's official jersey-sales rankings (NFLPA Top 50, NBA top-selling jerseys, MLB top-20 jerseys), then filled out with Pro Bowl / All-Star players, starters and notable rookies so every team has about 4–5 players.

**Unsigned (or likely unsigned) as of 2026-11-02, listed under their last team. Update these when they sign:**
- MLB: Tarik Skubal (LAD), Kiké Hernández (LAD), Aroldis Chapman (BOS), Gleyber Torres (DET), Jazz Chisholm Jr. (NYY), Shota Imanaga (CHC), Eugenio Suárez (CIN), Tomoyuki Sugano (COL), Bo Bichette (NYM), Kyle Freeland (COL)


The data is a snapshot (`dataAsOf` at the top of `athletes.json`). Trades and signings will make some entries wrong over time. Every so often, ask Claude Code to *"verify every athlete in data/athletes.json against current rosters and fix teams, numbers and divisions"*, then run the checker.

---

## Turning on profiles (sign-in + cloud saves)

Profiles let players sign in with Google or an emailed link so their Dex, stats and today's games sync across devices. The code is built in and switches on once you connect a free Firebase project:

1. Go to https://console.firebase.google.com and click **Create a project**. Name it `modidex`; Google Analytics can be off.
2. On the project home, click the **Web** icon (`</>`), name the app `ModiDex`, and skip Firebase Hosting. Copy the `firebaseConfig = { ... }` block it shows.
3. **Build → Authentication → Get started → Sign-in method**:
   - Enable **Google** (pick your support email).
   - Enable **Email/Password**, then turn on **Email link (passwordless sign-in)**.
4. **Authentication → Settings → Authorized domains → Add domain:** `playmodidex.com` and `www.playmodidex.com` (plus `modimd1992.github.io`)
5. **Build → Firestore Database → Create database** in production mode, location `nam5 (United States)`.
6. In Firestore, open the **Rules** tab, replace everything with the contents of [`firestore.rules`](firestore.rules), and click **Publish**.
7. Paste the config into [`js/firebase-config.js`](js/firebase-config.js) (`export const FIREBASE_CONFIG = { ... };`), run `node tools/bump-version.mjs`, then commit and push.

The config values are meant to be public, so it's fine that they're in the repo. The rules make sure each player can only read and write their own save. The free tier covers thousands of daily players. A player's save is one document, written once per finished puzzle.

## Friends and groups

Once signed in, players pick a **username** (3–15 letters, numbers or _). Then, from the 👤 Profile screen:
- **Friends:** add someone by username, or share a link like `https://playmodidex.com/#add=jedimodi`. They accept or decline.
- **Groups:** create one and share its 6-letter code or invite link (`#join=CODE`). Up to 50 members, with a leaderboard for **Today**, **This week** (Monday–Sunday, ET) and **All-time**. Points per puzzle: 6 for a 1st-guess solve down to 1 for a 6th-guess solve, 0 for a miss. All-time comes from each player's stats; the weekly total comes from a 60-day results history saved with the profile (`history` in `users`, `week`/`alltime` in `profiles`, so `firestore.rules` must be the current version).
- **What others see:** your username, Dex (caught, seen, shiny), evolution lines, streaks and today's results as spoiler-free squares. Never the answers, and never your email.
- **Who can see it:** only your friends and people in a group with you. The rules in [`firestore.rules`](firestore.rules) enforce this.
- After changing `firestore.rules`, paste it into Firebase → Firestore → **Rules** and click **Publish**.

## Publishing updates

- **Data only** (`data/*.json`): commit and push. Players get it on their next visit.
- **Code or styling** (`js/`, `css/`): run `node tools/bump-version.mjs` first, then commit and push. It stamps a new version on every file so browsers never mix old and new code.

## Turning NHL back on (or adding a sport)

NHL is fully built, with 20 athletes already in the data file. It's switched off in `js/config.js`:

```js
NHL: {
  enabled: false, // ← delete this line or set it to true
```

That's the only change needed. The NHL tab, the NHL athletes in All Sports, and the help text all come back automatically. Before you turn it on, re-check the NHL rosters.

To add a new sport (WNBA, MLS, etc.):
1. Add an entry to `SPORTS` in `js/config.js` with its leagues/divisions, position groups and stat hints.
2. Add a mode to `ALL_MODES` in the same file.
3. Add athletes with that `"sport"` value.

---

## Live site and domain

- Live at **https://playmodidex.com**. It's hosted free on GitHub Pages, and the old `modimd1992.github.io/modidex` links redirect there.
- The domain is registered at Porkbun, with auto-renew on. DNS has four `A` records for `@` pointing to GitHub (185.199.108–111.153) and a `www` CNAME to `modimd1992.github.io`.
- The `CNAME` file in this repo tells GitHub Pages which domain to serve. Don't delete it.

## Host it for free

It's plain static files, so any static host works.

### Option A: Netlify Drop (easiest, no account setup beyond sign-in)
1. Go to https://app.netlify.com/drop
2. Drag the whole `Pokemon` folder onto the page.
3. You get a live URL right away. Rename the site in Site settings, e.g. `modidex.netlify.app`.
4. To update, drag the folder again (or connect it to GitHub for automatic deploys).

### Option B: GitHub Pages (free, and updates whenever you push)
1. Create a repo on GitHub, e.g. `modidex`, then push this folder:
   ```bash
   git init
   git add .
   git commit -m "ModiDex v1"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/modidex.git
   git push -u origin main
   ```
2. In the repo, open **Settings → Pages**, set Source to **Deploy from a branch**, pick `main` and `/ (root)`, then click Save.
3. After a minute it's live at `https://YOUR-USERNAME.github.io/modidex/`. All paths are relative, so the subfolder URL works.

### Option C: Vercel
1. Push to GitHub as in Option B.
2. At https://vercel.com/new, import the repo. Framework preset: **Other**. No build command, output directory `.`.
3. Deploy. Every push redeploys.

**Custom domain:** all three let you attach your own domain (e.g. `play.jedimodi.com`) for free in their domain settings.

Before launch, set `launchDate` in `js/config.js` to your real launch day so it becomes puzzle #1.

---

## Staying clear of takedowns

- No official Pokémon sprites, logos, artwork, fonts, Poké Ball imagery or Pokédex device design. The card, hex emblem, logo and colors are all original.
- Type names are ordinary English words used as playstyle labels, with original icons and colors.
- Gen 1 comps are **text only** (name and number) and appear after the puzzle ends. This is the part with the most IP exposure. To remove it, delete the `comp` fields, or hide it by passing `showComp: false` in `renderCardArea()` in `js/main.js`.
- The footer has a "not affiliated" disclaimer. No team logos or player photos are used.
- Don't put "Pokémon" in the game's name, domain or video thumbnails.

This is general guidance, not legal advice.

---

## Future ideas (not built yet; hooks are in place)

1. **Card generator:** `renderCard(athlete)` in `js/card.js` already renders a full revealed card from any athlete. A generator page can call it directly and add "save as image".
2. **Type-matchup lineup battles:** add an effectiveness chart to `js/types.js` (e.g. `Electric` beats `Flying`) and score lineups from `stats` plus type.
3. **Pick'em league with a leaderboard:** needs a backend (Supabase or Firebase free tier). Hook it to the `modidex:complete` event.
4. **Card collecting:** answer trivia that describes an athlete and compares them to a Gen 1 creature to earn their card, and earn the daily answer's card by solving the puzzle. The game already fires `document.addEventListener('modidex:complete', e => …)` with `{ modeId, puzzleNo, athleteId, won, guesses }`, so a collection module can award cards from there and render them with `renderCard`. The `bio`, `category` and `comp.why` fields can supply the trivia questions.
