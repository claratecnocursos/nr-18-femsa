/**
 * Extrai o manifesto de narração a partir do index.html.
 *
 * Uso:
 *   node audio-data.js              → gera audios/manifest.json
 *   const { buildManifest } = require('./audio-data');
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = __dirname;
const HTML_PATH = path.join(ROOT, 'index.html');
const OUTPUT_DIR = path.join(ROOT, 'audios');
const MANIFEST_PATH = path.join(OUTPUT_DIR, 'manifest.json');

/** Textos customizados para slides com pouco conteúdo textual ou conteúdo dinâmico. */
const NARRATION_OVERRIDES = {
  s1:
    'Módulo de Treinamento. Segurança do Trabalho. NR-18 — Treinamento de Plataforma de Trabalho Aéreo. Capacitação e segurança na operação de Plataformas de Trabalho Aéreo, PTA.',
  s6:
    'Sumário. Conteúdo Programático. Módulo 1: Introdução e Conceitos Básicos. Módulo 2: Requisitos de Segurança, Inspeção e Manutenção. Módulo 3: Regras de Operação Segura e Riscos do Ambiente.',
  s2:
    'Apresentação. Bem-vindo ao Treinamento de Plataforma de Trabalho Aéreo, NR-18. Assista ao vídeo de introdução e avance quando concluir.',
  s3:
    'Equipamentos. Modelos de Plataformas Elevatórias Móveis de Trabalho. Visualize a imagem com os principais tipos: mastro, telescópica, tesoura e articulada.',
  s4:
    'Requisitos de Fornecimento e Manuais. Assista ao vídeo sobre inspeção antes da entrega, manuais no local de uso e avisos de segurança em português.',
  s7d: null, // montado a partir das perguntas do quiz
  s14:
    'Vídeo aula. Dispositivos de Segurança Obrigatórios. Assista ao vídeo e avance quando concluir.',
  s16:
    'Vídeo aula. A Inspeção Diária. Assista ao vídeo sobre os procedimentos de inspeção pré-uso da PEMT.',
  s20b:
    'Vídeo aula. Regras Estritas de Manutenção. Assista ao vídeo sobre manutenção preventiva e corretiva.',
  s22:
    'Vídeo aula. Regras de Movimentação Segura. Assista ao vídeo sobre as regras de movimentação segura da PEMT e avance quando concluir.',
  s22b:
    'Práticas proibidas na operação da PEMT. É vedado: a) o uso de pranchas, escadas e outros dispositivos que visem atingir maior altura ou distância sobre a mesma; b) a sua utilização como guindaste; c) a realização de qualquer trabalho sob condições climáticas que exponham trabalhadores a riscos; d) a operação de equipamento em situações que contrariem as especificações do fabricante quanto à velocidade do ar, inclinação da plataforma em relação ao solo e proximidade a redes de energia elétrica; e) o transporte de trabalhadores e materiais não relacionados aos serviços em execução.',
  s23:
    'Vídeo aula. Atenção ao Clima e ao Vento. Assista ao vídeo sobre os cuidados com condições climáticas e vento na operação da PEMT e avance quando concluir.',
  s24:
    'Vídeo aula. Redes Elétricas e Riscos Aéreos. Assista ao vídeo sobre os perigos de redes elétricas e riscos aéreos na operação da PEMT e avance quando concluir.',
  s25:
    'Segurança elétrica. Distância segura da rede elétrica. Atenção: recomenda-se uma distância mínima de 3 metros de qualquer rede elétrica. Siga as recomendações no manual do maquinário. Perigo, alta tensão.',
  s26: null, // montado a partir do deck do jogo Permitido ou Proibido
};

