plugins {
    id("com.android.library")
    id("maven-publish")
}

val releaseVersion = rootProject.file("../VERSION").readText().trim()

group = "com.agenteasyuse"
version = releaseVersion

android {
    namespace = "com.agenteasyuse.mobileeasyuse"
    compileSdk = 35

    defaultConfig {
        minSdk = 24
        consumerProguardFiles("consumer-rules.pro")
        buildConfigField("String", "MOBILE_EASY_USE_RELEASE_VERSION", "\"$releaseVersion\"")
    }

    buildFeatures {
        buildConfig = true
    }

    publishing {
        singleVariant("release") {
            withSourcesJar()
        }
    }
}

publishing {
    publications {
        register<MavenPublication>("release") {
            groupId = "com.agenteasyuse"
            artifactId = "mobile-easy-use"
            version = project.version.toString()

            afterEvaluate {
                from(components["release"])
            }
        }
    }

    repositories {
        maven {
            name = "local"
            url = rootProject.layout.buildDirectory
                .dir("maven-repository")
                .get()
                .asFile
                .toURI()
        }
    }
}
