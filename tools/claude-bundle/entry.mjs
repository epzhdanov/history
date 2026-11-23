// Официальный Anthropic SDK для браузера. Собирается esbuild в vendor/claude.js:
//   cd tools/claude-bundle && npm install && npm run build
import Anthropic from "@anthropic-ai/sdk";

export { Anthropic };
export default Anthropic;
