import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.jiangnan.course.commutemoodmap",
  appName: "校园通勤情绪地图",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      androidScaleType: "CENTER_CROP",
      showSpinner: true,
      spinnerColor: "#2368ff",
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#2368ff",
    },
  },
};

export default config;
