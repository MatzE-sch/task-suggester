package gg.schu.tasksuggester

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Intent
import android.graphics.Path
import android.graphics.Rect
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityWindowInfo
import java.util.Calendar

/**
 * Erkennt das Öffnen geblockter Apps (TYPE_WINDOW_STATE_CHANGED) und schickt den
 * Nutzer während eines aktiven Zeitfensters zurück zum Task Suggester — hart,
 * ohne Bypass. Bild-in-Bild-Fenster geblockter Apps (z.B. YouTube-Video läuft
 * nach HOME klein weiter) werden per Drag-Geste zum Dismiss-Ziel geschlossen.
 * Fensterzugriff dient nur der Paket-Zuordnung, Inhalte werden nicht gelesen.
 */
class BlockerAccessibilityService : AccessibilityService() {

    private val handler = Handler(Looper.getMainLooper())
    // Debounce: Apps feuern beim Öffnen mehrere Window-Events kurz hintereinander
    private val lastRedirect = mutableMapOf<String, Long>()
    private val lastPipDismiss = mutableMapOf<String, Long>()

    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        val config = try { BlockConfigStore.getConfig(this) } catch (e: Exception) { return }
        if (!config.enabled) return

        val cal = Calendar.getInstance()
        val minuteOfDay = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE)
        if (!BlockConfigStore.isInWindow(config, minuteOfDay)) return

        checkPipWindows(config)

        if (event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
        val pkg = event.packageName?.toString() ?: return

        if (pkg == packageName || pkg in SYSTEM_PACKAGES) return
        if (pkg == defaultLauncherPackage() || pkg == currentImePackage()) return
        if (pkg !in config.blockedPackages) return

        val now = System.currentTimeMillis()
        if (now - (lastRedirect[pkg] ?: 0) < DEBOUNCE_MS) return
        lastRedirect[pkg] = now

        Log.i(TAG, "Blocke $pkg, leite zum Task Suggester um")
        performGlobalAction(GLOBAL_ACTION_HOME)
        val label = config.blockedPackages[pkg].takeUnless { it.isNullOrEmpty() } ?: pkg
        // Kurze Verzögerung, damit die HOME-Transition abgeschlossen ist,
        // bevor die eigene Activity gestartet wird
        handler.postDelayed({ launchSuggester(pkg, label) }, LAUNCH_DELAY_MS)
    }

    /** Schließt Bild-in-Bild-Fenster geblockter Apps (Drag zum Dismiss-Ziel unten). */
    private fun checkPipWindows(config: BlockConfigStore.Config) {
        for (w in windows) {
            if (!w.isInPictureInPictureMode) continue
            val pkg = w.root?.packageName?.toString() ?: continue
            if (pkg !in config.blockedPackages) continue

            val now = System.currentTimeMillis()
            if (now - (lastPipDismiss[pkg] ?: 0) < PIP_DEBOUNCE_MS) continue
            lastPipDismiss[pkg] = now

            Log.i(TAG, "Schließe PiP-Fenster von $pkg")
            dismissPip(w)
        }
    }

    private fun dismissPip(window: AccessibilityWindowInfo) {
        val bounds = Rect()
        window.getBoundsInScreen(bounds)
        val dm = resources.displayMetrics
        // Drag vom PiP-Zentrum zum Dismiss-Ziel unten in der Bildschirmmitte
        val path = Path().apply {
            moveTo(bounds.exactCenterX(), bounds.exactCenterY())
            lineTo(dm.widthPixels / 2f, dm.heightPixels * 0.96f)
        }
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, PIP_DRAG_MS))
            .build()
        dispatchGesture(gesture, null, null)
    }

    private fun launchSuggester(pkg: String, label: String) {
        val intent = Intent(this, MainActivity::class.java).apply {
            addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
            )
            putExtra(AppBlockerPlugin.EXTRA_BLOCKED_PACKAGE, pkg)
            putExtra(AppBlockerPlugin.EXTRA_BLOCKED_LABEL, label)
        }
        try {
            startActivity(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Konnte MainActivity nicht starten", e)
        }
    }

    private fun defaultLauncherPackage(): String? {
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
        return packageManager.resolveActivity(intent, 0)?.activityInfo?.packageName
    }

    private fun currentImePackage(): String? {
        val ime = Settings.Secure.getString(contentResolver, Settings.Secure.DEFAULT_INPUT_METHOD)
            ?: return null
        return ime.substringBefore('/')
    }

    override fun onInterrupt() {}

    companion object {
        private const val TAG = "BlockerService"
        private const val DEBOUNCE_MS = 3000L
        private const val LAUNCH_DELAY_MS = 250L
        private const val PIP_DEBOUNCE_MS = 2000L
        private const val PIP_DRAG_MS = 500L
        private val SYSTEM_PACKAGES = setOf(
            "com.android.systemui",
            "android",
        )
    }
}
