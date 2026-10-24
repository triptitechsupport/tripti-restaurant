package at.tripti.tripti_staff

import android.app.Activity
import android.content.Intent
import android.media.RingtoneManager
import android.speech.RecognizerIntent
import android.speech.tts.TextToSpeech
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.util.Locale

class MainActivity : FlutterActivity() {
    private val speechRequest = 4711
    private var pendingListen: MethodChannel.Result? = null
    private var tts: TextToSpeech? = null
    private var ttsReady = false

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        // Plays the phone's notification sound for new tickets and messages.
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "tripti/sound").setMethodCallHandler { call, result ->
            if (call.method == "notify") {
                try {
                    val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
                    RingtoneManager.getRingtone(applicationContext, uri)?.play()
                    result.success(true)
                } catch (e: Exception) {
                    result.success(false)
                }
            } else {
                result.notImplemented()
            }
        }
        // Voice for the assistant: the phone's own speech input and read-aloud.
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "tripti/voice").setMethodCallHandler { call, result ->
            when (call.method) {
                "listen" -> {
                    val lang = call.argument<String>("lang") ?: "de-AT"
                    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                        putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang)
                        putExtra(RecognizerIntent.EXTRA_PROMPT, if (lang.startsWith("de")) "Frag den Assistenten" else "Ask the assistant")
                    }
                    if (intent.resolveActivity(packageManager) == null) {
                        result.error("unavailable", "Speech input is not available on this phone.", null)
                        return@setMethodCallHandler
                    }
                    pendingListen?.success(null)
                    pendingListen = result
                    try {
                        startActivityForResult(intent, speechRequest)
                    } catch (e: Exception) {
                        pendingListen = null
                        result.error("unavailable", e.message, null)
                    }
                }
                "speak" -> {
                    val text = call.argument<String>("text") ?: ""
                    val lang = call.argument<String>("lang") ?: "de-AT"
                    speak(text, lang)
                    result.success(true)
                }
                "stop" -> {
                    tts?.stop()
                    result.success(true)
                }
                else -> result.notImplemented()
            }
        }
    }

    private fun speak(text: String, lang: String) {
        val locale = Locale.forLanguageTag(lang)
        val go = {
            tts?.language = locale
            tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "tripti-assistant")
        }
        if (tts != null && ttsReady) {
            go()
            return
        }
        tts = TextToSpeech(applicationContext) { status ->
            ttsReady = status == TextToSpeech.SUCCESS
            if (ttsReady) go()
        }
    }

    @Deprecated("Uses the platform speech activity")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != speechRequest) return
        val text = if (resultCode == Activity.RESULT_OK) data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull() else null
        pendingListen?.success(text)
        pendingListen = null
    }

    override fun onDestroy() {
        tts?.shutdown()
        super.onDestroy()
    }
}
