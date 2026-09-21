// Complete cached-source chooser release verification.
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.mediagod.mobile"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.mediagod.mobile"
        minSdk = 23
        targetSdk = 35
        versionCode = 50
        versionName = "1.0.49"

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
                System.getenv("MOBILE_KEYSTORE_PATH")
                    ?: "mobile-release.jks"

            storeFile = file(signingFile)
            storePassword = System.getenv("MOBILE_KEYSTORE_PASSWORD")
            keyAlias = System.getenv("MOBILE_KEY_ALIAS")
            keyPassword = System.getenv("MOBILE_KEY_PASSWORD")
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
    // Phones/tablets already target minSdk 23, so use the current stable
    // Media3 generation with the latest Dolby Vision, AV1 and HDR fixes.
    // Media3 1.11 requires compileSdk 36, but targetSdk stays at 35 so this
    // compile-only update does not opt existing users into Android 16 behavior.
    val media3Version = "1.11.0"

    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.media3:media3-exoplayer:$media3Version")
    implementation("androidx.media3:media3-exoplayer-hls:$media3Version")
    implementation("androidx.media3:media3-exoplayer-dash:$media3Version")
    implementation("androidx.media3:media3-exoplayer-smoothstreaming:$media3Version")
    implementation("androidx.media3:media3-exoplayer-rtsp:$media3Version")
    implementation("androidx.media3:media3-ui:$media3Version")
    implementation("androidx.media3:media3-session:$media3Version")

    implementation("org.videolan.android:libvlc-all:3.6.5")

    androidTestImplementation("androidx.test:core-ktx:1.6.1")
    androidTestImplementation("androidx.test.ext:junit-ktx:1.2.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
}
