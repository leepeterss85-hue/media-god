package com.mediagod.firetv

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.text.InputType
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

/**
 * Search entry point when Fire OS has no recogniser activity installed.
 *
 * Media God's own voice button opens the system recogniser first (MainActivity
 * bridge). This activity is the fallback: it can listen directly through
 * [SpeechRecognizer] and, if the device has no speech service at all, the
 * installed Fire TV keyboard can still offer dictation. Either way the result
 * travels back through the existing RECOGNIZE_SPEECH result contract.
 */
class VoiceSearchActivity : Activity() {
    private lateinit var searchInput: EditText
    private lateinit var statusText: TextView
    private var recognizer: SpeechRecognizer? = null
    private var submitted = false
    private var listening = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setResult(RESULT_CANCELED)

        val padding = (24 * resources.displayMetrics.density).toInt()
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(padding, padding, padding, padding)
            setBackgroundColor(Color.rgb(16, 20, 24))
        }

        layout.addView(TextView(this).apply {
            text = "Search Media God"
            textSize = 24f
            setTextColor(Color.WHITE)
        })

        layout.addView(TextView(this).apply {
            text = "Say a film, TV show or live channel, or type it. Press Back to dismiss the keyboard; press Back again to cancel."
            textSize = 16f
            setTextColor(Color.LTGRAY)
        })

        statusText = TextView(this).apply {
            text = ""
            textSize = 15f
            setTextColor(Color.parseColor("#B6FFB6"))
        }
        layout.addView(statusText)

        searchInput = EditText(this).apply {
            id = android.R.id.input
            hint = "Movie, TV show or live channel"
            contentDescription = "Search Media God"
            setTextColor(Color.WHITE)
            setHintTextColor(Color.LTGRAY)
            setSingleLine(true)
            inputType = InputType.TYPE_CLASS_TEXT
            imeOptions = EditorInfo.IME_ACTION_SEARCH
            setOnEditorActionListener { _, action, _ ->
                if (action == EditorInfo.IME_ACTION_SEARCH || action == EditorInfo.IME_ACTION_DONE) {
                    submitSearch()
                    true
                } else false
            }
        }
        layout.addView(searchInput)

        layout.addView(Button(this).apply {
            text = "Speak it"
            contentDescription = "Start voice search"
            setOnClickListener { requestVoice() }
        })

        layout.addView(Button(this).apply {
            text = "Search"
            setOnClickListener { submitSearch() }
        })

        layout.addView(Button(this).apply {
            text = "Cancel"
            setOnClickListener { finish() }
        })

        setContentView(layout)
        searchInput.requestFocus()
        searchInput.post {
            if (!isFinishing) {
                (getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager)
                    .showSoftInput(searchInput, InputMethodManager.SHOW_IMPLICIT)
            }
        }
    }

    private fun requestVoice() {
        if (listening) return

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.RECORD_AUDIO),
                REQUEST_RECORD_AUDIO
            )
            return
        }

        startListening()
    }

    private fun startListening() {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            statusText.text = "Voice input is not installed on this device. Type the title instead."
            return
        }

        releaseRecognizer()

        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(
                RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
            )
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-GB")
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "en-GB")
            putExtra(RecognizerIntent.EXTRA_PROMPT, "Search Media God")
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        }

        val speech = SpeechRecognizer.createSpeechRecognizer(this)
        speech.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {
                listening = true
                statusText.text = "Listening…"
            }

            override fun onBeginningOfSpeech() = Unit
            override fun onRmsChanged(rmsdB: Float) = Unit
            override fun onBufferReceived(buffer: ByteArray?) = Unit
            override fun onEndOfSpeech() = Unit
            override fun onEvent(eventType: Int, params: Bundle?) = Unit

            override fun onPartialResults(partialResults: Bundle?) = Unit

            override fun onResults(results: Bundle?) {
                listening = false
                val spoken = results
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull()
                    .orEmpty()
                    .trim()

                if (spoken.isNotEmpty()) {
                    searchInput.setText(spoken)
                    searchInput.setSelection(spoken.length)
                    statusText.text = ""
                    submitSearch()
                } else {
                    statusText.text = "Nothing was heard. Try again or type the title."
                }
            }

            override fun onError(error: Int) {
                listening = false
                statusText.text = when (error) {
                    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS ->
                        "Microphone permission was denied. Type the title instead."
                    SpeechRecognizer.ERROR_NO_MATCH,
                    SpeechRecognizer.ERROR_SPEECH_TIMEOUT ->
                        "Nothing was heard. Try again or type the title."
                    SpeechRecognizer.ERROR_NETWORK,
                    SpeechRecognizer.ERROR_NETWORK_TIMEOUT ->
                        "Voice input needs a connection right now. Type the title instead."
                    else -> "Voice input is unavailable. Type the title instead."
                }
            }
        })

        recognizer = speech

        try {
            speech.startListening(intent)
            statusText.text = "Listening…"
        } catch (_: Throwable) {
            statusText.text = "Voice input is unavailable. Type the title instead."
            releaseRecognizer()
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)

        if (requestCode != REQUEST_RECORD_AUDIO) return

        if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            startListening()
        } else {
            statusText.text = "Microphone permission was denied. Type the title instead."
        }
    }

    private fun releaseRecognizer() {
        val active = recognizer
        recognizer = null
        listening = false

        if (active == null) return

        try {
            active.stopListening()
        } catch (_: Throwable) {
            // Already stopped.
        }

        try {
            active.destroy()
        } catch (_: Throwable) {
            // Already released.
        }
    }

    private fun submitSearch() {
        if (submitted) return
        val query = searchInput.text.toString().trim()
        if (query.isEmpty()) {
            searchInput.error = "Say or type a title first"
            searchInput.requestFocus()
            return
        }
        submitted = true
        releaseRecognizer()
        setResult(RESULT_OK, Intent().putStringArrayListExtra(
            RecognizerIntent.EXTRA_RESULTS, arrayListOf(query)
        ))
        finish()
    }

    override fun onDestroy() {
        releaseRecognizer()
        super.onDestroy()
    }

    private companion object {
        const val REQUEST_RECORD_AUDIO = 41
    }
}