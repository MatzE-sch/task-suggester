package gg.schu.tasksuggester

import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.provider.Settings
import android.util.Base64
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.ByteArrayOutputStream
import org.json.JSONObject

@CapacitorPlugin(name = "AppBlocker")
class AppBlockerPlugin : Plugin() {

    override fun load() {
        // Kaltstart: App wurde vom AccessibilityService mit Extra gestartet
        activity?.intent?.let { maybeNotifyBlocked(it) }
    }

    override fun handleOnNewIntent(intent: Intent) {
        super.handleOnNewIntent(intent)
        maybeNotifyBlocked(intent)
    }

    private fun maybeNotifyBlocked(intent: Intent) {
        val pkg = intent.getStringExtra(EXTRA_BLOCKED_PACKAGE) ?: return
        val label = intent.getStringExtra(EXTRA_BLOCKED_LABEL) ?: pkg
        // Extra entfernen, damit ein Activity-Recreate (Rotation etc.) nicht erneut feuert
        intent.removeExtra(EXTRA_BLOCKED_PACKAGE)
        intent.removeExtra(EXTRA_BLOCKED_LABEL)
        val data = JSObject().put("package", pkg).put("label", label)
        notifyListeners("blockedAppOpened", data, true)
    }

    @PluginMethod
    fun getInstalledApps(call: PluginCall) {
        val pm = activity.packageManager
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val resolved = pm.queryIntentActivities(intent, 0)
        val seen = mutableSetOf<String>()
        val apps = JSArray()
        for (info in resolved) {
            val pkg = info.activityInfo.packageName
            if (pkg == activity.packageName || !seen.add(pkg)) continue
            val entry = JSObject()
            entry.put("package", pkg)
            entry.put("label", info.loadLabel(pm).toString())
            entry.put("icon", iconDataUri(pm, pkg))
            apps.put(entry)
        }
        call.resolve(JSObject().put("apps", apps))
    }

    private fun iconDataUri(pm: PackageManager, pkg: String): String {
        return try {
            val drawable = pm.getApplicationIcon(pkg)
            val size = 48
            val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            drawable.setBounds(0, 0, size, size)
            drawable.draw(canvas)
            val out = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.PNG, 90, out)
            bitmap.recycle()
            "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
        } catch (e: Exception) {
            ""
        }
    }

    @PluginMethod
    fun getBlockConfig(call: PluginCall) {
        call.resolve(JSObject.fromJSONObject(JSONObject(BlockConfigStore.getConfigJson(context))))
    }

    @PluginMethod
    fun setBlockConfig(call: PluginCall) {
        val json = call.data.toString()
        try {
            BlockConfigStore.setConfigJson(context, json)
            call.resolve()
        } catch (e: Exception) {
            call.reject("Ungültige Konfiguration: ${e.message}")
        }
    }

    @PluginMethod
    fun isAccessibilityServiceEnabled(call: PluginCall) {
        // Android speichert je nach Version/OEM die volle oder die Kurzform ("pkg/.Klasse")
        val full = "${context.packageName}/${BlockerAccessibilityService::class.java.name}"
        val short = "${context.packageName}/.${BlockerAccessibilityService::class.java.simpleName}"
        val enabledServices = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: ""
        val enabled = enabledServices.split(':').any {
            it.equals(full, ignoreCase = true) || it.equals(short, ignoreCase = true)
        }
        call.resolve(JSObject().put("enabled", enabled))
    }

    @PluginMethod
    fun openAccessibilitySettings(call: PluginCall) {
        val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        call.resolve()
    }

    companion object {
        const val EXTRA_BLOCKED_PACKAGE = "blocked_package"
        const val EXTRA_BLOCKED_LABEL = "blocked_label"
    }
}
