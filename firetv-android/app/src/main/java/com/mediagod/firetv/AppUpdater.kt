package com.mediagod.firetv

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicBoolean

class AppUpdater(
    private val activity: MainActivity,
    private val publishStatus: (JSONObject) -> Unit,
) {
    companion object {
        private const val PREFS = "media_god_updater"
        private const val KEY_PENDING_UPDATE_PATH = "pending_update_path"
        private const val UPDATE_FILE_NAME = "Media-God-Fire-TV.apk"
    }

    private val downloading = AtomicBoolean(false)

    fun isSupported(): Boolean = true

    fun installPermissionGranted(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
            activity.packageManager.canRequestPackageInstalls()

    fun startUpdate(url: String, versionName: String): String {
        val target = url.trim()
        if (!(target.startsWith("https://") || target.startsWith("http://"))) {
            return "error"
        }

        if (!downloading.compareAndSet(false, true)) {
            return "busy"
        }

        Thread {
            try {
                sendStatus(
                    status = "downloading",
                    message = if (versionName.isBlank()) {
                        "Downloading Media God update…"
                    } else {
                        "Downloading Media God $versionName…"
                    },
                    progress = 0,
                )

                val apk = downloadUpdate(target)

                activity.getSharedPreferences(PREFS, 0)
                    .edit()
                    .putString(KEY_PENDING_UPDATE_PATH, apk.absolutePath)
                    .apply()

                downloading.set(false)

                activity.runOnUiThread {
                    openInstallerOrRequestPermission(apk)
                }
            } catch (error: Throwable) {
                downloading.set(false)
                clearPendingUpdate()
                sendStatus(
                    status = "error",
                    message = error.message ?: "Could not download the Media God update.",
                    progress = 0,
                )
            }
        }.start()

        return "started"
    }

    fun onResume() {
        if (!installPermissionGranted()) {
            return
        }

        val path = activity.getSharedPreferences(PREFS, 0)
            .getString(KEY_PENDING_UPDATE_PATH, "")
            .orEmpty()
            .trim()

        if (path.isBlank()) {
            return
        }

        val apk = File(path)
        if (!apk.exists()) {
            clearPendingUpdate()
            return
        }

        clearPendingUpdate()
        openInstaller(apk)
    }

    private fun downloadUpdate(url: String): File {
        val updateDir = File(activity.cacheDir, "updates")
        if (!updateDir.exists() && !updateDir.mkdirs()) {
            throw IllegalStateException("Could not prepare update storage.")
        }

        val finalFile = File(updateDir, UPDATE_FILE_NAME)
        val tempFile = File(updateDir, "$UPDATE_FILE_NAME.download")

        tempFile.delete()
        finalFile.delete()

        var currentUrl = url
        var connection: HttpURLConnection? = null

        try {
            repeat(6) {
                connection?.disconnect()
                connection = (URL(currentUrl).openConnection() as HttpURLConnection).apply {
                    instanceFollowRedirects = false
                    connectTimeout = 20_000
                    readTimeout = 90_000
                    requestMethod = "GET"
                    setRequestProperty("User-Agent", "MediaGodFireTV/${BuildConfig.VERSION_NAME}")
                    setRequestProperty("Accept", "application/vnd.android.package-archive, application/octet-stream, */*")
                }

                val responseCode = connection!!.responseCode

                if (responseCode in 300..399) {
                    val location = connection!!.getHeaderField("Location")
                        ?: throw IllegalStateException("Update download redirect was missing its destination.")
                    currentUrl = URL(URL(currentUrl), location).toString()
                    return@repeat
                }

                if (responseCode !in 200..299) {
                    throw IllegalStateException("Update download failed with HTTP $responseCode.")
                }

                val expectedBytes = connection!!.contentLengthLong.coerceAtLeast(0L)
                var copied = 0L
                var lastPublishedProgress = -1

                connection!!.inputStream.use { input ->
                    FileOutputStream(tempFile).use { output ->
                        val buffer = ByteArray(64 * 1024)

                        while (true) {
                            val count = input.read(buffer)
                            if (count < 0) break

                            output.write(buffer, 0, count)
                            copied += count

                            if (expectedBytes > 0L) {
                                val progress = ((copied * 100L) / expectedBytes)
                                    .toInt()
                                    .coerceIn(0, 100)

                                if (
                                    progress == 100 ||
                                    lastPublishedProgress < 0 ||
                                    progress >= lastPublishedProgress + 5
                                ) {
                                    lastPublishedProgress = progress
                                    sendStatus(
                                        status = "downloading",
                                        message = "Downloading Media God update…",
                                        progress = progress,
                                    )
                                }
                            }
                        }

                        output.flush()
                    }
                }

                if (tempFile.length() <= 0L) {
                    throw IllegalStateException("Downloaded update file was empty.")
                }

                if (!tempFile.renameTo(finalFile)) {
                    tempFile.copyTo(finalFile, overwrite = true)
                    tempFile.delete()
                }

                sendStatus(
                    status = "downloaded",
                    message = "Update downloaded. Opening Fire OS installer…",
                    progress = 100,
                )

                return finalFile
            }
        } finally {
            connection?.disconnect()
        }

        throw IllegalStateException("Too many redirects while downloading the update.")
    }

    private fun openInstallerOrRequestPermission(apk: File) {
        if (!installPermissionGranted()) {
            sendStatus(
                status = "permission",
                message = "Allow Media God to install unknown apps once, then return here to continue the update.",
                progress = 100,
            )

            val packageUri = Uri.parse("package:${activity.packageName}")

            try {
                activity.startActivity(
                    Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, packageUri)
                )
            } catch (_: Throwable) {
                try {
                    activity.startActivity(Intent(Settings.ACTION_SECURITY_SETTINGS))
                } catch (error: Throwable) {
                    sendStatus(
                        status = "error",
                        message = error.message ?: "Could not open Fire OS install permissions.",
                        progress = 100,
                    )
                }
            }

            return
        }

        clearPendingUpdate()
        openInstaller(apk)
    }

    private fun openInstaller(apk: File) {
        try {
            val uri = FileProvider.getUriForFile(
                activity,
                "${BuildConfig.APPLICATION_ID}.fileprovider",
                apk,
            )

            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }

            sendStatus(
                status = "installer",
                message = "Fire OS is ready to install the Media God update.",
                progress = 100,
            )

            activity.startActivity(intent)
        } catch (error: Throwable) {
            sendStatus(
                status = "error",
                message = error.message ?: "Could not open the Fire OS package installer.",
                progress = 100,
            )
        }
    }

    private fun clearPendingUpdate() {
        activity.getSharedPreferences(PREFS, 0)
            .edit()
            .remove(KEY_PENDING_UPDATE_PATH)
            .apply()
    }

    private fun sendStatus(
        status: String,
        message: String,
        progress: Int,
    ) {
        publishStatus(
            JSONObject().apply {
                put("status", status)
                put("message", message)
                put("progress", progress.coerceIn(0, 100))
            }
        )
    }
}