function cleanText(text) {
  return (text || '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSlideText(slide) {
  const clone = slide.cloneNode(true);
  clone
    .querySelectorAll('script, iframe, svg, .wave, button, style, .nav-btn, .zoom-btn')
    .forEach((el) => el.remove());

  const custom = slide.getAttribute('data-audio-text');
  if (custom) return cleanText(custom);

  let text = cleanText(clone.textContent || '');

  if (text.length < 40) {
    const iframeTitle = slide.querySelector('iframe[title]')?.getAttribute('title');
    const imgAlt = slide.querySelector('img[alt]')?.getAttribute('alt');
    const title = slide.querySelector('.slide-title')?.textContent;
    const parts = [title, iframeTitle, imgAlt].map(cleanText).filter(Boolean);
    if (parts.length) text = parts.join('. ');
  }

  return text;
}

function parseQuizQuestions(html) {
  const match = html.match(/const\s+q1_questions\s*=\s*(\[[\s\S]*?\n\s*\]);/);
  if (!match) return [];

  try {
    return Function(`"use strict"; return (${match[1]});`)();
  } catch {
    return [];
  }
}

function parseMod3BinaryDeck(html) {
  const match = html.match(/const\s+mod3BinaryDeck\s*=\s*(\[[\s\S]*?\n\s*\]);/);
  if (!match) return [];

  try {
    return Function(`"use strict"; return (${match[1]});`)();
  } catch {
    return [];
  }
}

function buildMod3Narration(deck) {
  if (!deck.length) {
    return 'Desafio do Módulo 3. Permitido ou Proibido. Decida se cada prática pode ou não ser realizada na operação da PEMT. Conclua o jogo para validar o módulo.';
  }

  const parts = [
    'Desafio do Módulo 3. Permitido ou Proibido. Decida se cada prática pode ou não ser realizada na operação da PEMT. Cinco situações sobre movimentação, clima e segurança elétrica.',
  ];

  deck.forEach((item, index) => {
    const answer = item.allowed ? 'Permitido' : 'Proibido';
    parts.push(`Situação ${index + 1}: ${cleanText(item.text)} Resposta correta: ${answer}. ${cleanText(item.tip)}`);
  });

  parts.push('Conclua o jogo para validar o módulo.');
  return parts.join(' ');
}

function buildQuizNarration(questions) {
  if (!questions.length) {
    return 'Quiz do Módulo 1. Responda às perguntas sobre os conceitos apresentados no módulo.';
  }

  const parts = [
    'Quiz do Módulo 1. Responda às três perguntas sobre os conceitos do módulo.',
  ];

  questions.forEach((item, index) => {
    parts.push(`Pergunta ${index + 1}: ${cleanText(item.q)}`);
    item.opts.forEach((opt, optIndex) => {
      parts.push(`Alternativa ${optIndex + 1}: ${cleanText(opt)}`);
    });
  });

  return parts.join(' ');
}

function slideTitle(slide) {
  const titleEl = slide.querySelector('.slide-title, .mod-intro-title, h1');
  return cleanText(titleEl?.textContent || slide.id);
}

function buildManifest(htmlPath = HTML_PATH) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const quizQuestions = parseQuizQuestions(html);
  const mod3Deck = parseMod3BinaryDeck(html);

  const slides = [...doc.querySelectorAll('#slides .slide')].map((slide, index) => {
    const id = slide.id || `slide-${index + 1}`;
    let text = NARRATION_OVERRIDES[id];

    if (text === null && id === 's7d') {
      text = buildQuizNarration(quizQuestions);
    } else if (text === null && id === 's26') {
      text = buildMod3Narration(mod3Deck);
    } else if (text === undefined) {
      text = extractSlideText(slide);
    }

    if (!text) {
      text = `Slide ${index + 1}. ${slideTitle(slide)}`;
    }

    return {
      index,
      id,
      title: slideTitle(slide),
      file: `audios/${id}.mp3`,
      text,
    };
  });

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: path.basename(htmlPath),
    audioDir: 'audios',
    slides,
  };
}

function writeManifest(manifest, outputPath = MANIFEST_PATH) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2), 'utf8');
  return outputPath;
}

if (require.main === module) {
  const manifest = buildManifest();
  const out = writeManifest(manifest);
  console.log(`Manifesto gerado: ${out}`);
  console.log(`${manifest.slides.length} slides encontrados.`);
  manifest.slides.forEach((slide) => {
    console.log(`  [${String(slide.index + 1).padStart(2, '0')}] ${slide.id} (${slide.text.length} chars)`);
  });
}

module.exports = {
  HTML_PATH,
  MANIFEST_PATH,
  OUTPUT_DIR,
  NARRATION_OVERRIDES,
  buildManifest,
  writeManifest,
  extractSlideText,
  cleanText,
};
