package com.bacuflix.app.media

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Handler
import android.os.Looper
import android.util.LruCache
import androidx.media3.common.Player
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Shared coordinator connecting [MediaSessionPlugin] (Capacitor bridge) and
 * [PlaybackMediaSessionService] (AndroidX Media3 service) through a single [WebViewProxyPlayer].
 */
object WebViewMediaControllerBridge {

    private val mainHandler = Handler(Looper.getMainLooper())
    private val artworkExecutor = Executors.newSingleThreadExecutor()
    private val artworkCache = object : LruCache<String, ByteArray>(12) {}

    private var proxyPlayer: WebViewProxyPlayer? = null
    private var actionListener: ((action: String, value: Double?) -> Unit)? = null
    private var lastRequestedArtworkUrl: String = ""
    private var serviceStarted: Boolean = false

    fun getOrCreatePlayer(): WebViewProxyPlayer {
        val existing = proxyPlayer
        if (existing != null) {
            return existing
        }
        val created = WebViewProxyPlayer(Looper.getMainLooper()) { action, value ->
            actionListener?.invoke(action, value)
        }
        proxyPlayer = created
        return created
    }

    fun setActionListener(listener: ((action: String, value: Double?) -> Unit)?) {
        actionListener = listener
    }

    fun ensureServiceStarted(context: Context) {
        if (serviceStarted) {
            return
        }
        mainHandler.post {
            try {
                val appContext = context.applicationContext
                val intent = Intent(appContext, PlaybackMediaSessionService::class.java)
                appContext.startService(intent)
                serviceStarted = true
            } catch (_: Exception) {
                // Ignore if OS restricts service start while app is backgrounded
            }
        }
    }

    fun markServiceDestroyed() {
        serviceStarted = false
    }

    fun updateMetadata(
        context: Context,
        title: String,
        artist: String,
        album: String,
        artworkUrl: String,
        durationSec: Double,
        positionSec: Double,
        hasPrev: Boolean,
        hasNext: Boolean
    ) {
        ensureServiceStarted(context)
        mainHandler.post {
            val player = getOrCreatePlayer()
            val cachedBytes = if (artworkUrl.isNotBlank()) artworkCache.get(artworkUrl) else null
            val durationMs = if (durationSec > 0 && durationSec.isFinite()) (durationSec * 1000.0).toLong() else 0L
            val positionMs = if (positionSec >= 0 && positionSec.isFinite()) (positionSec * 1000.0).toLong() else 0L

            player.updateSnapshot { prev ->
                val effectivePlaybackState = if (prev.playbackState == Player.STATE_IDLE) {
                    Player.STATE_BUFFERING
                } else {
                    prev.playbackState
                }
                prev.copy(
                    active = true,
                    title = title.ifBlank { "BACUFlix" },
                    artist = artist.ifBlank { "BACUFlix" },
                    album = album.ifBlank { "BACUFlix" },
                    artworkUri = artworkUrl,
                    artworkBytes = cachedBytes ?: if (prev.artworkUri == artworkUrl) prev.artworkBytes else null,
                    playbackState = effectivePlaybackState,
                    durationMs = if (durationMs > 0L) durationMs else prev.durationMs,
                    positionMs = positionMs,
                    hasPrev = hasPrev,
                    hasNext = hasNext
                )
            }

            if (artworkUrl.isNotBlank() && cachedBytes == null && artworkUrl != lastRequestedArtworkUrl) {
                lastRequestedArtworkUrl = artworkUrl
                fetchArtworkAsync(artworkUrl)
            }
        }
    }

    fun updatePlaybackState(
        context: Context,
        stateStr: String,
        positionSec: Double,
        durationSec: Double,
        playbackRate: Float,
        hasPrev: Boolean?,
        hasNext: Boolean?
    ) {
        if (stateStr != "idle" && stateStr != "none") {
            ensureServiceStarted(context)
        }
        mainHandler.post {
            val player = getOrCreatePlayer()
            val positionMs = if (positionSec >= 0 && positionSec.isFinite()) (positionSec * 1000.0).toLong() else 0L
            val durationMs = if (durationSec > 0 && durationSec.isFinite()) (durationSec * 1000.0).toLong() else 0L
            val speed = if (playbackRate.isFinite() && playbackRate > 0f) playbackRate else 1.0f

            val (media3State, playWhenReady) = when (stateStr) {
                "playing" -> Pair(Player.STATE_READY, true)
                "paused" -> Pair(Player.STATE_READY, false)
                "buffering" -> Pair(Player.STATE_BUFFERING, true)
                "ended" -> Pair(Player.STATE_ENDED, false)
                "error" -> Pair(Player.STATE_READY, false)
                else -> Pair(Player.STATE_IDLE, false)
            }

            player.updateSnapshot { prev ->
                prev.copy(
                    active = stateStr != "idle" && stateStr != "none",
                    playbackState = media3State,
                    playWhenReady = playWhenReady,
                    positionMs = positionMs,
                    durationMs = if (durationMs > 0L) durationMs else prev.durationMs,
                    playbackSpeed = speed,
                    hasPrev = hasPrev ?: prev.hasPrev,
                    hasNext = hasNext ?: prev.hasNext
                )
            }
        }
    }

