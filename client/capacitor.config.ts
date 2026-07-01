import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.oncommons.mvp",
  appName: "Commons",
  webDir: "dist",
  ios: {
    contentInset: "never",
  },
};

export default config;
