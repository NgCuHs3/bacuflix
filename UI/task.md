Task: Implement Android Media Player Notification for CapacitorJS HTML5 Video Player

1. Objective

Analyze and implement a native Android Media Session integration for our existing CapacitorJS application.

The application currently uses HTML5 "<video>" inside the WebView for video playback.

We want an Android media notification similar to Spotify / YouTube Music, allowing users to control playback from:

- Android notification shade.
- Android lock screen.
- Bluetooth headset media buttons.
- Android system media controls.

Important: Preserve the existing HTML5 video player. Do not rewrite the entire playback engine or migrate to ExoPlayer unless technical investigation proves it necessary.

2. Phase 1: Analyze Existing Architecture

Before modifying any code, inspect the project and identify:

1. Current frontend framework (React/Vue/etc.).
2. Existing HTML5 video player implementation.
3. Video player state management.
4. Current playback event architecture.
5. Capacitor version and Android project configuration.
6. Whether HLS.js, native HLS, or another streaming library is used.
7. Existing background playback behavior.
8. Existing lifecycle management when the application enters the background.

Find the actual video element and identify the most appropriate integration point.

Do not make assumptions about file locations or architecture. Inspect the source code first.

Produce a concise implementation plan before coding.

3. Phase 2: Design the Architecture

Implement the following architecture:

Frontend:

- HTML5 Video Element remains the playback engine.
- A dedicated MediaSessionManager handles synchronization.
- A single source of truth for playback state.
- Integrate with the existing player state management rather than introducing duplicated state.

Android:

- Native MediaSession integration.
- Android MediaStyle notification.
- Media metadata synchronization.
- Playback state synchronization.
- Media action callbacks.
- Proper foreground service lifecycle if required.

Communication:

Frontend HTML5 Video
|
v
MediaSessionManager (TypeScript)
|
v
Capacitor Plugin Bridge
|
v
Android MediaSession
|
v
Android System UI

Investigate whether the installed Capacitor Media Session plugin can satisfy the requirements before implementing a custom native plugin.

Prefer a maintained plugin if it supports the required functionality. Otherwise, implement a dedicated Kotlin Capacitor plugin using AndroidX Media3.

Do not introduce two competing MediaSession implementations.

4. Phase 3: Implement Frontend Integration

Create a reusable MediaSessionManager.

Required responsibilities:

Metadata synchronization

Synchronize:

- Video title.
- Artist / channel name.
- Thumbnail artwork when supported.
- Duration.
- Current playback position.

When switching videos, update metadata immediately.

Playback synchronization

Listen to:

- play
- pause
- playing
- waiting
- seeking
- seeked
- timeupdate
- durationchange
- ended
- ratechange
- error

Synchronize the corresponding playback state with Android.

Avoid calling the native bridge on every timeupdate event. Throttle position updates to approximately once per second or use an appropriate position-state update strategy.

Media actions

Support:

- Play
- Pause
- Stop
- Seek Forward
- Seek Backward
- Seek To
- Next Track
- Previous Track

Route these actions into the existing player controller.

Do not implement a second playback state machine.

Lifecycle

Handle:

- App foreground.
- App background.
- Video switching.
- Component unmount.
- Player destruction.
- MediaSession cleanup.

Ensure event listeners are registered only once and removed correctly.

5. Phase 4: Android Native Implementation

If a custom native implementation is required, use Kotlin and AndroidX Media3.

Investigate:

- MediaSessionService
- MediaSession
- Player interface
- MediaMetadata
- PlaybackState
- MediaStyle notification
- Foreground service lifecycle

The implementation must expose the media session to Android System UI.

If HTML5 remains the playback engine, implement a suitable proxy/controller architecture rather than pretending that a native ExoPlayer is playing the video.

Do not create a fake native playback engine that reports playing while the WebView is suspended.

Important distinction:

MediaSession notification support does not guarantee that HTML5 video continues playing after Android suspends the WebView.

Investigate this limitation explicitly.

If uninterrupted background playback is impossible with the current WebView architecture, document the limitation and propose a separate native Media3 playback architecture as an optional future migration.

6. Phase 5: Android Permissions and Manifest

Inspect and configure the required Android manifest declarations.

Evaluate:

- android.permission.POST_NOTIFICATIONS
- android.permission.FOREGROUND_SERVICE
- android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK
- Appropriate service declarations.
- Media playback foreground service type.

Only add permissions and services actually required by the chosen implementation.

Handle Android 13+ notification permission correctly.

Do not request permissions unnecessarily.

Follow Android background execution restrictions.

7. Phase 6: UI and Notification Requirements

The Android notification should display:

- Video thumbnail when supported.
- Video title.
- Channel or application name.
- Play/Pause button.
- Previous/Next buttons when applicable.
- Seek controls when supported by Android System UI.

The notification should update when the current video changes.

Avoid creating duplicate notifications.

8. Phase 7: Testing

Test the following scenarios:

1. Start video playback.
2. Minimize the application.
3. Open another application.
4. Pull down Android notification shade.
5. Press Pause.
6. Press Play.
7. Press Next.
8. Seek forward/backward.
9. Lock the screen.
10. Unlock the screen.
11. Switch videos.
12. Close the player component.
13. Reopen the application.
14. Test notification permission denied.
15. Test Android 13+ and newer Android versions.

Specifically investigate whether video/audio playback continues when the application enters the background.

Separate these two test results:

- Media notification remains available.
- Actual HTML5 playback continues.

Do not report background playback as successful just because the notification is visible.

9. Engineering Constraints

- Preserve existing application architecture.
- Preserve existing video player UI.
- Avoid unnecessary dependencies.
- Avoid excessive Capacitor bridge communication.
- Avoid duplicated playback state.
- Avoid memory leaks.
- Avoid duplicate event listeners.
- Avoid unnecessary native-to-JavaScript polling.
- Follow existing TypeScript and Kotlin conventions.
- Do not modify unrelated features.
- Keep implementation modular and maintainable.

10. Deliverables

After implementation, provide:

1. Architecture overview.
2. Files created and modified.
3. Dependencies added and reasons.
4. Android manifest changes.
5. MediaSession lifecycle explanation.
6. Frontend integration explanation.
7. Test results.
8. Known limitations.
9. Instructions to build and test on a physical Android device.

11. Execution Strategy

Work incrementally:

Step 1: Analyze existing codebase.

Step 2: Report the current architecture and proposed integration.

Step 3: Implement the smallest viable integration.

Step 4: Build and fix compilation errors.

Step 5: Test playback controls and notification synchronization.

Step 6: Test background lifecycle behavior.

Step 7: Report remaining limitations honestly.
	
Do not perform a large-scale player rewrite.

Prioritize a reliable, maintainable Android integration over a quick implementation that only works while the application is in the foreground.
