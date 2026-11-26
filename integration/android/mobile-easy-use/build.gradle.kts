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
        externalNativeBuild {
            cmake {
                arguments += listOf(
                    "-DMEU_JDK_INCLUDE=${System.getProperty("java.home")}/include",
                    "-DANDROID_STL=c++_static",
                )
            }
        }
        consumerProguardFiles("consumer-rules.pro")
        buildConfigField("String", "MOBILE_EASY_USE_RELEASE_VERSION", "\"$releaseVersion\"")
    }

    externalNativeBuild {
        cmake {
            path = file("src/main/cpp/CMakeLists.txt")
            version = "3.22.1"
        }
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
