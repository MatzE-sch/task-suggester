package gg.schu.tasksuggester

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import java.util.Calendar

/**
 * Erkennt das Öffnen geblockter Apps (TYPE_WINDOW_STATE_CHANGED) und schickt den
 * Nutzer während eines aktiven Zeitfensters zurück zum Task Suggester — hart,
 * ohne Bypass. Kein Zugriff auf Fensterinhalte (canRetrieveWindowContent=false).
 */
class BlockerAccessibilityService : AccessibilityService() {

    private val handler = Handler(Looper.getMainLooper())
    // Debounce: Apps feuern beim Öffnen mehrere Window-Events kurz hintereinander
    private val lastRedirect = mutableMapOf<String, Long>()

    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        if (event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
        val pkg = event.packageName?.toString() ?: return

        if (pkg == packageName || pkg in SYSTEM_PACKAGES) return
        if (pkg == defaultLauncherPackage() || pkg == currentImePackage()) return

        val config = try { BlockConfigStore.getConfig(this) } catch (e: Exception) { return }
        if (!config.enabled || pkg !in config.blockedPackages) return

        val cal = Calendar.getInstance()
        val minuteOfDay = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE)
        if (!BlockConfigStore.isInWindow(config, minuteOfDay)) return

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
        private val SYSTEM_PACKAGES = setOf(
            "com.android.systemui",
            "android",
        )
    }
}
