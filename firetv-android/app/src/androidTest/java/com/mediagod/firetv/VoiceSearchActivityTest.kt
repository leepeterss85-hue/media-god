package com.mediagod.firetv

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.speech.RecognizerIntent
import android.view.inputmethod.EditorInfo
import android.widget.EditText
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class VoiceSearchActivityTest {
    @Test
    fun existingSpeechIntentCanResolveLocalFallback() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).setPackage(context.packageName)
        val resolved = context.packageManager.resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY)
        assertEquals(VoiceSearchActivity::class.java.name, resolved?.activityInfo?.name)
        assertFalse(resolved!!.activityInfo.exported)
    }

    @Test
    fun emptyInputStaysOpenAndSubmittedTextUsesExistingResultContract() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        ActivityScenario.launchActivityForResult<VoiceSearchActivity>(
            Intent(context, VoiceSearchActivity::class.java)
        ).use { scenario ->
            scenario.onActivity { activity ->
                val input = activity.findViewById<EditText>(android.R.id.input)
                input.setText("   ")
                input.onEditorAction(EditorInfo.IME_ACTION_SEARCH)
                assertFalse(activity.isFinishing)
                assertNotNull(input.error)
                input.setText("  The Simpsons  ")
                input.onEditorAction(EditorInfo.IME_ACTION_SEARCH)
            }
            assertEquals(Activity.RESULT_OK, scenario.result.resultCode)
            assertEquals(arrayListOf("The Simpsons"), scenario.result.resultData
                .getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS))
        }
    }

    @Test
    fun leavingWithoutSubmittingDoesNotReturnASearch() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        ActivityScenario.launchActivityForResult<VoiceSearchActivity>(
            Intent(context, VoiceSearchActivity::class.java)
        ).use { scenario ->
            scenario.onActivity { it.finish() }
            assertEquals(Activity.RESULT_CANCELED, scenario.result.resultCode)
        }
    }
}
