const fs = require("fs");
const path = require("path");

const wasmFiles = ["web-ifc.wasm"];
const sourceDir = path.join("node_modules", "web-ifc");
const targetDir = path.join("public");

// Ensure target directory exists
console.log(`Creating directory: ${targetDir}`);
fs.mkdirSync(targetDir, { recursive: true });

// Copy files to target directory
wasmFiles.forEach((file) => {
  const sourcePath = path.join(sourceDir, file);
  const targetPath = path.join(targetDir, file);

  if (fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, targetPath);
    console.log(`Copied ${file} to ${targetDir}`);

    // Verify the file was copied
    if (fs.existsSync(targetPath)) {
      const stats = fs.statSync(targetPath);
      console.log(`Verified ${file} exists (${stats.size} bytes)`);
    } else {
      console.error(`Failed to verify ${file} at ${targetPath}`);
    }
  } else {
    console.error(`Source file not found: ${sourcePath}`);
    process.exit(1);
  }
});
