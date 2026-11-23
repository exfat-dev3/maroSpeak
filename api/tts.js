import googleTTS from "google-tts-api";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "POST only"
    });
  }

  try {
    const { text, lang = "ja" } = req.body || {};

    if (!text || typeof text !== "string") {
      return res.status(400).json({
        error: "テキストを入力してください"
      });
    }

    if (text.length > 5000) {
      return res.status(400).json({
        error: "文字数は5000文字以内にしてください"
      });
    }

    const chunks = googleTTS.getAllAudioUrls(text, {
      lang,
      slow: false,
      host: "https://translate.google.com"
    });

    const audioBuffers = [];

    for (const chunk of chunks) {
      const response = await fetch(chunk.url);

      if (!response.ok) {
        throw new Error("Google TTSから音声を取得できませんでした");
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      audioBuffers.push(buffer);
    }

    const mp3 = Buffer.concat(audioBuffers);

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Disposition", 'inline; filename="maroSpeak.mp3"');
    res.setHeader("Cache-Control", "no-store");

    return res.status(200).send(mp3);
  } catch (error) {
    console.error("maroSpeak TTS Error:", error);

    return res.status(500).json({
      error: "音声生成に失敗しました。時間をおいて再試行してください。"
    });
  }
}
