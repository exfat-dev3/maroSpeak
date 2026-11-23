const textInput = document.getElementById("textInput");
const language = document.getElementById("language");
const quality = document.getElementById("quality");

const generateBtn = document.getElementById("generateBtn");
const generateText = document.getElementById("generateText");
const generateIcon = document.getElementById("generateIcon");

const clearBtn = document.getElementById("clearBtn");
const charCount = document.getElementById("charCount");

const status = document.getElementById("status");
const qualityDescription = document.getElementById("qualityDescription");

const playerPanel = document.getElementById("playerPanel");
const audioPlayer = document.getElementById("audioPlayer");
const audioInfo = document.getElementElementById
  ? document.getElementElementById("audioInfo")
  : document.getElementById("audioInfo");

const downloadBtn = document.getElementById("downloadBtn");

let originalBuffer = null;
let processedBuffer = null;
let currentBlobUrl = null;
let generatedBlob = null;

/* ==========================
   Quality descriptions
========================== */

const descriptions = {
  normal: "Google TTSの元音声をそのまま再生します。",
  smooth: "声のハスキーさや耳に刺さるザラつきを抑え、滑らかな音に調整します。",
  clear: "音声の輪郭と明瞭感を軽く強調します。"
};

quality.addEventListener("change", () => {
  qualityDescription.textContent = descriptions[quality.value];
});

/* ==========================
   Character counter
========================== */

textInput.addEventListener("input", () => {
  charCount.textContent = `${textInput.value.length} / 2000`;
});

/* ==========================
   Clear
========================== */

clearBtn.addEventListener("click", () => {
  textInput.value = "";
  charCount.textContent = "0 / 2000";

  status.textContent = "";
  status.className = "status";

  playerPanel.classList.add("hidden");

  audioPlayer.pause();
  audioPlayer.removeAttribute("src");
  audioPlayer.load();

  originalBuffer = null;
  processedBuffer = null;
  generatedBlob = null;

  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }
});

/* ==========================
   Generate audio
========================== */

generateBtn.addEventListener("click", generateAudio);

async function generateAudio() {
  const text = textInput.value.trim();

  if (!text) {
    showStatus("テキストを入力してください。", "error");
    textInput.focus();
    return;
  }

  setLoading(true);
  showStatus("音声を生成しています...", "loading");
  playerPanel.classList.add("hidden");

  try {
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text,
        lang: language.value,
        slow: false
      })
    });

    if (!response.ok) {
      let errorMessage = "音声生成に失敗しました。";

      try {
        const errorData = await response.json();
        if (errorData.error) errorMessage = errorData.error;
      } catch {}

      throw new Error(errorMessage);
    }

    const mp3Blob = await response.blob();

    const arrayBuffer = await mp3Blob.arrayBuffer();

    const audioContext = new AudioContext();

    originalBuffer = await audioContext.decodeAudioData(arrayBuffer);

    await audioContext.close();

    await updateAudio();

    playerPanel.classList.remove("hidden");

    showStatus("音声生成が完了しました！", "success");

  } catch (error) {
    console.error(error);
    showStatus(error.message || "エラーが発生しました。", "error");
  } finally {
    setLoading(false);
  }
}

/* ==========================
   Audio processing
========================== */

async function updateAudio() {
  if (!originalBuffer) return;

  const mode = quality.value;

  // 標準は原音を使う
  if (mode === "normal") {
    processedBuffer = originalBuffer;
    generatedBlob = null;

    setPlayerSource(originalBuffer);

    audioInfo.textContent = "標準音質・オリジナル音声";

    return;
  }

  showStatus("音質を調整しています...", "loading");

  processedBuffer = await processAudio(originalBuffer, mode);

  generatedBlob = bufferToWav(processedBuffer);

  setPlayerSource(processedBuffer);

  audioInfo.textContent =
    mode === "smooth"
      ? "くっきり・ハスキー感軽減"
      : "クリア・明瞭度調整";
}

/* ==========================
   Offline audio effects
========================== */

