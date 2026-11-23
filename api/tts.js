const googleTTS = require("google-tts-api");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { text, lang = "ja", slow = false } = req.body || {};

    if (!text || !text.trim()) {
      return res.status(400).json({
        error: "テキストを入力してください"
      });
    }

    if (text.length > 2000) {
      return res.status(400).json({
        error: "テキストは2000文字以内にしてください"
      });
    }

    const urls = await googleTTS.getAllAudioUrls(text, {
      lang,
      slow,
      host: "https://translate.google.com"
    });

    const buffers = [];

    for (const item of urls) {
      const response = await fetch(item.url);

      if (!response.ok) {
        throw new Error("音声生成に失敗しました");
      }

      const buffer = Buffer.from(
        await response.arrayBuffer()
      );

      buffers.push(buffer);
    }

    const audio = Buffer.concat(buffers);

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");

    return res.status(200).send(audio);

  } catch (error) {
    console.error("TTS Error:", error);

    return res.status(500).json({
      error: "音声生成に失敗しました",
      details: error.message
    });
  }
};
