plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.mediagod.mobile"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.mediagod.mobile"
        minSdk = 23
        targetSdk = 35
        versionCode = 4
        versionName = "1.0.3"

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
    val media3Version = "1.5.1"

    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.media3:media3-exoplayer:$media3Version")
    implementation("androidx.media3:media3-exoplayer-hls:$media3Version")
    implementation("androidx.media3:media3-exoplayer-dash:$media3Version")
    implementation("androidx.media3:media3-ui:$media3Version")
    implementation("androidx.media3:media3-session:$media3Version")
}