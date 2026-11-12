package com.mediagod.firetv

import android.app.DownloadManager
import android.content.Context
import android.os.Build
import android.os.Environment
import android.os.StatFs
import org.json.JSONArray
import org.json.JSONObject

/** Read-only status adapter. DownloadManager still owns all transfer work. */
object DeviceDownloadStatus {
    @Synchronized fun remember(context: Context, id: Long) {
        try {
        val prefs = context.getSharedPreferences("device_download_history", Context.MODE_PRIVATE)
        val ids = prefs.getString("ids", "").orEmpty().split(',').filter { it.toLongOrNull() != null }
        prefs.edit().putString("ids", (listOf(id.toString()) + ids).distinct().take(100).joinToString(",")).apply()
        } catch (_: Throwable) { /* History must never interrupt a queued download. */ }
    }

    fun snapshot(context: Context): String = try {
        val ids = context.getSharedPreferences("device_download_history", Context.MODE_PRIVATE)
            .getString("ids", "").orEmpty().split(',').mapNotNull { it.toLongOrNull() }.toLongArray()
        val items = JSONArray()
        val manager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        if (ids.isNotEmpty()) manager.query(DownloadManager.Query().setFilterById(*ids))?.use { cursor ->
            fun number(key: String) = cursor.getLong(cursor.getColumnIndexOrThrow(key))
            while (cursor.moveToNext()) {
                val status = number(DownloadManager.COLUMN_STATUS).toInt()
                items.put(JSONObject()
                    .put("id", number(DownloadManager.COLUMN_ID).toString())
                    .put("filename", cursor.getString(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TITLE)))
                    .put("bytes", number(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
                    .put("total", number(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
                    .put("updatedAt", number(DownloadManager.COLUMN_LAST_MODIFIED_TIMESTAMP))
                    .put("status", when(status) {
                        DownloadManager.STATUS_SUCCESSFUL -> "complete"
                        DownloadManager.STATUS_FAILED -> "failed"
                        DownloadManager.STATUS_PAUSED -> "paused"
                        DownloadManager.STATUS_RUNNING -> "downloading"
                        else -> "queued"
                    }))
            }
        }
        val destination = if (Build.VERSION.SDK_INT >= 29)
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            else context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
        val storage = destination?.let { if (it.exists()) it else it.parentFile }
        JSONObject().put("items", items)
            .put("availableBytes", storage?.let { StatFs(it.absolutePath).availableBytes } ?: JSONObject.NULL)
            .toString()
    } catch (_: Throwable) { "{\"items\":[],\"unavailable\":true}" }
}