async function processAudio(inputBuffer, mode) {
  const sampleRate = inputBuffer.sampleRate;

  const offline = new OfflineAudioContext(
    inputBuffer.numberOfChannels,
    inputBuffer.length,
    sampleRate
  );

  const source = offline.createBufferSource();
  source.buffer = inputBuffer;

  let lastNode = source;

  // 低周波ノイズ・不要な低音を整理
  const highpass = offline.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = mode === "smooth" ? 90 : 70;
  highpass.Q.value = 0.707;

  lastNode.connect(highpass);
  lastNode = highpass;

  if (mode === "smooth") {
    // 中高域の耳障りな粗さを控えめに抑える
    const smoothEQ = offline.createBiquadFilter();
    smoothEQ.type = "peaking";
    smoothEQ.frequency.value = 3400;
    smoothEQ.Q.value = 0.85;
    smoothEQ.gain.value = -3.5;

    lastNode.connect(smoothEQ);
    lastNode = smoothEQ;

    // 高域を少しだけ丸める
    const highShelf = offline.createBiquadFilter();
    highShelf.type = "highshelf";
    highShelf.frequency.value = 7500;
    highShelf.gain.value = -2.0;

    lastNode.connect(highShelf);
    lastNode = highShelf;

    // 強い音のピークを穏やかにする
    const compressor = offline.createDynamicsCompressor();
    compressor.threshold.value = -22;
    compressor.knee.value = 18;
    compressor.ratio.value = 2.3;
    compressor.attack.value = 0.008;
    compressor.release.value = 0.16;

    lastNode.connect(compressor);
    lastNode = compressor;
  }

  if (mode === "clear") {
    // 明瞭感を少し出す
    const presence = offline.createBiquadFilter();
    presence.type = "peaking";
    presence.frequency.value = 2600;
    presence.Q.value = 0.8;
    presence.gain.value = 1.6;

    lastNode.connect(presence);
    lastNode = presence;

    const clarityShelf = offline.createBiquadFilter();
    clarityShelf.type = "highshelf";
    clarityShelf.frequency.value = 6500;
    clarityShelf.gain.value = 1.0;

    lastNode.connect(clarityShelf);
    lastNode = clarityShelf;
  }

  // 音量を整える
  const gain = offline.createGain();
  gain.gain.value = 1.0;

  lastNode.connect(gain);
  gain.connect(offline.destination);

  source.start(0);

  return await offline.startRendering();
}

/* ==========================
   Player source
========================== */

function setPlayerSource(buffer) {
  const blob = bufferToWav(buffer);

  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
  }

  currentBlobUrl = URL.createObjectURL(blob);

  audioPlayer.src = currentBlobUrl;
  audioPlayer.load();
}

/* ==========================
   WAV encoder
========================== */

function bufferToWav(audioBuffer) {
  const channels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const frames = audioBuffer.length;

  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;

  const dataSize = frames * channels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeString(offset, str) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");

  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, bitDepth, true);

  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;

  for (let i = 0; i < frames; i++) {
    for (let channel = 0; channel < channels; channel++) {
      let sample = audioBuffer.getChannelData(channel)[i];

      sample = Math.max(-1, Math.min(1, sample));

      const value = sample < 0
        ? sample * 32768
        : sample * 32767;

      view.setInt16(offset, value, true);
      offset += 2;
    }
  }

  return new Blob([buffer], {
    type: "audio/wav"
  });
}

/* ==========================
   Download
========================== */

downloadBtn.addEventListener("click", () => {
  if (!originalBuffer) return;

  const blob = quality.value === "normal"
    ? bufferToWav(originalBuffer)
    : generatedBlob || bufferToWav(processedBuffer);

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "maroSpeak.wav";
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

/* ==========================
   UI helpers
========================== */

function showStatus(message, type = "") {
  status.textContent = message;
  status.className = `status ${type}`;
}

function setLoading(loading) {
  generateBtn.disabled = loading;

  if (loading) {
    generateText.textContent = "生成中...";
    generateIcon.textContent = "⏳";
  } else {
    generateText.textContent = "音声を生成";
    generateIcon.textContent = "♫";
  }
}
