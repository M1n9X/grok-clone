import sharp from "sharp";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");

// Grok logo mark (the distinctive symbol) - extracted from grok-logo.tsx
// Original viewBox coords: roughly x:18-394, y:19-381
// We center it in a square canvas with padding
const logoSvg = (size, { maskable = false } = {}) => {
  const padding = maskable ? size * 0.25 : size * 0.15;
  const iconArea = size - padding * 2;

  // Original symbol bounding box
  const origMinX = 18;
  const origMinY = 19;
  const origW = 394 - 18; // 376
  const origH = 381 - 19; // 362

  // Scale to fit icon area, maintaining aspect ratio
  const scale = Math.min(iconArea / origW, iconArea / origH);
  const scaledW = origW * scale;
  const scaledH = origH * scale;

  // Center in the canvas
  const offsetX = (size - scaledW) / 2 - origMinX * scale;
  const offsetY = (size - scaledH) / 2 - origMinY * scale;

  const rx = maskable ? 0 : size * 0.2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${rx}" fill="#141414"/>
  <g transform="translate(${offsetX}, ${offsetY}) scale(${scale})">
    <path d="M163.591 251.367L288.916 158.716C295.06 154.174 303.842 155.946 306.769 163.001C322.178 200.209 315.294 244.924 284.638 275.625C253.982 306.326 211.328 313.059 172.34 297.724L129.75 317.472C190.837 359.287 265.016 348.946 311.369 302.492C348.137 265.67 359.524 215.479 348.877 170.217L348.973 170.314C333.533 103.822 352.769 77.2447 392.174 22.898C393.107 21.6094 394.04 20.3208 394.973 19L343.119 70.9306V70.7695L163.559 251.399" fill="white"/>
    <path d="M137.728 273.885C93.8835 231.941 101.443 167.028 138.854 129.594C166.518 101.889 211.842 90.5817 251.409 107.205L293.902 87.5535C286.246 82.0126 276.435 76.0528 265.176 71.8648C214.287 50.8929 153.362 61.3305 111.994 102.727C72.2025 142.577 59.6893 203.85 81.1773 256.135C97.229 295.211 70.9158 322.852 44.4097 350.75C35.0167 360.64 25.5916 370.53 18 381L137.696 273.917" fill="white"/>
  </g>
</svg>`;
};

const sizes = [
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
  { name: "apple-touch-icon.png", size: 180 },
  { name: "icon-maskable-512.png", size: 512, maskable: true },
];

for (const { name, size, maskable } of sizes) {
  const svg = logoSvg(size, { maskable });
  const outPath = join(publicDir, name);
  await sharp(Buffer.from(svg)).png().toFile(outPath);
  console.log(`Generated ${name} (${size}x${size}${maskable ? " maskable" : ""})`);
}

console.log("Done!");
