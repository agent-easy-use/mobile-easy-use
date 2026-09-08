# Gradle integration examples

Use the project's existing Kotlin or Groovy DSL and its existing dependency-repository management location. The examples use `0.1.0` only to illustrate placement—replace it with the exact `releaseVersion` returned by `ensure-artifacts.mjs`.

## Kotlin DSL

In `settings.gradle.kts`, add the cache as a Maven repository inside the existing `dependencyResolutionManagement` block:

```kotlin
val meuHome = System.getenv("MEU_HOME")
    ?: "${System.getProperty("user.home")}/.meu"

dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
        maven {
            name = "MobileEasyUse"
            url = uri("$meuHome/android/maven")
        }
    }
}
```

Pin the selected Release in `gradle.properties`:

```properties
mobileEasyUseRelease=0.1.0
```

In the App module's `build.gradle.kts`, add exactly one dependency configuration matching the selected variant:

```kotlin
val mobileEasyUseRelease: String by project

dependencies {
    debugImplementation("com.agenteasyuse:mobile-easy-use:$mobileEasyUseRelease")
    // For a flavor-specific variant, use this instead:
    // internalDebugImplementation("com.agenteasyuse:mobile-easy-use:$mobileEasyUseRelease")
}
```

## Groovy DSL

In `settings.gradle`, add the cache inside the existing `dependencyResolutionManagement` block:

```groovy
def meuHome = System.getenv('MEU_HOME') ?:
    new File(System.getProperty('user.home'), '.meu').absolutePath

dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
        maven {
            name = 'MobileEasyUse'
            url = uri("${meuHome}/android/maven")
        }
    }
}
```

Pin the selected Release in `gradle.properties`:

```properties
mobileEasyUseRelease=0.1.0
```

In the App module's `build.gradle`, add exactly one dependency configuration matching the selected variant:

```groovy
def mobileEasyUseRelease = providers.gradleProperty('mobileEasyUseRelease').get()

dependencies {
    debugImplementation "com.agenteasyuse:mobile-easy-use:${mobileEasyUseRelease}"
    // For a flavor-specific variant, use this instead:
    // internalDebugImplementation "com.agenteasyuse:mobile-easy-use:${mobileEasyUseRelease}"
}
```

For projects that manage repositories through `allprojects.repositories` or another root-project block, place the same `maven { url = uri(...) }` entry there. Projects using `RepositoriesMode.FAIL_ON_PROJECT_REPOS` place it in `dependencyResolutionManagement.repositories`.
