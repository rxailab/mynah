# kotlinx.serialization keeps generated serializers on the companion object.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers class com.voicecall.data.** {
    *** Companion;
}
-keepclasseswithmembers class com.voicecall.data.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# OkHttp ships optional dependencies it guards with reflection.
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
