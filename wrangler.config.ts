import { defineWranglerConfig } from "wrangler/experimental-config";

// The game is plain static files in public/.
export default defineWranglerConfig({
  "assetsDirectory": "public"
});
