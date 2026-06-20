import { Config } from "@remotion/cli/config";

// Wordsmith look renders crisply as JPEG frames; overwrite the last render in place.
Config.setEntryPoint("./src/index.ts");
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
