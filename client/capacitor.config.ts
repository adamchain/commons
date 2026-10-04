import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.oncommons.mvp",
  appName: "Commons",
  webDir: "dist",
  backgroundColor: "#f0e9df",
  ios: {
    contentInset: "never",
    backgroundColor: "#f0e9df",
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
