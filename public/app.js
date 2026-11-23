const $ = (id) => document.getElementById(id);

const engine = $("engine");
const textInput = $("textInput");
const generateBtn = $("generateBtn");
const status = $("status");
const playerPanel = $("playerPanel");
const audio = $("audio");

let currentBlob = null;
let currentURL = null;

let audioContext = null;
let sourceNode = null;
let lowFilter = null;
let midFilter = null;
let highFilter = null;
let gainNode = null;
let graphConnected = false;

// 文字数
textInput.addEventListener("input", () => {
  $("count").textContent = `${textInput.value.length}文字`;
});

// エンジン選択
engine.addEventListener("change", () => {
  if (engine.value === "aquestalk") {
    $("engineNotice").textContent =
      "AquesTalkエンジンは未接続です。Google TTSを選択してください。";
    status.textContent = "AquesTalkはまだ使用できません";
    generateBtn.disabled = true;
  } else {
    $("engineNotice").textContent = "Google TTSを使用します。";
    status.textContent = "テキストを入力してね";
    generateBtn.disabled = false;
  }
});

// 音質モードUI
document.querySelectorAll(".quality-option").forEach((option) => {
  option.addEventListener("click", () => {
    document.querySelectorAll(".quality-option").forEach((el) => {
      el.classList.remove("selected");
    });

    option.classList.add("selected");
    option.querySelector("input").checked = true;

    applyQuality();
  });
});

// 音声グラフを作成
function setupAudioGraph() {
  if (graphConnected) return;

  audioContext = new (window.AudioContext || window.webkitAudioContext)();

  sourceNode = audioContext.createMediaElementSource(audio);

  lowFilter = audioContext.createBiquadFilter();
  lowFilter.type = "lowshelf";
  lowFilter.frequency.value = 180;

  midFilter = audioContext.createBiquadFilter();
  midFilter.type = "peaking";
  midFilter.frequency.value = 2800;
  midFilter.Q.value = 0.8;

  highFilter = audioContext.createBiquadFilter();
  highFilter.type = "highshelf";
  highFilter.frequency.value = 6000;

  gainNode = audioContext.createGain();

  sourceNode.connect(lowFilter);
  lowFilter.connect(midFilter);
  midFilter.connect(highFilter);
  highFilter.connect(gainNode);
  gainNode.connect(audioContext.destination);

  graphConnected = true;
}

// 音質調整
function applyQuality() {
  if (!graphConnected) return;

  const mode = document.querySelector(
    'input[name="quality"]:checked'
  ).value;

  // Default
  lowFilter.gain.value = 0;
  midFilter.gain.value = 0;
  highFilter.gain.value = 0;
  gainNode.gain.value = 1;

  if (mode === "linear") {
    // くっきり (Linear)
    lowFilter.gain.value = -1.5;
    midFilter.gain.value = 2.0;
    highFilter.gain.value = 1.8;
    gainNode.gain.value = 0.95;
  }

  if (mode === "clear") {
    // クリア
    lowFilter.gain.value = -3.5;
    midFilter.gain.value = 2.5;
    highFilter.gain.value = 1.0;
    gainNode.gain.value = 1.0;
  }
}

// 読み上げ生成
generateBtn.addEventListener("click", async () => {
  const text = textInput.value.trim();

  if (!text) {
    status.textContent = "テキストを入力してください";
    return;
  }

  if (engine.value !== "google") {
    status.textContent = "利用可能なエンジンを選択してください";
    return;
  }

  generateBtn.disabled = true;
  generateBtn.innerHTML = "⏳ 音声を生成中...";
  status.textContent = "Google TTSに接続しています...";

  try {
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text,
        lang: "ja"
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "音声生成に失敗しました");
    }

    currentBlob = await response.blob();

    if (currentURL) {
      URL.revokeObjectURL(currentURL);
    }

    currentURL = URL.createObjectURL(currentBlob);
    audio.src = currentURL;

    playerPanel.classList.remove("hidden");
    $("audioMode").textContent = "Google TTS · 日本語";

    setupAudioGraph();
    applyQuality();

    await audioContext.resume();

    audio.load();
    await audio.play();

    status.textContent = "音声生成完了！";
  } catch (error) {
    console.error(error);
    status.textContent = error.message || "エラーが発生しました";
  } finally {
    generateBtn.disabled = false;
    generateBtn.innerHTML = "<span>▶</span> 読み上げ";
  }
});

// 停止
$("stopBtn").addEventListener("click", () => {
  audio.pause();
  audio.currentTime = 0;
  status.textContent = "停止しました";
});

// MP3ダウンロード
$("downloadBtn").addEventListener("click", () => {
  if (!currentBlob) return;

  const link = document.createElement("a");
  link.href = currentURL;
  link.download = "maroSpeak.mp3";
  link.click();
});

// 再生終了
audio.addEventListener("ended", () => {
  status.textContent = "再生完了";
});
