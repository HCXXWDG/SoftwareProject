import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.jiangnan.course.commutemoodmap",
  appName: "心途——通勤情绪地图",
  webDir: "dist",
  server: {
    androidScheme: "http",
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
      spinnerColor: "#18694f",
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#f3f6f3",
    },
  },
};

export default config;
