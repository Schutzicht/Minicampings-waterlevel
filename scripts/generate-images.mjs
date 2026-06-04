#!/usr/bin/env node
/**
 * Peil - brand image generation via Nano Banana Pro (Gemini 3 Pro Image).
 *
 * Usage:
 *   npm run generate:images                       # all missing images
 *   npm run generate:images -- --force            # regenerate everything
 *   npm run generate:images -- --only=<name>      # one specific image
 *
 * Requires GEMINI_API_KEY (in ~/.zshrc shell-env or local .env).
 */

import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, "..");
const OUTPUT_DIR = path.join(PROJECT_ROOT, "public", "images");

if (!process.env.GEMINI_API_KEY) {
  console.error("\x1b[31mGEMINI_API_KEY is not set.\x1b[0m");
  console.error("  Add to ~/.zshrc:  export GEMINI_API_KEY=AIza...");
  process.exit(1);
}

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const ONLY = args.find((a) => a.startsWith("--only="))?.split("=")[1];

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const BRAND = [
  "Photorealistic editorial travel photography for Peil, a calm and trustworthy water-monitoring",
  "service for small family campsites (minicampings) in the Zeeland coastal region of the Netherlands.",
  "Visual language: natural and true-to-life, bright and airy, soft diffuse Northern-European daylight",
  "or gentle golden hour, lush greens with sandy and soft teal-blue tones, magazine-quality finish",
  "(think Kinfolk and Cereal travel features). Authentic Dutch coastal countryside in summer.",
  "No prominent people or faces, no text, no logos, no watermarks, no signage, no captions.",
  "Shot on a full-frame camera, 35mm, natural colors, gentle depth of field.",
].join(" ");

const IMAGES = [
  {
    name: "hero-minicamping",
    prompt:
      "Aspect ratio 5:4, landscape. A peaceful small-scale Dutch minicamping in summer: a handful of " +
      "canvas tents and a couple of caravans spread out on a freshly mown green grass field, bordered " +
      "by trimmed green hedges and a few mature trees. Soft early-morning light, long gentle shadows, " +
      "dew on the grass, a sandy coastal-dune ridge faintly visible in the background. Inviting, calm, spacious.",
  },
  {
    name: "homewizard-watermeter",
    prompt:
      "Aspect ratio 4:3, landscape. Clean close-up of a modern residential water meter mounted on a wall " +
      "in a tidy bright utility space, with a small minimalist white smart wifi sensor module clipped onto " +
      "the meter and a thin cable. Soft daylight from the side, shallow depth of field, crisp and technical " +
      "yet warm and domestic. Neutral white and teal tones. No brand logos of any kind.",
  },
  {
    name: "camping-zonnehoek",
    prompt:
      "Aspect ratio 4:3. A sunny minicamping grass field with a few simple tents pitched near sandy coastal " +
      "dunes with marram grass, bright cheerful summer light, blue sky with a few soft clouds, Renesse Zeeland feel.",
  },
  {
    name: "camping-weiland",
    prompt:
      "Aspect ratio 4:3. An open grassy camping meadow with two or three classic caravans and a tall green hedge, " +
      "flat wide Dutch polder landscape, soft overcast diffuse light, very green and serene.",
  },
  {
    name: "camping-boomgaard",
    prompt:
      "Aspect ratio 4:3. A minicamping set within a fruit orchard, canvas tents pitched in the dappled shade under " +
      "rows of apple trees, warm late-afternoon sun filtering through the leaves, lush and idyllic.",
  },
  {
    name: "camping-achterdedijk",
    prompt:
      "Aspect ratio 4:3. A small rural farm campsite on grass beside a grassy sea dike, a weathered barn in the " +
      "background, a few tents, wide Zeeland countryside, soft natural daylight, authentic and quiet.",
  },
  {
    name: "camping-duinzicht",
    prompt:
      "Aspect ratio 4:3. Camping pitches on short grass with a clear view of sandy dunes covered in marram grass, " +
      "bright clear coastal light, a sense of sea air just beyond the dunes, fresh and airy.",
  },
  {
    name: "camping-rietkraag",
    prompt:
      "Aspect ratio 4:3. A waterside minicamping beside tall reeds and a calm narrow creek or inlet, still " +
      "reflective water, a couple of tents on the grassy bank, soft golden-hour light, tranquil and green.",
  },
];

const filtered = ONLY ? IMAGES.filter((i) => i.name === ONLY) : IMAGES;
if (ONLY && filtered.length === 0) {
  console.error(`\x1b[31mNo image named "${ONLY}".\x1b[0m  Available:`);
  IMAGES.forEach((i) => console.error(`    ${i.name}`));
  process.exit(1);
}

async function generateOne({ name, prompt }) {
  const outPath = path.join(OUTPUT_DIR, `${name}.png`);
  if (fs.existsSync(outPath) && !FORCE) {
    console.log(`\x1b[90mskip (exists): ${name}.png\x1b[0m`);
    return { name, status: "skip" };
  }
  console.log(`\x1b[36mgenerating: ${name}\x1b[0m`);
  const t0 = Date.now();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-image-preview",
      contents: `${BRAND}\n\n${prompt}`,
    });
    const part = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
    if (!part) {
      console.warn(`\x1b[33m  no image data returned for ${name}\x1b[0m`);
      return { name, status: "empty" };
    }
    const buffer = Buffer.from(part.inlineData.data, "base64");
    fs.writeFileSync(outPath, buffer);
    const kb = (buffer.length / 1024).toFixed(0);
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`\x1b[32msaved: ${name}.png  (${kb} KB, ${secs}s)\x1b[0m`);
    return { name, status: "ok" };
  } catch (err) {
    console.error(`\x1b[31mfailed: ${name}  ${err.message}\x1b[0m`);
    return { name, status: "error" };
  }
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`\nGenerating ${filtered.length} image${filtered.length === 1 ? "" : "s"} into:`);
  console.log(`  ${path.relative(PROJECT_ROOT, OUTPUT_DIR)}/\n`);

  const results = [];
  for (const img of filtered) {
    results.push(await generateOne(img));
  }

  const ok = results.filter((r) => r.status === "ok").length;
  const skip = results.filter((r) => r.status === "skip").length;
  const fail = results.filter((r) => r.status !== "ok" && r.status !== "skip").length;
  console.log(`\n\x1b[1mDone:\x1b[0m ${ok} generated, ${skip} skipped, ${fail} failed.\n`);
  if (fail > 0) process.exit(1);
}

main();
