# ModiDex

**A free daily athlete-guessing game by JediModi Sports Network.**

Every day there's a mystery athlete for each sport, shown as a creature-style scouting card with a type, six base stats and a field-guide bio. You get 6 guesses to name the athlete. After the puzzle ends, the card shows the athlete's **Gen 1 comp**: the creature from the original 151 that they play like.

- Modes: **All Sports**, **NFL**, **NBA**, **MLB** (NHL is built but turned off, see below)
- Same puzzles for everyone each day, with a new set at local midnight
- Wordle-style feedback on conference, team, position, age, jersey number and type
- Bonus clues unlock after 2, 4 and 5 misses
- Spoiler-free emoji share grid, plus streaks and stats per mode saved in the browser
- Static site: no build step, no backend, no accounts

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

The data is a snapshot (`dataAsOf` at the top of `athletes.json`). Trades and signings will make some entries wrong over time. Every so often, ask Claude Code to *"verify every athlete in data/athletes.json against current rosters and fix teams, numbers and divisions"*, then run the checker.

---

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

Before launch, set `launchDate` in `js/config.js` to your real launch day so it becomes puzzle #1, and set `channelUrl` to your real YouTube link.

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
