// Generates the application icons (home screen, browser tab) from one
// drawing. Run once after changing the drawing: `npm run icons`.
// The generated PNG files are committed.
import path from "node:path";
import sharp from "sharp";

const ACCENT = "#0f766e";
const ROOT = path.resolve(__dirname, "..");

/**
 * "RJ" in white on the accent colour. `padding` shrinks the letters so a
 * "maskable" icon survives being cut into a circle by Android.
 */
function drawing({ rounded, padding }: { rounded: boolean; padding: number }): Buffer {
  const size = 512;
  const fontSize = 230 * (1 - padding);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${rounded ? 96 : 0}" fill="${ACCENT}"/>
  <circle cx="256" cy="256" r="${190 * (1 - padding)}" fill="none" stroke="#ffffff" stroke-opacity="0.25" stroke-width="${14 * (1 - padding)}"/>
  <text x="256" y="256" dy="0.35em" text-anchor="middle" font-family="Segoe UI, Helvetica, Arial, sans-serif"
        font-weight="700" font-size="${fontSize}" fill="#ffffff" letter-spacing="6">RJ</text>
</svg>`);
}

const outputs: { file: string; size: number; rounded: boolean; padding: number }[] = [
  // Browser tab and bookmarks.
  { file: "public/icons/favicon.png", size: 64, rounded: true, padding: 0 },
  // iOS home screen: iOS rounds the corners itself.
  { file: "src/app/apple-icon.png", size: 180, rounded: false, padding: 0.1 },
  // Installed application (manifest).
  { file: "public/icons/icon-192.png", size: 192, rounded: true, padding: 0 },
  { file: "public/icons/icon-512.png", size: 512, rounded: true, padding: 0 },
  { file: "public/icons/maskable-512.png", size: 512, rounded: false, padding: 0.2 },
];

async function main() {
  for (const output of outputs) {
    await sharp(drawing(output))
      .resize(output.size, output.size)
      .png({ compressionLevel: 9 })
      .toFile(path.join(ROOT, output.file));
    console.log(`${output.file} (${output.size} px)`);
  }
}

void main();
