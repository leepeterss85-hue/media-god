plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.mediagod.firetv"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.mediagod.firetv"
        minSdk = 23
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        buildConfigField(
            "String",
            "MEDIA_GOD_URL",
            "\"https://aura-connect-ab1f9d62.base44.app/\""
        )
    }

    buildTypes {
        release {
            isMinifyEnabled = false
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
    // Keep the native player on a Fire OS-friendly Media3 generation rather
    // than pulling the newest AndroidX stack, which currently requires API
    // 36/37 just to compile. Fire TV playback does not need those APIs.
    val media3Version = "1.5.1"

    implementation("androidx.media3:media3-exoplayer:$media3Version")
    implementation("androidx.media3:media3-exoplayer-hls:$media3Version")
    implementation("androidx.media3:media3-exoplayer-dash:$media3Version")
    implementation("androidx.media3:media3-ui:$media3Version")
    implementation("androidx.media3:media3-session:$media3Version")
}
