# Antigravity Handoff: BACUFlix Tizen TV

Use this document as project context before making changes. Preserve the
existing plain JavaScript/CSS architecture and Tizen deployment workflow.

## Project and device

- App: BACUFlix, a Samsung Tizen TV web app.
- Workspace: `C:\Users\admin\Desktop\Store House\TV-Samsung`
- TV: Samsung `QA55Q65RAKXXV`, currently at `192.168.1.3:26101`.
- Tizen app ID: `1zl7846GwH.TVVideoPlayer`; package ID: `1zl7846GwH`.
- Tizen Studio CLI: `C:\tizen-studio\tools\ide\bin\tizen.bat`.
- The `bacuhomeTV` signing profile is configured locally. Do not inspect,
  print, or copy certificate/private-key contents.

## Architecture and compatibility

- This is a modular, framework-free JavaScript app; do not migrate it to React.
- `index.html` is deliberately minimal and loads `js/app.bundle.js` as a
  classic script. Some target Tizen Web Runtimes may not reliably start native
  ES-module entry points.
- The editable source remains in `js/` as ES modules:
  - `js/app.js`: Home/Player state and transitions.
  - `js/config/catalog-sources.js`: Raw catalog URLs, source IDs, and playback
    authorization flags.
  - `js/data/movie-markdown-parser.js`: safe Markdown parsing and URL validation.
  - `js/services/catalog-service.js`: fetching, cache, refresh, source merging,
    deduplication, and partial failure reporting.
  - `js/home/home-screen.js`: dynamic catalog grid and home remote navigation.
  - `js/player/player-screen.js`: player UI and interactions.
  - `js/player/playback-service.js`: playback, HLS/native setup, errors,
    volume, and seek integration.
  - `js/player/seek-controller.js`: normalized seek preview, continuous
    accelerating hold behavior, RAF lifecycle, and seek commit.
  - `js/navigation/remote-navigation.js`: shared remote-key listener and
    directional/focus behavior.
  - `js/navigation/double-back.js`: two-press Back behavior.
  - `js/utils/format-time.js`: timeline formatting.
- `scripts/build.js` bundles those ES modules into `js/app.bundle.js` for
  Tizen. Do not hand-edit the generated bundle. Rebuild after source changes.
- Styles are separated into `css/global.css`, `css/home.css`, and
  `css/player.css`.

## Latest issue: home screen on large displays

The user reported that the main-screen background/layout looked wrong on a
large screen: content appeared too small and crowded into the top-left rather
than using the TV viewport. The current implementation is in `css/home.css`:

- `.home-screen` fills the viewport and sets its layered gradients to
  `background-position: center` and `background-size: cover`.
- Home sizing uses viewport units and explicit large-display media queries, not
  `clamp()`, which may be unsupported by the older Tizen Web Runtime.
- Absolute artwork overlays use `top`/`right`/`bottom`/`left`, not the newer
  `inset` shorthand.
- Flex spacing uses child margins instead of flexbox `gap`, and home accent
  colors use literal values so old CSS engines do not drop those declarations.
- `.home-feature` height, featured copy, and typography scale at 1080p and use
  bounded pixel dimensions at 4K.
- The current home background uses a midnight navy/purple gradient with a cyan
  atmospheric glow and subtle grid overlay. Keep the original BACUFlix red
  wordmark accent, buttons, category labels, focus borders, and hero styling;
  the user requested a background-only theme change.
- Existing narrow-screen rules remain in place.

An earlier responsive version used `clamp()` and `inset`; these newer CSS
features were a likely reason the layout remained broken on the TV. The
compatibility fix replaces those declarations with TV-supported positioning
and viewport/media-query sizing. Verify the latest version directly on the TV.
If the problem remains, inspect a TV screenshot or remote Web Inspector before
changing CSS again. Check that the TV is running the latest package and record
the viewport size, device scale, and computed layout values.

## Playback status

The configured Raw GitHub catalog currently lists IRON MAN with a third-party
stream URL. The user explicitly confirmed they are authorized to use that
catalog and its streams; `playbackEnabled` is therefore true for that source.
The app requests no stream until a movie is selected. Previous desktop browser
playback attempts on a different test URL showed media error 4 /
`NotSupportedError`; successful playback is not confirmed on the TV.

The current catalog screen fetches only the Markdown metadata, uses a
ten-minute local cache, has manual refresh/loading/error states, validates
HTTPS M3U8 URLs, and falls back to `icon.png` for invalid/unavailable posters.
Poster URLs may be plain HTTPS values or Markdown links; a poster load/decode
failure is logged and falls back to `icon.png` once without retrying the same
source. The supplied GitHub Raw `.jfif` URL parsed without changes and decoded
in Chromium (HTTP 200, `image/jpeg`, 369x542). The catalog points to the Iron
Man GitHub Raw poster URL. Fallback behavior handles invalid or unreachable
posters gracefully without card layout distortion.

Screen state is managed as a unified source of truth in `js/app.js` and exposed
on `#app[data-screen]`. Switching screens updates the active remote-navigation
handler together with that state. Browser history is synchronized with the
`#player` state so browser Back returns cleanly to the catalog without leaving
the app. Player Back and the in-app brand return button return to the catalog
immediately and destroy player resources, while catalog data is retained for
instant restoration without reloading; catalog Back remains a two-press exit
confirmation.

The player wraps hls.js 1.7.3's configured loader. hls.js identifies media
requests with `context.type === "media-fragment"` (and audio requests as
`"audio-fragment"`), not only `"fragment"`; the wrapper must intercept these
types. It inspects fragment responses only: standard TS, fragmented MP4/CMAF,
and unknown responses pass through; PNG-prefixed fragments are parsed
chunk-by-chunk with bounds and CRC checks, and only a valid trailing
188-byte-packet MPEG-TS payload is passed to hls.js. This preserves hls.js
playlist, buffering, seek, and retry ownership. Native HLS fallback cannot use
the custom fragment loader, so PNG-wrapped stream support depends on hls.js/MSE
being available.

The configured stream's PNG wrapper is successfully recovered and hls.js
parses the resulting fragments. The inspected media is H.264 High Profile
(1920x800) plus AAC-LC (44.1 kHz stereo); ffmpeg decodes an extracted TS
fragment. Desktop Chromium nevertheless reports an AAC decoder
`DECODER_ERROR_NOT_SUPPORTED` during MSE playback. Treat TV playback as
unverified until the current build is tested on the Samsung TV; do not mistake
successful package installation for successful video playback.

## Build, install, and verify

Run in PowerShell from the project directory:

```powershell
$tizen = 'C:\tizen-studio\tools\ide\bin\tizen.bat'
$project = (Get-Location).Path
$output = Join-Path $project 'dist'
node scripts\build.js
& $tizen clean -- .
& $tizen build-web --exclude README.md -- .
& $tizen package --type wgt --sign bacuhomeTV --output $output -- .buildResult
& $tizen install --name (Join-Path $output 'BACUFlix.wgt') --serial '192.168.1.3:26101'
& $tizen run --pkgid '1zl7846GwH.TVVideoPlayer' --serial '192.168.1.3:26101'
```

Do not skip the bundle generation step. A successful build, install, or
`tizen run` confirms packaging/launch status only; verify the requested visual
behavior on the TV itself when possible. Use the existing README and test
commands as additional guidance.
