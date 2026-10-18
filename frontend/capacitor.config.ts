import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.jiangnan.course.commutemoodmap",
  appName: "校园通勤情绪地图",
  webDir: "dist",
  server: {
    androidScheme: "http",
  },
};

export default config;
