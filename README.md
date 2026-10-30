# BACUFlix

A Samsung Tizen TV web app with an original BACUFlix identity, a remote-operated
home library, and an HLS player. The TV must be able to reach the stream and
support its video format.

The TV launcher uses an original 1024 x 512 BACUFlix icon with a horizontal
wordmark, and the app name shown on the TV is BACUFlix.

## Build and deploy

Tizen Studio is installed at `C:\tizen-studio`. From PowerShell, run these
commands in this project folder. The `bacuhomeTV` profile must be active and
contain a Samsung TV distributor certificate for the target TV.

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

The signed package is saved as `dist\BACUFlix.wgt`.

## Connect and install on the TV

1. Make sure the development computer and TV are on the same network.
2. On the TV, open **Apps**, enter `12345` with the remote, enable **Developer
   Mode**, and enter the development computer's IP address when prompted.
   Restart the TV if requested.
3. In the computer's firewall, allow the Tizen Studio device connection.
4. In Tizen Studio's Device Manager, connect to the TV at `192.168.1.3` (or
   the address shown in the TV's network settings), then select the TV as the
   deployment target and run the app.

The TV address must be the television itself, not the router's gateway address.
If Device Manager cannot connect, recheck the TV's displayed IP and Developer
Mode state. Some TV models and firmware versions may require a different
Developer Mode setup.

## Use

The Home screen fetches the configured Markdown catalog and supports refresh.
Catalog data is cached locally for ten minutes. Movie poster, title, source, and
M3U8 metadata are loaded without requesting stream playlists or segments.
Poster URLs are read directly from plain or Markdown-linked HTTPS fields.
Unavailable or unsupported images fall back to the local poster asset once;
the card continues to use the same fixed poster frame.
The configured catalog source is marked authorized by the user. Playback
starts only after selecting a movie. The player uses hls.js when Media Source
Extensions are supported, and native HLS playback otherwise. For hls.js,
standard MPEG-TS and fragmented MP4 pass through unchanged; PNG-wrapped
segments are extracted only after validating PNG chunk boundaries, CRCs, and
the trailing MPEG-TS packet sync. The loader handles hls.js `media-fragment`
and `audio-fragment` requests while leaving playlists and other requests
unchanged. The stream host must allow cross-origin requests for the playlist
and media segments. hls.js is loaded from jsDelivr, so the device also needs
access to that CDN.

### Source modules

- Run `node scripts\build.js` before packaging. It combines the ES module source
  into `js/app.bundle.js`, a classic script for Tizen Web Runtimes that do not
  reliably launch native module entry points. Edit the source modules, not the
  generated bundle.
  - Run catalog parser/service unit checks with
    `node --experimental-default-type=module tests\catalog-tests.js`.
- `js/app.js` owns the home/player screen state and transitions.
- `js/config/catalog-sources.js` stores catalog Raw URLs and source playback
  authorization flags. Only enable sources and streams you are authorized to
  use.
- `js/data/movie-markdown-parser.js` parses untrusted Markdown into validated
  movie metadata without rendering remote HTML.
- `js/services/catalog-service.js` fetches, caches, merges, deduplicates, and
  reports partial catalog failures.
- `js/home/home-screen.js` renders the catalog grid and handles remote focus.
- `js/player/player-screen.js` renders player controls and binds user actions.
- `js/player/playback-service.js` owns HLS setup, playback, volume, seeking,
  native fallback, and media errors.
- `js/player/segment-inspector.js` validates media signatures, PNG chunk
  boundaries/CRCs, and trailing MPEG-TS packet alignment.
- `js/player/segment-loader.js` wraps the installed hls.js loader, inspects
  requested fragments only, and passes normal segments through unchanged.
- `js/player/seek-controller.js` owns normalized scrub preview, smooth hold
  acceleration, animation frames, and final seek commitment.
- `js/navigation/remote-navigation.js` owns the single document-level remote
  key listener and Tizen media-key registration.
- `js/navigation/double-back.js` owns the two-press Back timeout.
- `js/utils/format-time.js` formats player timeline labels.
- `css/global.css`, `css/home.css`, and `css/player.css` separate shared,
  library, and playback styling.

### TV remote controls

- Press **Play/Pause** or **OK** to start or pause playback.
- Use **Left/Right** to move between control buttons. When the progress
  slider is selected, hold them to scrub with smooth, percentage-based
  acceleration; the preview updates continuously and playback seeks when the
  key is released. Left/Right always moves focus when a rewind/forward button
  is selected; hold a button with **OK** (or press and hold it with a pointer)
  to scrub, while a short press seeks by ten seconds.
- Use **Up/Down** to switch between the progress slider and control buttons.
  The TV's dedicated volume keys change volume. The control bar also provides seeking,
  rewind/forward, volume, mute, and full-screen buttons. Volume changes show
  a temporary level bar and percentage. Supported Tizen
  media and volume keys are registered with the TV input API when available.
- In the player, press **Back** or select the BACUFlix button to return to the
  catalog. The player and its media resources are destroyed on return. On the
  catalog, press **Back** twice within about two seconds to exit.
- The on-screen branding and controls hide after three seconds without
  interaction. Press a remote key or move the pointer to show them again;
