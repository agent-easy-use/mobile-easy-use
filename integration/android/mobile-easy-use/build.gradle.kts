plugins {
    id("com.android.library")
    id("maven-publish")
}

group = "com.agenteasyuse"
version = "0.1.0"

android {
    namespace = "com.agenteasyuse.mobileeasyuse"
    compileSdk = 35

    defaultConfig {
        minSdk = 24
        consumerProguardFiles("consumer-rules.pro")
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
