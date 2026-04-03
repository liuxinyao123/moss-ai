/**
 * 从 assets/dsclaw-icon.svg 生成 Electron / electron-builder 可用的 PNG。
 * 运行：npm run icons（在仓库根目录）
 */
const path = require('path');
const fs = require('fs');

const assetsDir = path.join(__dirname, '..', 'assets');
const svgPath = path.join(assetsDir, 'dsclaw-icon.svg');
const outPath = path.join(assetsDir, 'icon.png');

async function main() {
  if (!fs.existsSync(svgPath)) {
    console.error('Missing:', svgPath);
    process.exit(1);
  }
  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    console.error('Run: npm install (devDependency sharp required for icons)');
    process.exit(1);
  }
  await sharp(svgPath).resize(512, 512).png().toFile(outPath);
  console.log('Wrote', outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
