const fs = require("fs");
const path = require("path");

const wasmFiles = ["web-ifc.wasm"];
const sourceDir = path.join("node_modules", "web-ifc");
const targetDirs = [
  path.join("public"),
  path.join(".next", "static", "chunks"),
];

// Copy files to each target directory
wasmFiles.forEach((file) => {
  const sourcePath = path.join(sourceDir, file);

  targetDirs.forEach((targetDir) => {
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
  });
});
