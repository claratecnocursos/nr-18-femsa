/**
 * Gera arquivos MP3 de narração via ElevenLabs a partir do manifesto.
 *
 * Requisitos:
 *   - Node.js 18+
 *   - Variável ELEVENLABS_API_KEY no ambiente ou em .env
 *
 * Uso:
 *   node audio-data.js
 *   node generate-audios.js
 *   node generate-audios.js --resume
 *   node generate-audios.js --slide=s2
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildManifest, writeManifest, MANIFEST_PATH, OUTPUT_DIR } = require('./audio-data');

const DEFAULT_MODEL = 'eleven_multilingual_v2';
const DEFAULT_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'Xb7hH8MSUJpSbSDYk0k2';
const HASH_PATH = path.join(OUTPUT_DIR, '.text-hashes.json');

function loadEnvFile() {
  for (const filename of ['.env', '.env.local']) {
    const envPath = path.join(__dirname, filename);
    if (!fs.existsSync(envPath)) continue;
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

function parseArgs(argv) {
  const options = { resume: false, slide: null, dryRun: false };
  for (const arg of argv) {
    if (arg === '--resume') options.resume = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg.startsWith('--slide=')) options.slide = arg.slice('--slide='.length);
  }
  return options;
}

function hashText(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function loadHashes() {
  if (!fs.existsSync(HASH_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(HASH_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveHashes(hashes) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(HASH_PATH, JSON.stringify(hashes, null, 2), 'utf8');
}

async function synthesize(text, apiKey, voiceId) {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: process.env.ELEVENLABS_MODEL || DEFAULT_MODEL,
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.8,
        style: 0.2,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`ElevenLabs ${response.status}: ${details}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  loadEnvFile();
  const options = parseArgs(process.argv.slice(2));
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;

  if (!apiKey && !options.dryRun) {
    console.error('Erro: defina ELEVENLABS_API_KEY no ambiente ou em .env');
    process.exit(1);
  }

  const manifest = buildManifest();
  writeManifest(manifest, MANIFEST_PATH);

  let slides = manifest.slides;
  if (options.slide) {
    slides = slides.filter((slide) => slide.id === options.slide);
    if (!slides.length) {
      console.error(`Slide não encontrado no manifesto: ${options.slide}`);
      process.exit(1);
    }
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const hashes = loadHashes();

  console.log(`Gerando ${slides.length} áudio(s) em ${OUTPUT_DIR}`);

  for (const slide of slides) {
    const outputPath = path.join(__dirname, slide.file);
    const textHash = hashText(slide.text);
    const unchanged =
      options.resume &&
      fs.existsSync(outputPath) &&
      hashes[slide.id] === textHash;

    if (unchanged) {
      console.log(`↷ ${slide.id} — sem alterações, pulando`);
      continue;
    }

    if (options.dryRun) {
      console.log(`• ${slide.id} → ${slide.file} (${slide.text.length} chars)`);
      continue;
    }

    process.stdout.write(`▶ ${slide.id}... `);
    try {
      const audio = await synthesize(slide.text, apiKey, voiceId);
      fs.writeFileSync(outputPath, audio);
      hashes[slide.id] = textHash;
      saveHashes(hashes);
      console.log('ok');
    } catch (error) {
      console.log('falhou');
      console.error(`  ${error.message}`);
      process.exitCode = 1;
      break;
    }
  }

  if (!process.exitCode) {
    console.log('Concluído.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
