package gg.schu.tasksuggester

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

/**
 * Geteilter Konfig-Speicher für Plugin (schreibt) und AccessibilityService (liest).
 * Die Konfiguration wird als JSON in SharedPreferences gehalten und in-memory
 * gecacht, damit der Service bei jedem Window-Event ohne Parsing prüfen kann.
 */
object BlockConfigStore {
    private const val PREFS = "block_config"
    private const val KEY_CONFIG = "config_json"

    data class Window(val startMinute: Int, val endMinute: Int)
    data class Config(
        val enabled: Boolean,
        val blockedPackages: Map<String, String>, // package -> label
        val windows: List<Window>,
    )

    @Volatile
    private var cached: Config? = null

    private fun prefs(context: Context): SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun getConfigJson(context: Context): String =
        prefs(context).getString(KEY_CONFIG, null) ?: """{"enabled":false,"blocked_packages":[],"schedule_windows":[]}"""

    fun setConfigJson(context: Context, json: String) {
        // Validierung: muss parsebar sein, sonst Exception an den Aufrufer
        val parsed = parse(json)
        prefs(context).edit().putString(KEY_CONFIG, json).apply()
        cached = parsed
    }

    fun getConfig(context: Context): Config {
        cached?.let { return it }
        val parsed = parse(getConfigJson(context))
        cached = parsed
        return parsed
    }

    private fun parse(json: String): Config {
        val obj = JSONObject(json)
        val packages = mutableMapOf<String, String>()
        val pkgArr = obj.optJSONArray("blocked_packages") ?: JSONArray()
        for (i in 0 until pkgArr.length()) {
            val e = pkgArr.getJSONObject(i)
            packages[e.getString("package")] = e.optString("label", "")
        }
        val windows = mutableListOf<Window>()
        val winArr = obj.optJSONArray("schedule_windows") ?: JSONArray()
        for (i in 0 until winArr.length()) {
            val e = winArr.getJSONObject(i)
            windows.add(Window(e.getInt("start_minute"), e.getInt("end_minute")))
        }
        return Config(obj.optBoolean("enabled", false), packages, windows)
    }

    /** end < start bedeutet Fenster über Mitternacht (z.B. 22:00–06:00). */
    fun isInWindow(config: Config, minuteOfDay: Int): Boolean =
        config.windows.any { w ->
            if (w.startMinute == w.endMinute) false
            else if (w.startMinute < w.endMinute) minuteOfDay >= w.startMinute && minuteOfDay < w.endMinute
            else minuteOfDay >= w.startMinute || minuteOfDay < w.endMinute
        }
}
