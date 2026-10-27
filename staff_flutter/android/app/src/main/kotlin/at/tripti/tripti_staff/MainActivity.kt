package at.tripti.tripti_staff

import android.app.Activity
import android.content.Intent
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.RingtoneManager
import android.media.ToneGenerator
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
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
    private var ringtone: android.media.Ringtone? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        // Plays the phone's notification sound for new tickets and messages.
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "tripti/sound").setMethodCallHandler { call, result ->
            when (call.method) {
                "notify" -> {
                    vibrate(longArrayOf(0, 300, 150, 300))
                    try {
                        val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
                        RingtoneManager.getRingtone(applicationContext, uri)?.play()
                        result.success(true)
                    } catch (e: Exception) {
                        result.success(false)
                    }
                }
                // New order: three loud beeps on the alarm channel (heard even
                // when the ringer is quiet) plus a strong vibration pattern.
                "order" -> {
                    vibrate(longArrayOf(0, 450, 180, 450, 180, 700))
                    try {
                        val tone = ToneGenerator(AudioManager.STREAM_ALARM, 100)
                        val h = Handler(Looper.getMainLooper())
                        for (i in 0 until 3) h.postDelayed({ try { tone.startTone(ToneGenerator.TONE_PROP_BEEP2, 450) } catch (e: Exception) {} }, i * 650L)
                        h.postDelayed({ try { tone.release() } catch (e: Exception) {} }, 2400L)
                    } catch (e: Exception) { }
                    try {
                        val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
                        val r = RingtoneManager.getRingtone(applicationContext, uri)
                        r?.audioAttributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
                        Handler(Looper.getMainLooper()).postDelayed({ try { r?.play() } catch (e: Exception) {} }, 2000L)
                    } catch (e: Exception) { }
                    result.success(true)
                }
                "vibrate" -> {
                    vibrate(longArrayOf(0, 300, 150, 300))
                    result.success(true)
                }
                // Incoming staff call: the phone's ringtone until answered.
                "ring" -> {
                    try {
                        ringtone?.stop()
                        val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
                        ringtone = RingtoneManager.getRingtone(applicationContext, uri)
                        if (android.os.Build.VERSION.SDK_INT >= 28) ringtone?.isLooping = true
                        ringtone?.play()
                        result.success(true)
                    } catch (e: Exception) {
                        result.success(false)
                    }
                }
                "stopRing" -> {
                    ringtone?.stop()
                    ringtone = null
                    result.success(true)
                }
                else -> result.notImplemented()
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
        ringtone?.stop()
        tts?.shutdown()
        super.onDestroy()
    }

    private fun vibrate(pattern: LongArray) {
        try {
            val v: Vibrator? = if (Build.VERSION.SDK_INT >= 31) {
                (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
            } else {
                @Suppress("DEPRECATION") getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            }
            if (v == null || !v.hasVibrator()) return
            if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createWaveform(pattern, -1))
            else @Suppress("DEPRECATION") v.vibrate(pattern, -1)
        } catch (e: Exception) { }
    }
}
