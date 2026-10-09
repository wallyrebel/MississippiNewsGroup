# Mississippi News Group live weather

An automatic weather dashboard for the existing Netlify website, with a dedicated 16:9 vMix browser display. Uses official NWS/NOAA weather feeds, U.S. Census boundaries, and MDOT's public camera snapshots. No paid weather API or browser API key is required.

## Open it

- Website: `https://mississippinewsgroup.com/weather`
- vMix: `https://mississippinewsgroup.com/weather/live`
- Alternate broadcast URL: `https://mississippinewsgroup.com/weather?broadcast=1`

These production paths become available when this branch is deployed to the Netlify site serving the domain. A local implementation alone does not publish them.

For local preview, run `npm run dev:weather` from this repository, then open `http://127.0.0.1:4173/weather/live`. Node.js 20 or later is recommended. The preview uses the same weather handlers as Netlify and does not need npm dependency installation. Leave the terminal running while using the local URL.

## vMix setup

1. Choose **Add Input → Web Browser**.
2. Enter the `/weather/live` URL above (or the localhost URL on the same computer during development).
3. Set **Width 1920** and **Height 1080**. Set the vMix show/output to 1920×1080 as well.
4. Use browser zoom 100% and reset any input crop/position transformations. No custom CSS is needed.
5. Add the input to the show. City forecasts, radar frames, alerts and occasional camera snapshots update automatically.

The broadcast view fills a 1920×1080 canvas, hides website controls, and scales proportionally to other 16:9 inputs. A differently shaped preview window gets letterboxing rather than cropping. CSS container units require a modern Chromium browser; use vMix's Chromium V115 or newer browser engine. The page is a browser source; vMix performs the video encoding/streaming.

Optional URL controls:

| Parameter | Behavior |
| --- | --- |
| `city=biloxi` | Start with a specific configured city |
| `rotate=0` | Hold that city; weather still refreshes |
| `seconds=24` | Change city dwell time (10–120 seconds; default 18) |
| `cameras=0` | Turn off occasional cameras |

Example: `/weather/live?city=biloxi&seconds=24`. Selecting a region/city on the interactive page pauses city rotation; the Resume button restarts it.

## Coverage and behavior

24 forecast points are grouped into seven regions, in geographic rotation order:

- **North:** Southaven, Oxford, Tupelo, Corinth.
- **Delta:** Clarksdale, Cleveland, Greenville, Greenwood.
- **Central:** Jackson, Vicksburg, Kosciusko.
- **East:** Starkville, Columbus, Meridian.
- **Southwest:** Natchez, Brookhaven, McComb.
- **Pine Belt:** Hattiesburg, Laurel, Picayune.
- **Coast:** Bay St. Louis, Gulfport, Biloxi, Pascagoula.

Edit `weather/config.json` to change cities or groupings. Display temperatures are explicitly **forecasts**, not current observations. The seven-day rain percentage is the maximum available daytime/nighttime probability for each Central Time date. A missing daytime high, nighttime low or precipitation probability stays blank instead of being invented.

Radar stays statewide while the forecast rotates. NOAA MRMS quality-controlled base reflectivity is a mosaic of multiple radar sites; it is not a velocity product or future-radar prediction. The player requests timestamps advertised by NOAA, samples approximately the last hour, and displays the timestamp of the frame currently visible.

Alerts are statewide, sorted with Tornado and Flash Flood Warnings first. Test, cancelled, future-effective, expired and ended messages are excluded. The sidebar keeps immediate tornado/flash flood warnings visible while any are active; otherwise it cycles warnings, then watches, then other messages. A new highest-priority alert immediately resets that cycle. The ticker and dialog include all active messages and complete affected-area descriptions, which may include adjacent-state areas in an NWS multi-state product. Solid outlines represent supplied NWS polygons. Dashed outlines show affected Mississippi counties from SAME codes when an exact polygon is missing; these are broad county outlines, not exact storm boundaries. Some alerts have no usable map geometry; they still appear in the alert list and ticker.

MDOT cameras appear in the city-forecast panel for 20 seconds every two minutes, leaving radar, warnings and the seven-day strip visible. Ten public camera locations cover Southaven, Tupelo, Greenville, Jackson, Vicksburg, Natchez, Hattiesburg, Gulfport, Biloxi and Pascagoula. Cameras matching active-alert county codes are shown first. With no current matches, the rotation covers all configured cameras. Alert matching is county-level and does not claim the camera itself is in an exact storm polygon. A delayed alert feed disables alert-based camera prioritization.

