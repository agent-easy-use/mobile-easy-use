pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

val meuHome = System.getenv("MEU_HOME")
    ?: "${System.getProperty("user.home")}/.meu"

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        maven {
            name = "MobileEasyUse"
            url = uri("$meuHome/android/maven")
        }
    }
}

rootProject.name = "HelloWorld"
include(":app")
