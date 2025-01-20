import fs from "fs";
import path from "path";

const wasmFiles = ["web-ifc.wasm"];
const sourceDir = path.join("node_modules", "web-ifc");
const targetDirs = [
  path.join("public"),
  path.join(".next", "static", "chunks"),
  path.join(".next", "server", "chunks"),
  path.join(".next", "server", "app"),
  path.join(".next", "cache", "wasm"),
  path.join(".vercel", "output", "static"),
  path.join(".vercel", "output", "static", "chunks"),
  path.join(".next", "static", "wasm"),
  path.join(".vercel", "output", "functions", "_next", "server", "chunks"),
  path.join(".vercel", "output", "functions", "_next", "server", "app"),
  path.join(".vercel", "output", "functions", "_next", "data"),
];

// Copy files to each target directory
wasmFiles.forEach((file) => {
  const sourcePath = path.join(sourceDir, file);

  targetDirs.forEach((targetDir) => {
    try {
      // Ensure target directory exists
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const targetPath = path.join(targetDir, file);

      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, targetPath);
        console.log(`Copied ${file} to ${targetDir}`);
      } else {
        console.warn(`Warning: ${file} not found in ${sourceDir}`);
      }
    } catch (error) {
      console.warn(`Warning: Failed to copy to ${targetDir}:`, error.message);
    }
  });
});