Cameras are **refreshed still snapshots**, not full-motion video. During their brief appearance, snapshots refresh every 10 seconds. The label gives the download time, not an unverified capture time. Failed images fall back to the city forecast. MDOT can move cameras, interrupt feeds or return placeholder images; a successful JPEG response alone cannot prove the scene is current. The current URLs were read from MDOT's public camera viewers on October 9, 2026. Update `data/weather-cameras.json` from the listed MDOT source pages if a feed changes. Private credentials must never be added to that file. MDOT's documented developer license is for its alerts API; camera redistribution terms should be confirmed with MDOT before any use requiring a separate media agreement.

## Freshness, outages and cost

| Feed | Browser refresh | Shared server cache | Visible delayed state |
| --- | --- | --- | --- |
| NWS alerts | 60 seconds | 30 seconds in process; 20 seconds CDN | Fetch failure or last successful check over 150 seconds old |
| NOAA radar metadata | 2 minutes | 60 seconds in process; 45 seconds CDN | Failed latest image, scan over 15 minutes old, or metadata check over 5 minutes old |
| NWS forecasts | Each minute for current region; refresh stale cache | 10 minutes in process; 5 minutes CDN | Fetch failure, retrieval over 30 minutes old, or issue time over 18 hours old |
| MDOT camera catalog | 30 minutes | 10 minutes CDN | Bad camera fails back to forecast |

In-process caches coalesce duplicate requests. A stale fallback preserves its original retrieval time. Errors do not produce an all-clear alert message. Expired alerts are removed locally; weather automatically retries after outages. Radar imagery over 30 minutes old is hidden. Each feed fails independently.

NWS and NOAA are free public sources with rate limits and no uptime guarantee. Netlify function requests, bandwidth and radar traffic still count toward hosting/provider limits. No scheduled job is needed: the browser performs automatic refreshes while the vMix input is loaded. It does not generate an unattended RTMP stream on the server.

## Deploy on the existing website

1. Review and merge the weather branch into the production branch connected to this Netlify site, or deploy it as a preview first.
2. Keep the existing repository-root publish directory and `netlify/functions` function directory. The existing esbuild bundler includes the imported JSON files and shared model.
3. Verify `/weather`, `/weather/live`, `/.netlify/functions/weather-data?kind=alerts`, and `/.netlify/functions/weather-cameras` on the deployed URL.
4. Test the deployed broadcast URL in the actual vMix installation at 1920×1080 before using it on air.

The existing home page gains a Weather navigation link. No changes to existing RSS/advertising functions or domain/DNS settings are required. No production deployment or Netlify account access is implied by a local preview.

## Checks

- `npm run test:weather` — deterministic alert filtering, priority, expiry, radar time parsing, forecast date handling, cache fallback/coalescing, source allowlisting and camera configuration checks.
- `node scripts/check-weather-live.js` — opt-in network check of NOAA radar, NWS alerts and all 24 forecast locations.
- Browser QA at 1920×1080, mobile width, region/city navigation, alert dialog, radar controls and occasional cameras.

## Verified source references

- [NWS API documentation](https://www.weather.gov/documentation/services-web-api): forecasts, alerts, User-Agent identification, caching, free data and reasonable rate limits. `/points` mappings are rechecked daily.
- [NOAA radar services directory](https://opengeo.ncep.noaa.gov/geoserver/www/index.html) and [cloud GIS services](https://www.weather.gov/gis/cloudgiswebservices): MRMS mosaic WMS and radar products.
- [Census generalized 2025 states/counties](https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_ACS2025/State_County/MapServer): bundled state and county geometry in `weather/*.geojson`. This is map geography, not live weather.
- [MDOT public traffic map](https://www.mdottraffic.com/default.aspx?showMain=true): source camera viewers are included per camera in the catalog. [Developer information](https://www.mdottraffic.com/api.html) describes conditional alerts API access.
- [vMix Web Browser input guide](https://www.vmix.com/help28/WebBrowser.html): URL, explicit pixel dimensions and Chromium browser inputs.
- [User-supplied visual guide](https://www.youtube.com/watch?v=XJM9_uSJRIw): reviewed the Mississippi LIVE Weather Network livestream layout, using the radar/sidebar/seven-day/ticker composition as inspiration with MNG branding and independently obtained official data.

Repository verification: the live domain responded with `Server: Netlify`; its public `app.js` matched this repository after whitespace normalization. The repository's canonical domain, MNG assets and Netlify function configuration also match the live site. This establishes a strong source match, but only the site's Netlify configuration can establish the actual connected deploy branch.
