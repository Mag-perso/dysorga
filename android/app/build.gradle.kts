plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "fr.ryujin.dysorga"
    compileSdk = 34

    defaultConfig {
        applicationId = "fr.ryujin.dysorga"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }
    // Clé fixe : les mises à jour s'installent par-dessus
    signingConfigs {
        getByName("debug") {
            storeFile = file("dysorga.keystore")
            storePassword = "dysorga123"
            keyAlias = "dysorga"
            keyPassword = "dysorga123"
        }
    }
    buildTypes {
        release { isMinifyEnabled = false }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.webkit:webkit:1.11.0")
}
