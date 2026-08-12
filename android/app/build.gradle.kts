plugins {
    // Kotlin needs no plugin of its own: AGP 9 compiles it as part of the
    // Android plugin. Only the two compiler plugins are applied by hand.
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "com.voicecall"
    // Compiled against 37 because the AndroidX libraries below refuse to be
    // consumed by anything older. targetSdk stays at 35 deliberately: that one
    // changes how the app behaves at runtime — edge-to-edge enforcement, new
    // permission behaviour — and wants testing on a device rather than riding
    // along with a dependency bump.
    compileSdk = 37

    defaultConfig {
        applicationId = "com.voicecall"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"

        // The server this build talks to. Baked in rather than typed by the
        // person using the app: there is one deployment, and a wrong address is
        // a support problem with no upside. Override for local work with
        //   ./gradlew installDebug -Pvoicecall.serverUrl=http://10.0.2.2:8080
        val serverUrl = (findProperty("voicecall.serverUrl") as String?)
            ?: "https://voice.rxstudio.co.uk"
        buildConfigField("String", "SERVER_URL", "\"$serverUrl\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    // No kotlinOptions block: that DSL is gone in AGP 9, and the Kotlin
    // jvmTarget now follows compileOptions.targetCompatibility above, which is
    // already 17.

    buildFeatures {
        compose = true
        buildConfig = true
    }

    bundle {
        language {
            // Ship every language in the base APK rather than letting Play
            // deliver only the device's. Settings lets you pick the interface
            // language independently of the phone's, and with split delivery a
            // phone set to English would simply not have the Chinese strings to
            // switch to. Two locales cost almost nothing to carry.
            enableSplit = false
        }
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons)
    implementation(libs.androidx.navigation.compose)

    implementation(libs.androidx.datastore.preferences)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.okhttp)

    // Google sign-in. Credential Manager is the current route to an ID token;
    // the play-services artifact is the provider that actually talks to Google,
    // and googleid carries the request/response types.
    implementation(libs.androidx.credentials)
    implementation(libs.androidx.credentials.play.services)
    implementation(libs.google.identity.googleid)

    // In-app purchases. Play Billing is not optional for selling calls in the
    // app: Play's policy requires digital goods to go through it, and it is
    // also the only thing that can charge a card here. The plain artifact
    // rather than -ktx — PlayBilling.kt wraps the callbacks itself, because the
    // order it needs (verify with our server, and only then consume) is not
    // what any of the ready-made helpers do.
    implementation(libs.google.billing)

    // Paying for calls without leaving the app. Stripe's own sheet, so card
    // details go straight from it to Stripe and never touch this app or our
    // server — which is what keeps the PCI obligation at its lightest tier.
    implementation(libs.stripe.android)

    debugImplementation(libs.androidx.compose.ui.tooling)
}
