package com.mediagod.firetv

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.speech.RecognizerIntent
import android.text.InputType
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView

/** Native text entry allows the installed Fire OS keyboard to offer dictation.
 * The remote microphone remains owned by Fire OS; no Alexa key interception.
 */
class VoiceSearchActivity : Activity() {
    private lateinit var searchInput: EditText
    private var submitted = false

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
            text = "Use the keyboard microphone if offered, then choose Search. If voice input is unavailable, type a title. Press Back to dismiss the keyboard; press Back again to cancel."
            textSize = 16f
            setTextColor(Color.LTGRAY)
        })
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

    private fun submitSearch() {
        if (submitted) return
        val query = searchInput.text.toString().trim()
        if (query.isEmpty()) {
            searchInput.error = "Say or type a title first"
            searchInput.requestFocus()
            return
        }
        submitted = true
        setResult(RESULT_OK, Intent().putStringArrayListExtra(
            RecognizerIntent.EXTRA_RESULTS, arrayListOf(query)
        ))
        finish()
    }
}
