plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.mediagod.firetv"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.mediagod.firetv"
        minSdk = 21
        targetSdk = 35
        versionCode = 22
        versionName = "1.4.17"

        buildConfigField(
            "String",
            "MEDIA_GOD_URL",
            "\"https://mysterious-media-vault-pro.base44.app/\""
        )
    }

    signingConfigs {
        create("release") {
            val signingFile =
                System.getenv("FIRETV_KEYSTORE_PATH")
                    ?: "firetv-release.jks"

            storeFile = file(signingFile)
            storePassword = System.getenv("FIRETV_KEYSTORE_PASSWORD")
            keyAlias = System.getenv("FIRETV_KEY_ALIAS")
            keyPassword = System.getenv("FIRETV_KEY_PASSWORD")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    // Keep Media3 on the Fire OS-friendly generation already proven by Media God.
    // LibVLC is used only as a decoder/container compatibility fallback when the
    // device/Media3 path cannot decode the selected source.
    val media3Version = "1.5.1"

    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.media3:media3-exoplayer:$media3Version")
    implementation("androidx.media3:media3-exoplayer-hls:$media3Version")
    implementation("androidx.media3:media3-exoplayer-dash:$media3Version")
    implementation("androidx.media3:media3-exoplayer-smoothstreaming:$media3Version")
    implementation("androidx.media3:media3-exoplayer-rtsp:$media3Version")
    implementation("androidx.media3:media3-ui:$media3Version")
    implementation("androidx.media3:media3-session:$media3Version")

    // Stable VLC 3.x engine: broad software fallback for DTS/DTS-HD, TrueHD/MLP,
    // ALAC, FLAC, Opus/Vorbis, MPEG audio, legacy MPEG-4/DivX/Xvid/VC-1 and
    // unusual Matroska/AVI/TS-family combinations while still allowing HW decode.
    implementation("org.videolan.android:libvlc-all:3.6.5")
}
