package gg.schu.tasksuggester

import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(AppBlockerPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
