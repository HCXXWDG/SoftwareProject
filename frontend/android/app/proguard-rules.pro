# ── General ──
-keepattributes Signature
-keepattributes *Annotation*
-keepattributes SourceFile,LineNumberTable

# ── AndroidX ──
-keep class androidx.** { *; }
-keep interface androidx.** { *; }

# ── Capacitor bridge (WebView <-> JS communication) ──
-keep class com.getcapacitor.** { *; }
-keep interface com.getcapacitor.** { *; }
-keep class org.apache.cordova.** { *; }

# ── App code ──
-keep class com.jiangnan.course.commutemoodmap.** { *; }

# ── WebView JavaScript interface ──
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# ── Parcelable ──
-keep class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator *;
}

# ── Enums ──
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# ── R8 full mode compatibility ──
-keep,allowobfuscation class * {
    @com.google.gson.annotations.SerializedName <fields>;
}

# ── Splash screen ──
-keep class androidx.core.content.FileProvider { *; }

# ── Suppress warnings for Capacitor plugins ──
-dontwarn com.getcapacitor.**
-dontwarn org.apache.cordova.**
