// Complete cached-source chooser release verification.
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
        versionCode = 63
        versionName = "1.4.58"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

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
    // Media3 1.8.0 is the newest stable generation before Media3 raised minSdk
    // to 23. It keeps older Fire OS compatibility while adding important
    // Dolby Vision fallback and TV track-selection fixes missing from 1.5.1.
    val media3Version = "1.8.0"

    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.media3:media3-exoplayer:$media3Version")
    implementation("androidx.media3:media3-exoplayer-hls:$media3Version")
    implementation("androidx.media3:media3-exoplayer-dash:$media3Version")
    implementation("androidx.media3:media3-exoplayer-smoothstreaming:$media3Version")
    implementation("androidx.media3:media3-exoplayer-rtsp:$media3Version")
    implementation("androidx.media3:media3-ui:$media3Version")
    implementation("androidx.media3:media3-session:$media3Version")

    // Broad fallback for difficult 4K/HDR/remux containers and audio codecs.
    implementation("org.videolan.android:libvlc-all:3.6.5")

    androidTestImplementation("androidx.test:core-ktx:1.6.1")
    androidTestImplementation("androidx.test.ext:junit-ktx:1.2.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
}