    fun updatePositionState(
        positionSec: Double,
        durationSec: Double,
        playbackRate: Float
    ) {
        mainHandler.post {
            val player = proxyPlayer ?: return@post
            if (!player.currentSnapshot().active) {
                return@post
            }
            val positionMs = if (positionSec >= 0 && positionSec.isFinite()) (positionSec * 1000.0).toLong() else 0L
            val durationMs = if (durationSec > 0 && durationSec.isFinite()) (durationSec * 1000.0).toLong() else 0L
            val speed = if (playbackRate.isFinite() && playbackRate > 0f) playbackRate else 1.0f

            player.updateSnapshot { prev ->
                prev.copy(
                    positionMs = positionMs,
                    durationMs = if (durationMs > 0L) durationMs else prev.durationMs,
                    playbackSpeed = speed
                )
            }
        }
    }

    fun clearSession(context: Context) {
        mainHandler.post {
            lastRequestedArtworkUrl = ""
            proxyPlayer?.updateSnapshot {
                WebViewProxyPlayer.Snapshot(active = false)
            }
            try {
                val appContext = context.applicationContext
                appContext.stopService(Intent(appContext, PlaybackMediaSessionService::class.java))
                serviceStarted = false
            } catch (_: Exception) {
            }
        }
    }

    private fun fetchArtworkAsync(artworkUrl: String) {
        if (!artworkUrl.startsWith("http://", ignoreCase = true) &&
            !artworkUrl.startsWith("https://", ignoreCase = true)
        ) {
            return
        }
        artworkExecutor.execute {
            var connection: HttpURLConnection? = null
            try {
                val url = URL(artworkUrl)
                connection = (url.openConnection() as HttpURLConnection).apply {
                    connectTimeout = 6000
                    readTimeout = 6000
                    instanceFollowRedirects = true
                    setRequestProperty("User-Agent", "BACUFlix-Android/2.5")
                }
                if (connection.responseCode in 200..299) {
                    val bytes = connection.inputStream.use { it.readBytes() }
                    val decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                    if (decoded != null) {
                        val scaled = scaleDownBitmap(decoded, 512)
                        val out = ByteArrayOutputStream()
                        scaled.compress(Bitmap.CompressFormat.JPEG, 86, out)
                        if (scaled !== decoded) {
                            scaled.recycle()
                        }
                        decoded.recycle()
                        val compressedBytes = out.toByteArray()
                        artworkCache.put(artworkUrl, compressedBytes)
                        mainHandler.post {
                            val player = proxyPlayer ?: return@post
                            val snap = player.currentSnapshot()
                            if (snap.active && snap.artworkUri == artworkUrl) {
                                player.updateSnapshot { prev ->
                                    prev.copy(artworkBytes = compressedBytes)
                                }
                            }
                        }
                    }
                }
            } catch (_: Exception) {
            } finally {
                try {
                    connection?.disconnect()
                } catch (_: Exception) {
                }
            }
        }
    }

    private fun scaleDownBitmap(bitmap: Bitmap, maxDimension: Int): Bitmap {
        val width = bitmap.width
        val height = bitmap.height
        if (width <= maxDimension && height <= maxDimension) {
            return bitmap
        }
        val ratio = width.toFloat() / height.toFloat()
        val targetWidth: Int
        val targetHeight: Int
        if (width >= height) {
            targetWidth = maxDimension
            targetHeight = (maxDimension / ratio).toInt().coerceAtLeast(1)
        } else {
            targetHeight = maxDimension
            targetWidth = (maxDimension * ratio).toInt().coerceAtLeast(1)
        }
        return Bitmap.createScaledBitmap(bitmap, targetWidth, targetHeight, true)
    }
}
