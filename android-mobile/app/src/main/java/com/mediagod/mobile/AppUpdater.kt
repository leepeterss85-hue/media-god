package com.mediagod.mobile

import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean

class AppUpdater(
    private val activity: MainActivity,
    private val publishStatus: (JSONObject) -> Unit,
) {
    companion object {
        private const val PREFS = "media_god_mobile_updater"
        private const val KEY_PENDING_UPDATE_PATH = "pending_update_path"
        private const val UPDATE_FILE_NAME = "Media-God-Android-Mobile.apk"
        private const val STABLE_UPDATE_URL =
            "https://github.com/leepeterss85-hue/media-god/releases/download/android-mobile-latest/Media-God-Android-Mobile.apk"

        private val TRUSTED_UPDATE_HOSTS = setOf(
            "github.com",
            "release-assets.githubusercontent.com",
            "objects.githubusercontent.com",
            "github-releases.githubusercontent.com",
        )
    }

    private val downloading = AtomicBoolean(false)

    fun isSupported(): Boolean = true

    fun installPermissionGranted(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
            activity.packageManager.canRequestPackageInstalls()

    fun startUpdate(versionName: String): String {
        pendingUpdateFile()?.takeIf { it.exists() }?.let { apk ->
            activity.runOnUiThread {
                openInstallerOrRequestPermission(apk)
            }
            return "started"
        }

        if (!downloading.compareAndSet(false, true)) {
            return "busy"
        }

        Thread {
            try {
                sendStatus(
                    status = "downloading",
                    message = if (versionName.isBlank()) {
                        "Downloading Media God Mobile update…"
                    } else {
                        "Downloading Media God Mobile $versionName…"
                    },
                    progress = 0,
                )

                val apk = downloadUpdate(STABLE_UPDATE_URL)
                verifyDownloadedApk(apk)

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
                    message = error.message ?: "Could not download the Media God Mobile update.",
                    progress = 0,
                )
            }
        }.start()

        return "started"
    }

    fun onResume() {
        val apk = pendingUpdateFile() ?: return

        if (!apk.exists()) {
            clearPendingUpdate()
            return
        }

        if (!installPermissionGranted()) {
            sendStatus(
                status = "permission_required",
                message = "Android still needs permission for Media God Mobile to install updates. You can retry or choose Later.",
                progress = 100,
            )
            return
        }

        try {
            verifyDownloadedApk(apk)
            clearPendingUpdate()
            openInstaller(apk)
        } catch (error: Throwable) {
            clearPendingUpdate()
            apk.delete()
            sendStatus(
                status = "error",
                message = error.message ?: "The downloaded update could not be verified.",
                progress = 100,
            )
        }
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

        var currentUrl = validateTrustedHttpsUrl(url)
        var connection: HttpURLConnection? = null

        try {
            repeat(6) {
                connection?.disconnect()
                connection = (URL(currentUrl).openConnection() as HttpURLConnection).apply {
                    instanceFollowRedirects = false
                    connectTimeout = 20_000
                    readTimeout = 90_000
                    requestMethod = "GET"
                    setRequestProperty("User-Agent", "MediaGodMobile/${BuildConfig.VERSION_NAME}")
                    setRequestProperty(
                        "Accept",
                        "application/vnd.android.package-archive, application/octet-stream, */*"
                    )
                }

                val responseCode = connection!!.responseCode

                if (responseCode in 300..399) {
                    val location = connection!!.getHeaderField("Location")
                        ?: throw IllegalStateException("Update download redirect was missing its destination.")
                    currentUrl = validateTrustedHttpsUrl(
                        URL(URL(currentUrl), location).toString()
                    )
                    return@repeat
                }

                if (responseCode !in 200..299) {
                    throw IllegalStateException("Update download failed with HTTP $responseCode.")
                }

                val expectedBytes =
                    connection!!.getHeaderField("Content-Length")
                        ?.toLongOrNull()
                        ?.coerceAtLeast(0L)
                        ?: 0L
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
                                        message = "Downloading Media God Mobile update…",
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
                    message = "Update downloaded and verified. Opening Android installer…",
                    progress = 100,
                )

                return finalFile
            }
        } finally {
            connection?.disconnect()
        }

        throw IllegalStateException("Too many redirects while downloading the update.")
    }

    private fun validateTrustedHttpsUrl(rawUrl: String): String {
        val parsed = URL(rawUrl)
        val host = parsed.host.lowercase()

        if (parsed.protocol.lowercase() != "https" || host !in TRUSTED_UPDATE_HOSTS) {
            throw IllegalStateException("Update download was redirected to an untrusted address.")
        }

        return parsed.toString()
    }

    private fun verifyDownloadedApk(apk: File) {
        val archiveInfo = getArchivePackageInfo(apk)
            ?: throw IllegalStateException("Downloaded file is not a valid Android APK.")

        if (archiveInfo.packageName != BuildConfig.APPLICATION_ID) {
            throw IllegalStateException("Downloaded APK is not Media God Mobile.")
        }

        if (versionCodeOf(archiveInfo) <= BuildConfig.VERSION_CODE.toLong()) {
            throw IllegalStateException("Downloaded APK is not newer than this Media God Mobile version.")
        }

        val currentInfo = getInstalledPackageInfo()
        val currentSigners = signerDigests(currentInfo)
        val archiveSigners = signerDigests(archiveInfo)

        if (
            currentSigners.isEmpty() ||
            archiveSigners.isEmpty() ||
            currentSigners.intersect(archiveSigners).isEmpty()
        ) {
            throw IllegalStateException("Downloaded APK signing identity does not match Media God Mobile.")
        }
    }

    @Suppress("DEPRECATION")
    private fun getArchivePackageInfo(apk: File): PackageInfo? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            activity.packageManager.getPackageArchiveInfo(
                apk.absolutePath,
                PackageManager.GET_SIGNING_CERTIFICATES,
            )
        } else {
            activity.packageManager.getPackageArchiveInfo(
                apk.absolutePath,
                PackageManager.GET_SIGNATURES,
            )
        }

    @Suppress("DEPRECATION")
    private fun getInstalledPackageInfo(): PackageInfo =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            activity.packageManager.getPackageInfo(
                activity.packageName,
                PackageManager.GET_SIGNING_CERTIFICATES,
            )
        } else {
            activity.packageManager.getPackageInfo(
                activity.packageName,
                PackageManager.GET_SIGNATURES,
            )
        }

    @Suppress("DEPRECATION")
    private fun versionCodeOf(info: PackageInfo): Long =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            info.longVersionCode
        } else {
            info.versionCode.toLong()
        }

    @Suppress("DEPRECATION")
    private fun signerDigests(info: PackageInfo): Set<String> {
        val signatures =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                info.signingInfo?.apkContentsSigners ?: emptyArray()
            } else {
                info.signatures ?: emptyArray()
            }

        return signatures.map { signature ->
            val digest = MessageDigest.getInstance("SHA-256")
                .digest(signature.toByteArray())
            digest.joinToString("") { byte -> "%02x".format(byte) }
        }.toSet()
    }

    private fun openInstallerOrRequestPermission(apk: File) {
        try {
            verifyDownloadedApk(apk)
        } catch (error: Throwable) {
            clearPendingUpdate()
            apk.delete()
            sendStatus(
                status = "error",
                message = error.message ?: "The downloaded update could not be verified.",
                progress = 100,
            )
            return
        }

        if (!installPermissionGranted()) {
            sendStatus(
                status = "permission",
                message = "Allow Media God Mobile to install unknown apps once, then return here to continue the update.",
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
                        message = error.message ?: "Could not open Android install permissions.",
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
                message = "Android is ready to install the Media God Mobile update.",
                progress = 100,
            )

            activity.startActivity(intent)
        } catch (error: Throwable) {
            sendStatus(
                status = "error",
                message = error.message ?: "Could not open the Android package installer.",
                progress = 100,
            )
        }
    }

    private fun pendingUpdateFile(): File? {
        val path = activity.getSharedPreferences(PREFS, 0)
            .getString(KEY_PENDING_UPDATE_PATH, "")
            .orEmpty()
            .trim()

        return path.takeIf { it.isNotBlank() }?.let(::File)
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