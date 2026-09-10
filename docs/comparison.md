# Option comparison — location search and map stack

Companion to [report.md](./report.md). Prices and quotas were checked against vendor
pages on **2026-08-17**; treat them as a snapshot, not a quote.

Two kinds of claim appear below:

- **Measured** — observed by running this PoC against the live APIs.
- **Researched** — taken from vendor documentation, not exercised here.

---

## 1. What we measured

Both free providers were queried live through the PoC's own provider code
(`src/search/providers/`). Verbatim top results:

| Query | GSI 地理院 AddressSearch | Nominatim (public) |
|---|---|---|
| `東京都千代田区丸の内一丁目` | **`東京都千代田区丸の内一丁目`** — 1 exact hit, `[139.767197, 35.681561]` | not tested |
| `東京駅` | `北海道札幌市東区` — matched the 東 character | `東京駅;総武地下2番線` `[highway / footway]` |
| `Tokyo Station` | not applicable | `東京駅(改札外)` `[highway / footway]` |
| `Berlin Hauptbahnhof` | not applicable | **`Berlin Hauptbahnhof`** `[building / train_station]` ✓ |

Two conclusions, and the second is the one that drives the recommendation:

1. **GSI is an address index, not a place index.** On a well-formed 住所 it returns a
   single precise hit. On a landmark name it degrades to character matching and returns
   Hokkaido. It is not defective — it is answering a different question.

2. **Nominatim's Japanese place-name ranking is the real problem.** It ranks Berlin's
   Hauptbahnhof correctly as `building / train_station`, but for Tokyo Station it returns
   footpaths and stairs. This is not a general ranking flaw — it is how large Japanese
   station complexes are modelled in OSM: dozens of `highway=footway` ways carry the
   station's name, and each outranks the station node on `importance`. The gap is
   specific to Japan, which is precisely where CMS needs it to work.

**Neither free option, alone or combined, delivers acceptable Japanese place-name search.**

---

## 2. Location search options — capability

| Provider | Address search | Place / POI search | Japan accuracy | International | Japanese + multilingual |
|---|---|---|---|---|---|
| **Nominatim** (public OSM) | Fair | Poor in JP *(measured)* | Weak for POI, fair for address | Good *(measured)* | Yes — `accept-language`, returned ベルリン中央駅 |
| **Nominatim / Photon / Pelias** (self-hosted) | Fair | Same data, tunable ranking | Improvable with custom weighting | Good | Yes |
| **GSI 地理院** AddressSearch | **Excellent** *(measured)* | **Unusable** *(measured)* | Authoritative — national mapping agency | None (JP only) | Japanese only |
| **Yahoo! JAPAN YOLP** ローカルサーチ | Good | **Strong in JP** — phone-directory + business data | Built for Japan | None (JP only) | Japanese only |
| **Google Places** | Excellent | Excellent | Excellent | Excellent | Yes |
| **Mapbox Geocoding** | Good | Good | Moderate in JP | Excellent | Yes |
| **MapTiler Geocoding** | Good | Moderate | OSM-derived — same JP weakness | Good | Yes |
| **LocationIQ** | Good | Moderate | OSM/Nominatim-derived — same JP weakness | Good | Yes |

Note the pattern: everything OSM-derived (Nominatim, MapTiler, LocationIQ, Photon,
Pelias) inherits the same Japanese POI weakness, because it is a *data* problem, not an
engine problem. Only Google and YOLP use independent Japanese POI corpora.

## 3. Location search options — commercial and operational

