plugins {
    id("com.android.application")
}

android {
    namespace = "com.agenteasyuse.mobileeasyuse.apidemo"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.agenteasyuse.mobileeasyuse.apidemo"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    flavorDimensions += "runtime"
    productFlavors {
        create("auto") {
            dimension = "runtime"
        }
        create("manual") {
            dimension = "runtime"
            applicationIdSuffix = ".manual"
        }
        create("none") {
            dimension = "runtime"
            applicationIdSuffix = ".none"
        }
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
        }
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    packaging {
        jniLibs {
            useLegacyPackaging = true
        }
    }
}

dependencies {
    add("autoImplementation", "com.agenteasyuse:mobile-easy-use:0.1.0")
    add("manualImplementation", "com.agenteasyuse:mobile-easy-use:0.1.0")
    implementation("androidx.annotation:annotation:1.8.2")
    implementation("androidx.recyclerview:recyclerview:1.3.2")
}
