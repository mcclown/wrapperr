# The voyage document (`voyage.v1`)

The voyage page draws one JSON document: one Plex account's wrapped period as a sea voyage. Wrapperr builds it
(`modules/voyage`) and serves it live; the static export writes the same document next to the page. Anything that
can produce this document can sail the page.

Days are counted from `first` (day 0), in the account's own time zone. Every name of a person is a Plex username,
never a friendly name.

## Getting it

- `POST /api/get/voyage`: the signed-in Plex user's own voyage. It needs Plex Auth and the `voyage_enabled`
  setting. It answers 403 without Plex Auth, 404 when the voyage isn't enabled, and 404 when the account has no
  plays in the period.
- `POST /api/get/users/:userId/voyage`: any user's voyage, for an admin, whether or not it is enabled for users.

Both refresh the play cache first, as a statistics request does, and need the cache on. The document is kept until
the play cache, the Plex metadata, the events, the settings or the users' time zones change.

### The static export

`wrapperr voyage export --user <Plex username> --out <folder> [--music <audio file>]`, run from
Wrapperr's folder, writes one account's voyage as a site that needs nothing else: the page with the document set
on it as `window.VOYAGE`, three.js, the fonts, the models and the sound effects, and the posters and backdrops
under `img/` (downloaded first if they aren't cached). A title whose image can't be had has none.

- It uses the play cache as the server last brought it up to date: open the voyage or the statistics in Wrapperr
  first for the latest plays. It only reads Wrapperr's files (apart from adding images to the poster cache), so it
  can run while the server does, for example with `docker exec`.
- No music is included unless `--music` names an audio file of your own, which is copied in as `audio/music.<ext>`
  (`window.VOYAGE_MUSIC`, empty without one).
- The folder must be new or empty, and is emptied again if the export fails. Serve it over HTTP to open it:
  browsers don't run its modules from `file://`.
- The end screen has no link to the classic page, since there's no Wrapperr behind it.

## The document

| Field | | |
|---|---|---|
| `version` | string | `"voyage.v1"` |
| `user` | string | the account's Plex username |
| `first` | string | the period's first day, `YYYY-MM-DD` in the server's time zone |
| `lastDay` | int | the day of the account's last play |
| `pct` | int | how far into a title (percent) counts as watching it |
| `generated` | string | when the document was built (RFC 3339, UTC) |
| `imageBase` | string | prefixed to every `poster` and `art`: Wrapperr's poster route (`/api/get/poster/`, under its root), or `img/` in an export |
| `titles` | [Title] | every title on the route or behind a creature; `t` fields index into it |
| `voyages` | [Voyage] | one voyage, the account's |
| `events` | [Event] | world events on the way, one a month at most |
| `eggs` | [Egg] | dated easter eggs from day 0 on, including those after `lastDay` (the page shows those it reaches) |

**Title**: `name`, `year` (0 when unknown), `type` (`"movie"` or `"show"`), `poster` and `art` (paths under
`imageBase`, or null). An image may not be downloaded yet when the document is first served, and then the page
should try it again. Only the titles with the most hours have `art`.

**Voyage**:
- `label`: the Plex username.
- `weeks`: for each week, `[hours, the share of those hours watched late at night (22:00 to 04:59)]`.
- `marks`: the titles along the route, most hours first. Up to 60, of which up to 15 are films.
- `creatures`: the sightings, in the order they are met.
- `sessions`, `hours`, `days`: the voyage's plays, hours and days with a play.

**Mark**:
- `t`: the title.
- `hours`.
- `plays`: watched plays (a play counts as watched at `pct`).
- `first`, `last`: its first and last days.
- `distinct`: episodes (or the film) watched.
- `lastNew`: the day the last of those was first watched.
- `peak`, `peakHours`: its day with the most hours, and those hours.
- `bestDay`, `bestAt`: the most watched plays of it in a day, and that day.
- `streak`, `streakAt`: the most days running with a watched play of it, and the first of those days (null without one).

**Creature**:
- `kind`.
- `t`: the title, or null for `line` and `winds`.
- `day`: the day it happened.
- `at`: the day it sits on, when moved off `day` to keep clear of another sighting or an egg (absent otherwise).
- `n`: as below.
- `tier`: `"cine"` for a crew's-eye shot, `"loud"` for a highlighted card as it is sailed past.

| `kind` | stands for | `n` | also |
|---|---|---|---|
| `kraken` | the most episodes of one show in a day (4 or more) | episodes | |
| `serpent` | the most days running with one show (4 or more) | days | |
| `whale` | a show of 30+ episodes seen end to end (95% of Plex's count) | episodes seen | `of`: episodes in Plex |
| `chart` | first on the server to watch a title added this period, with 2+ others following | others who followed | |
| `line` | crossing the biggest of 100, 250, 500, 1000, 2000 hours passed | the hours | |
| `winds` | 30+ days running with something watched | days | `from`: the first of them |
| `twin` | the account whose watched titles overlap most (Jaccard, 5+ in common) | titles in common | `user`: its Plex username; `pct`: the overlap; `t`: the title they both watched most |
| `wreck` | a show left part-way (4+ plays, under 80% of its episodes, none in the last 60 days) | plays | `of`: episodes in Plex |
| `ghost` | a title nobody else on the server watched (an hour or more) | hours | |

Of the kraken, serpent, whales, first to chart, wrecks and ghost ships there is one per title at most, in that
order of priority; the twin's title can also be one of theirs. The first wreck and the first ghost ship met are
`cine`; the rest of those are `loud`.

**Event**: as in `config/voyage_events.json` (`date`, `kind`, `headline`, `blurb`, `pick`), plus `day`.
Each month shows the event marked `"pick": true`, or failing that its first. Every field is the file's text as it
stands, so the page must show it as text, never as HTML.

**Egg**: as in the events file (`date`, `kind`, `note`), plus `day`.

## Not in the document

What belongs to the page rather than to the voyage is left to the page: its models (the news lighthouses), its
sounds and the optional music.

## The events file

`config/voyage_events.json` holds the world events and easter eggs. It is created from the built-in 2026 file
(`modules/voyage/events_2026.json`) the first time a voyage is built, so it can be edited for another year.
