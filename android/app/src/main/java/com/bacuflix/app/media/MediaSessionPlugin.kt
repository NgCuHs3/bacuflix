package com.bacuflix.app.media

import android.Manifest
import android.annotation.SuppressLint
import android.os.Build
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

/**
 * Capacitor plugin bridging the frontend `MediaSessionManager` with the native AndroidX Media3
 * [PlaybackMediaSessionService] and [WebViewProxyPlayer].
 */
@SuppressLint("InlinedApi")
@CapacitorPlugin(
    name = "NativeMediaSession",
    permissions = [
        Permission(
            strings = [Manifest.permission.POST_NOTIFICATIONS],
            alias = "notifications"
        )
    ]
)
class MediaSessionPlugin : Plugin() {

    override fun load() {
        super.load()
        WebViewMediaControllerBridge.setActionListener { action, value ->
            val data = JSObject().apply {
                put("action", action)
                if (value != null) {
                    put("position", value)
                    put("seconds", value)
                }
            }
            notifyListeners("mediaAction", data, false)
        }
    }

    @PluginMethod
    fun requestNotificationPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            val ret = JSObject().put("granted", true)
            call.resolve(ret)
            return
        }
        if (getPermissionState("notifications") == PermissionState.GRANTED) {
            val ret = JSObject().put("granted", true)
            call.resolve(ret)
            return
        }
        requestPermissionForAlias("notifications", call, "notificationsPermissionCallback")
    }

    @PermissionCallback
    private fun notificationsPermissionCallback(call: PluginCall) {
        val granted = getPermissionState("notifications") == PermissionState.GRANTED
        val ret = JSObject().put("granted", granted)
        call.resolve(ret)
    }

    @PluginMethod
    fun setMetadata(call: PluginCall) {
        val title = call.getString("title", "BACUFlix") ?: "BACUFlix"
        val artist = call.getString("artist", "BACUFlix") ?: "BACUFlix"
        val album = call.getString("album", "BACUFlix") ?: "BACUFlix"
        val artwork = call.getString("artwork", "") ?: ""
        val duration = call.getDouble("duration", 0.0) ?: 0.0
        val position = call.getDouble("position", 0.0) ?: 0.0
        val hasPrev = call.getBoolean("hasPrev", false) ?: false
        val hasNext = call.getBoolean("hasNext", false) ?: false

        WebViewMediaControllerBridge.updateMetadata(
            context = context,
            title = title,
            artist = artist,
            album = album,
            artworkUrl = artwork,
            durationSec = duration,
            positionSec = position,
            hasPrev = hasPrev,
            hasNext = hasNext
        )
        call.resolve()
    }

    @PluginMethod
    fun setPlaybackState(call: PluginCall) {
        val state = call.getString("state", "idle") ?: "idle"
        val position = call.getDouble("position", 0.0) ?: 0.0
        val duration = call.getDouble("duration", 0.0) ?: 0.0
        val playbackRate = (call.getDouble("playbackRate", 1.0) ?: 1.0).toFloat()
        val hasPrev = call.getBoolean("hasPrev")
        val hasNext = call.getBoolean("hasNext")

        WebViewMediaControllerBridge.updatePlaybackState(
            context = context,
            stateStr = state,
            positionSec = position,
            durationSec = duration,
            playbackRate = playbackRate,
            hasPrev = hasPrev,
            hasNext = hasNext
        )
        call.resolve()
    }

    @PluginMethod
    fun setPositionState(call: PluginCall) {
        val position = call.getDouble("position", 0.0) ?: 0.0
        val duration = call.getDouble("duration", 0.0) ?: 0.0
        val playbackRate = (call.getDouble("playbackRate", 1.0) ?: 1.0).toFloat()

        WebViewMediaControllerBridge.updatePositionState(
            positionSec = position,
            durationSec = duration,
            playbackRate = playbackRate
        )
        call.resolve()
    }

    @PluginMethod
    fun clear(call: PluginCall) {
        WebViewMediaControllerBridge.clearSession(context)
        call.resolve()
    }

    override fun handleOnDestroy() {
        WebViewMediaControllerBridge.setActionListener(null)
        WebViewMediaControllerBridge.clearSession(context)
        super.handleOnDestroy()
    }
}
