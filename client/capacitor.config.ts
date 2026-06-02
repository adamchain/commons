import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.commons.app",
  appName: "Commons",
  webDir: "dist",
  ios: {
    contentInset: "always",
  },
};

export default config;
