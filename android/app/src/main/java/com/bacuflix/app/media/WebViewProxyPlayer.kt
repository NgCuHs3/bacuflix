package com.bacuflix.app.media

import android.net.Uri
import android.os.Looper
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.SimpleBasePlayer
import androidx.media3.common.util.UnstableApi
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

/**
 * Proxy [Player] implementation backed by the Capacitor WebView HTML5 `<video>` element.
 *
 * This player does not decode media natively; instead it exposes the exact state reported by
 * the frontend `MediaSessionManager` to AndroidX Media3 (`MediaSession` / System UI) and routes
 * system media control actions (`play`, `pause`, `stop`, `seekTo`, `seekForward`, `seekBackward`,
 * `nextTrack`, `previousTrack`) back to the WebView controller.
 */
@OptIn(UnstableApi::class)
class WebViewProxyPlayer(
    looper: Looper,
    private val onMediaAction: (action: String, value: Double?) -> Unit
) : SimpleBasePlayer(looper) {

    data class Snapshot(
        val active: Boolean = false,
        val title: String = "BACUFlix",
        val artist: String = "BACUFlix",
        val album: String = "BACUFlix",
        val artworkUri: String = "",
        val artworkBytes: ByteArray? = null,
        val playbackState: Int = Player.STATE_IDLE,
        val playWhenReady: Boolean = false,
        val positionMs: Long = 0L,
        val durationMs: Long = 0L,
        val playbackSpeed: Float = 1.0f,
        val hasPrev: Boolean = false,
        val hasNext: Boolean = false
    )

    companion object {
        private const val SEEK_INCREMENT_MS = 10_000L
    }

    private var snapshot = Snapshot()

    fun updateSnapshot(transform: (Snapshot) -> Snapshot) {
        snapshot = transform(snapshot)
        invalidateState()
    }

    fun currentSnapshot(): Snapshot = snapshot

    override fun getState(): State {
        val current = snapshot
        if (!current.active) {
            val idleCommands = Player.Commands.Builder()
                .addAll(
                    Player.COMMAND_PLAY_PAUSE,
                    Player.COMMAND_STOP,
                    Player.COMMAND_GET_CURRENT_MEDIA_ITEM,
                    Player.COMMAND_GET_TIMELINE,
                    Player.COMMAND_GET_METADATA
                )
                .build()

            return State.Builder()
                .setAvailableCommands(idleCommands)
                .setPlayWhenReady(false, Player.PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST)
                .setPlaybackState(Player.STATE_IDLE)
                .setPlaylist(emptyList())
                .build()
        }

        val commandsBuilder = Player.Commands.Builder()
            .addAll(
                Player.COMMAND_PLAY_PAUSE,
                Player.COMMAND_STOP,
                Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM,
                Player.COMMAND_SEEK_FORWARD,
                Player.COMMAND_SEEK_BACK,
                Player.COMMAND_GET_CURRENT_MEDIA_ITEM,
                Player.COMMAND_GET_TIMELINE,
                Player.COMMAND_GET_METADATA
            )

        if (current.hasPrev) {
            commandsBuilder.addAll(
                Player.COMMAND_SEEK_TO_PREVIOUS,
                Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM
            )
        }
        if (current.hasNext) {
            commandsBuilder.addAll(
                Player.COMMAND_SEEK_TO_NEXT,
                Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM
            )
        }

        val metadataBuilder = MediaMetadata.Builder()
            .setTitle(current.title)
            .setDisplayTitle(current.title)
            .setArtist(current.artist)
            .setAlbumTitle(current.album)
            .setSubtitle(current.artist)
            .setIsBrowsable(false)
            .setIsPlayable(true)

        if (current.artworkUri.isNotBlank()) {
            try {
                metadataBuilder.setArtworkUri(Uri.parse(current.artworkUri))
            } catch (_: Exception) {
            }
        }
        if (current.artworkBytes != null && current.artworkBytes.isNotEmpty()) {
            metadataBuilder.setArtworkData(
                current.artworkBytes,
                MediaMetadata.PICTURE_TYPE_FRONT_COVER
            )
        }

        val mediaMetadata = metadataBuilder.build()
        val mediaItem = MediaItem.Builder()
            .setMediaId("bacuflix_current")
            .setMediaMetadata(mediaMetadata)
            .build()

        val hasValidDuration = current.durationMs > 0L
        val durationUs = if (hasValidDuration) current.durationMs * 1000L else C.TIME_UNSET

        val currentItemData = MediaItemData.Builder("bacuflix_current")
            .setMediaItem(mediaItem)
            .setMediaMetadata(mediaMetadata)
            .setDurationUs(durationUs)
            .setIsSeekable(hasValidDuration)
            .setIsDynamic(false)
            .build()

        val playlist = ArrayList<MediaItemData>(3)
        if (current.hasPrev) {
            playlist.add(
                MediaItemData.Builder("bacuflix_prev")
                    .setMediaItem(MediaItem.fromUri("bacuflix://prev"))
                    .setIsSeekable(false)
                    .build()
            )
        }
        val activeIndex = playlist.size
        playlist.add(currentItemData)
        if (current.hasNext) {
            playlist.add(
                MediaItemData.Builder("bacuflix_next")
                    .setMediaItem(MediaItem.fromUri("bacuflix://next"))
                    .setIsSeekable(false)
                    .build()
            )
        }

        val clampedPosMs = if (hasValidDuration) {
            current.positionMs.coerceIn(0L, current.durationMs)
        } else {
            current.positionMs.coerceAtLeast(0L)
        }

        val speed = if (current.playbackSpeed > 0f) current.playbackSpeed else 1.0f
        val isActivelyPlaying = current.playWhenReady && current.playbackState == Player.STATE_READY
        val positionSupplier = if (isActivelyPlaying) {
            PositionSupplier.getExtrapolating(clampedPosMs, speed)
        } else {
            PositionSupplier.getConstant(clampedPosMs)
        }

        return State.Builder()
            .setAvailableCommands(commandsBuilder.build())
            .setPlayWhenReady(
                current.playWhenReady,
                Player.PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST
            )
            .setPlaybackState(current.playbackState)
            .setPlaybackParameters(PlaybackParameters(speed))
            .setSeekBackIncrementMs(SEEK_INCREMENT_MS)
            .setSeekForwardIncrementMs(SEEK_INCREMENT_MS)
            .setMaxSeekToPreviousPositionMs(Long.MAX_VALUE)
            .setPlaylist(playlist)
            .setCurrentMediaItemIndex(activeIndex)
            .setContentPositionMs(positionSupplier)
            .build()
    }

    override fun handleSetPlayWhenReady(playWhenReady: Boolean): ListenableFuture<*> {
        if (!playWhenReady) {
            snapshot = snapshot.copy(
                playWhenReady = false,
                positionMs = currentPosition.coerceAtLeast(0L)
            )
            onMediaAction("pause", null)
        } else {
            // Do not fake continuous native playback if the WebView is suspended;
            // transition to buffering/ready pending WebView confirmation and forward 'play'.
            snapshot = snapshot.copy(
                playWhenReady = true,
                playbackState = if (snapshot.playbackState == Player.STATE_IDLE || snapshot.playbackState == Player.STATE_ENDED) {
                    Player.STATE_BUFFERING
                } else {
                    snapshot.playbackState
                }
            )
            onMediaAction("play", null)
        }
        return Futures.immediateVoidFuture()
    }

    override fun handleStop(): ListenableFuture<*> {
        snapshot = snapshot.copy(
            playWhenReady = false,
            positionMs = currentPosition.coerceAtLeast(0L)
        )
        onMediaAction("stop", null)
        return Futures.immediateVoidFuture()
    }

    override fun handleSeek(
        mediaItemIndex: Int,
        positionMs: Long,
        seekCommand: Int
    ): ListenableFuture<*> {
        val current = snapshot
        val currentIdx = if (current.hasPrev) 1 else 0

        when (seekCommand) {
            Player.COMMAND_SEEK_TO_NEXT,
            Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM -> {
                onMediaAction("nextTrack", null)
            }
            Player.COMMAND_SEEK_TO_PREVIOUS,
            Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM -> {
                onMediaAction("previousTrack", null)
            }
            Player.COMMAND_SEEK_FORWARD -> {
                val targetMs = (currentPosition + SEEK_INCREMENT_MS).let {
                    if (current.durationMs > 0L) it.coerceIn(0L, current.durationMs) else it.coerceAtLeast(0L)
                }
                snapshot = current.copy(positionMs = targetMs)
                onMediaAction("seekForward", SEEK_INCREMENT_MS / 1000.0)
            }
            Player.COMMAND_SEEK_BACK -> {
                val targetMs = (currentPosition - SEEK_INCREMENT_MS).coerceAtLeast(0L)
                snapshot = current.copy(positionMs = targetMs)
                onMediaAction("seekBackward", SEEK_INCREMENT_MS / 1000.0)
            }
            else -> {
                if (mediaItemIndex > currentIdx && current.hasNext) {
                    onMediaAction("nextTrack", null)
                } else if (mediaItemIndex < currentIdx && current.hasPrev) {
                    onMediaAction("previousTrack", null)
                } else if (positionMs != C.TIME_UNSET) {
                    val targetMs = if (current.durationMs > 0L) {
                        positionMs.coerceIn(0L, current.durationMs)
                    } else {
                        positionMs.coerceAtLeast(0L)
                    }
                    snapshot = current.copy(positionMs = targetMs)
                    onMediaAction("seekTo", targetMs / 1000.0)
                }
            }
        }
        return Futures.immediateVoidFuture()
    }
}