| Provider | Cost | Quota / rate limit | Key exposure | Licence & attribution | Ties you to their tiles? |
|---|---|---|---|---|---|
| **Nominatim** (public) | Free | **1 req/s**; no bulk; production use discouraged | No key | ODbL — attribution required | No |
| **Self-hosted** (Nominatim/Photon/Pelias) | Infra only (~planet import is heavy) | Yours | None — server-side | ODbL | No |
| **GSI** | Free | No published quota | No key | 国土地理院 attribution; check 利用規約 for commercial terms | No |
| **YOLP** | Free | **50,000 req/day per app** | `appid` in browser → exposed; needs a proxy or referrer lock | Yahoo! JAPAN terms; commercial use has separate guidelines — **needs legal review** | No |
| **Google Places** | Text Search Essentials **$32/1k** (10k/mo free); Autocomplete **$2.83/1k**; Geocoding **$5/1k** (10k/mo free) | Generous | Key in browser; restrict by HTTP referrer | **Blocking — see below** | **Yes, effectively** |
| **Mapbox Geocoding** | Temporary: free to **100k/mo**, then $0.75/1k. Permanent: **$5/1k**, no free tier | Generous | Public token, URL-restricted | Attribution required | No — geocoding is separable |
| **MapTiler** | Free 1k sessions/mo; Flex $30/mo incl. 3k, then $2.50/1k | Session-based | Key in browser, domain-locked | Logo required on free tier | No |
| **LocationIQ** | Free 5k/day @ 2 req/s; Developer $100/mo 25k/day @ 20 req/s | Clear tiers | Key in browser | Attribution on free tier | No |

### The Google blocker

Google's Maps Platform terms are decisive for this project:

> **§10.5(5)** "You must not use the Content in a Maps API Implementation that contains a
> non-Google map."
>
> **§10.4(d)** "…you will not use the Content in a Maps API Implementation without a
> corresponding Google map."

Using Google Places or Geocoding to populate a Geometry field rendered on OpenLayers +
OSM/GSI tiles is **not permitted**. Adopting Google for search therefore means adopting
Google for rendering too — a far larger change than "add a search box", and one that
also brings a 30-day cap on caching results (§10.5(4)), which conflicts with storing a
geocoded coordinate in a CMS field indefinitely.

This is why Google, despite having the best Japanese POI data, is not the
recommendation.

### Cost sanity check

Assuming 50 editors × 20 searches/day × 20 working days, and ~2 requests per search
after 400 ms debouncing ≈ **40,000 requests/month**:

| Provider | Monthly cost at 40k |
|---|---|
| GSI | ¥0 |
| YOLP | ¥0 (well inside 50k/**day**) |
| Nominatim self-hosted | Infra only |
| Mapbox (temporary) | $0 — inside the 100k free tier |
| MapTiler Flex | $30 + ~$92 overage ≈ **$122** |
| LocationIQ Developer | **$100** |
| Google Places Text Search | ~**$960** |

At CMS's likely volume, cost is not the deciding factor — **licensing and Japanese POI
quality are.**

---

## 4. Map stack — the three concerns are separable

The requirement asks to distinguish rendering, editing and search. This PoC demonstrates
they genuinely are: the base-map toggle swaps OSM for 地理院淡色 tiles at runtime while
the same vector layer, the same Draw/Modify interactions and the same geocoders keep
working untouched (`src/map/baseMaps.ts`).

### 4a. Rendering and tiles

| Option | Strengths | Trade-offs |
|---|---|---|
| **OpenLayers + OSM/GSI raster** *(current)* | No key, no vendor account, GSI tiles are free and authoritative for Japan | Raster tiles — no runtime restyling, heavier at high zoom |
| **MapLibre GL JS + vector tiles** | GPU rendering, restyling, smooth zoom, no licence cost for the library | Needs a tile provider (MapTiler/self-hosted); a real migration |
| **Leaflet** | Smallest, simplest | Weakest geometry editing story; needs plugins for everything |
| **Mapbox GL JS** | Excellent rendering and tiles | v2+ is proprietary; per-map-load billing |
| **CesiumJS** | 3D / terrain — what Re:Earth Visualizer uses | Overkill for a 2D Geometry field |

### 4b. Drawing and geometry editing

| Option | Strengths | Trade-offs |
|---|---|---|
| **ol/interaction Draw + Modify + Snap + Translate** *(current)* | Built in, no extra dependency, mature; vertex-level editing and snapping work out of the box | **No GeometryCollection support in Modify** (see report) |
| **Terra Draw** | Renderer-agnostic (MapLibre, Leaflet, ol, Google) | Younger; another dependency to track |
| **mapbox-gl-draw** | Well-established | Tied to the GL renderer; MultiGeometry support is partial |
| **Leaflet-Geoman** | Rich UX, good free tier | Leaflet-only; advanced features are paid |

OpenLayers' editing layer is the strongest part of the current stack and the weakest
reason to leave it.

### 4c. Search

Fully separable from both of the above — **except for Google**, whose terms couple search
to rendering. That coupling is the single most important constraint in this whole
comparison.
