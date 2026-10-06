import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 0. Ensure user is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized: Missing authentication token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Setup keys & determine providers
    const groqApiKey = Deno.env.get("GROQ_API_KEY");
    const openAiApiKey = Deno.env.get("OPENAI_API_KEY");

    if (!groqApiKey && !openAiApiKey) {
      throw new Error("Missing API key: either GROQ_API_KEY or OPENAI_API_KEY must be configured");
    }

    const contentType = req.headers.get("content-type") || "";

    // ── Path A: Direct Transcript JSON (Fast Path for Existing Captions) ──
    if (contentType.includes("application/json")) {
      const body = await req.json();
      const { action, transcript, provider: requestedProvider } = body;

      const useOpenAiChat = requestedProvider === "openai"
        ? true
        : requestedProvider === "groq"
          ? false
          : !groqApiKey && Boolean(openAiApiKey);
      const chatUrl = useOpenAiChat
        ? "https://api.openai.com/v1/chat/completions"
        : "https://api.groq.com/openai/v1/chat/completions";
      const chatKey = useOpenAiChat ? openAiApiKey : groqApiKey;
      const groqChatModel = (body.chatModel as string) || Deno.env.get("GROQ_CHAT_MODEL") || "openai/gpt-oss-120b";
      const chatModel = useOpenAiChat ? "gpt-4o-mini" : groqChatModel;


      if (action === "generate-chapters") {
        if (!Array.isArray(transcript) || transcript.length === 0) {
          throw new Error("Missing or empty transcript in request body");
        }

        const formattedTranscript = transcript
          .map((item: any) => `[${Math.round(item.startMs / 1000)}s - ${Math.round(item.endMs / 1000)}s]: ${item.text}`)
          .join("\n");

        const chatResponse = await fetch(chatUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${chatKey}`,
          },
          body: JSON.stringify({
            model: chatModel,
            response_format: { type: "json_object" },
            messages: [
              {
                role: "system",
                content: `You are an expert video editor. Analyze the timestamped transcript and identify logical topic changes to generate clear, concise chapter titles (under 6 words each). The first chapter MUST start at 0 (timeMs: 0). Generate an appropriate number of chapters (3-5 for short videos under 3 minutes, 5-10 for longer videos). Return a JSON object with a single "chapters" array containing: [{ "timeMs": number, "title": string }].`,
              },
              {
                role: "user",
                content: `Here is the transcript:\n\n${formattedTranscript}`,
              },
            ],
          }),
        });

        if (!chatResponse.ok) {
          const errorText = await chatResponse.text();
          throw new Error(`Chat API error (${useOpenAiChat ? "OpenAI" : "Groq"}): ${chatResponse.status} ${errorText}`);
        }

        const chatResult = await chatResponse.json();
        const parsed = JSON.parse(chatResult.choices[0].message.content);
        const rawChapters = parsed.chapters || [];

        const chapters = rawChapters.map((ch: any, idx: number) => ({
          id: crypto.randomUUID(),
          timeMs: idx === 0 ? 0 : Math.max(0, Math.round(ch.timeMs)),
          title: (ch.title || `Chapter ${idx + 1}`).trim(),
        }));

        const usage = chatResult.usage
          ? {
              provider: useOpenAiChat ? "openai" : "groq",
              model: chatModel,
              promptTokens: chatResult.usage.prompt_tokens,
              completionTokens: chatResult.usage.completion_tokens,
              totalTokens: chatResult.usage.total_tokens,
            }
          : undefined;

        return new Response(JSON.stringify({ success: true, chapters, usage }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: false, error: `Invalid or unknown action: ${action}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Path B: Multipart Audio Upload (Whisper Transcription & Optional Chapters) ──
    const formData = await req.formData();
    const fileData = formData.get("file") as File;
    const targetLanguage = formData.get("targetLanguage") as string;
    const generateChapters = formData.get("generateChapters") === "true";
    const requestedProvider = formData.get("provider") as string;

    if (!fileData) {
      throw new Error("Missing audio file in request");
    }

    // Routing rules:
    // Transcription: Groq whisper-large-v3-turbo if GROQ_API_KEY present (unless overridden to openai), else OpenAI whisper-1
    const useGroqTranscription = requestedProvider === "openai"
      ? false
      : Boolean(groqApiKey);

    // Translation & Chapters: Groq if GROQ_API_KEY present (unless overridden to openai), else OpenAI gpt-4o-mini
    const useOpenAiChat = requestedProvider === "openai"
      ? true
      : requestedProvider === "groq"
        ? false
        : !groqApiKey && Boolean(openAiApiKey);
    const chatUrl = useOpenAiChat
      ? "https://api.openai.com/v1/chat/completions"
      : "https://api.groq.com/openai/v1/chat/completions";
    const chatKey = useOpenAiChat ? openAiApiKey : groqApiKey;
    const groqChatModel = (formData.get("chatModel") as string) || Deno.env.get("GROQ_CHAT_MODEL") || "openai/gpt-oss-120b";
    const chatModel = useOpenAiChat ? "gpt-4o-mini" : groqChatModel;

    // Call Whisper API for timestamped transcription
    const transcriptionUrl = useGroqTranscription
      ? "https://api.groq.com/openai/v1/audio/transcriptions"
      : "https://api.openai.com/v1/audio/transcriptions";
    const transcriptionKey = useGroqTranscription ? groqApiKey : openAiApiKey;
    const transcriptionModel = useGroqTranscription ? "whisper-large-v3-turbo" : "whisper-1";

    const prompt = (formData.get("prompt") as string) || "Reco is a screen recording and video editing app.";

    const whisperFormData = new FormData();
    whisperFormData.append("file", fileData, "audio.m4a");
    whisperFormData.append("model", transcriptionModel);
    whisperFormData.append("prompt", prompt);
    whisperFormData.append("response_format", "verbose_json");
    whisperFormData.append("timestamp_granularities[]", "word");
    whisperFormData.append("timestamp_granularities[]", "segment");

    const whisperResponse = await fetch(transcriptionUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${transcriptionKey}`,
      },
      body: whisperFormData,
    });

    if (!whisperResponse.ok) {
      const errorText = await whisperResponse.text();
      throw new Error(`Whisper API error (${useGroqTranscription ? "Groq" : "OpenAI"}): ${whisperResponse.status} ${errorText}`);
    }

    const whisperResult = await whisperResponse.json();
    let segments = whisperResult.segments || [];

    // Filter out hallucinated or silent segments
    const stockPhrases = ["thank you", "thanks for watching", "bye", "you"];
    segments = segments.filter((seg: any) => {
      const duration = (seg.end ?? 0) - (seg.start ?? 0);
      const isHighNoSpeechProb = typeof seg.no_speech_prob === "number" && seg.no_speech_prob > 0.6;
      const isLowConfidenceLongDuration = typeof seg.avg_logprob === "number" && seg.avg_logprob < -0.5 && duration > 10;
      
      const normalizedText = (seg.text || "").trim().toLowerCase().replace(/[.,!?;:\"'-]/g, "");
      const isStockHallucination = stockPhrases.includes(normalizedText) && duration > 5;

      return !isHighNoSpeechProb && !isLowConfidenceLongDuration && !isStockHallucination;
    });

    if (segments.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        noSpeechDetected: true,
        transcriptionProvider: useGroqTranscription ? "groq" : "openai",
        transcriptionModel,
        cues: [], 
        chapters: [],
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Optional translation via Chat Completions
    let translationUsage: any = undefined;
    if (targetLanguage && targetLanguage !== "auto" && targetLanguage !== whisperResult.language) {
      const translationPayload = segments.map((seg: any) => ({
        id: seg.id,
        text: seg.text,
      }));

      const chatResponse = await fetch(chatUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${chatKey}`,
        },
        body: JSON.stringify({
          model: chatModel,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `You are a subtitle translator. Translate the following JSON array of subtitle segments into ${targetLanguage}. Maintain the exact JSON structure and array length. Return a JSON object with a single "segments" property containing the translated array.`,
            },
            {
              role: "user",
              content: JSON.stringify({ segments: translationPayload }),
            },
          ],
        }),
      });

      if (!chatResponse.ok) {
        const errorText = await chatResponse.text();
        throw new Error(`Chat API error (${useOpenAiChat ? "OpenAI" : "Groq"}): ${chatResponse.status} ${errorText}`);
      }

      const chatResult = await chatResponse.json();
      if (chatResult.usage) {
        translationUsage = {
          provider: useOpenAiChat ? "openai" : "groq",
          model: chatModel,
          promptTokens: chatResult.usage.prompt_tokens,
          completionTokens: chatResult.usage.completion_tokens,
          totalTokens: chatResult.usage.total_tokens,
        };
        console.log("Translation Token Usage:", JSON.stringify(translationUsage));
      }

      const translatedContent = JSON.parse(chatResult.choices[0].message.content);
      const translatedSegments = translatedContent.segments || [];

      segments = segments.map((seg: any) => {
        const translatedSeg = translatedSegments.find((t: any) => t.id === seg.id);
        return {
          ...seg,
          text: translatedSeg ? translatedSeg.text : seg.text,
        };
      });
    }

    // Convert segments to CaptionCue format
    const cues = segments.map((seg: any) => ({
      id: crypto.randomUUID(),
      startMs: Math.round(seg.start * 1000),
      endMs: Math.round(seg.end * 1000),
      text: seg.text.trim(),
      words: seg.words
        ? seg.words.map((w: any) => ({
            text: w.word.trim(),
            startMs: Math.round(w.start * 1000),
            endMs: Math.round(w.end * 1000),
          }))
        : undefined,
    }));

    // Optional chapters generation if requested along with audio
    let chapters: any[] | undefined = undefined;
    let chapterUsage: any = undefined;
    if (generateChapters && segments.length > 0) {
      const formattedTranscript = segments
        .map((seg: any) => `[${Math.round(seg.start)}s - ${Math.round(seg.end)}s]: ${seg.text}`)
        .join("\n");

      const chapterChatResponse = await fetch(chatUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${chatKey}`,
        },
        body: JSON.stringify({
          model: chatModel,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `You are an expert video editor. Analyze the timestamped transcript and identify logical topic changes to generate clear, concise chapter titles (under 6 words each). The first chapter MUST start at 0 (timeMs: 0). Return a JSON object with a single "chapters" array containing: [{ "timeMs": number, "title": string }].`,
            },
            {
              role: "user",
              content: `Here is the transcript:\n\n${formattedTranscript}`,
            },
          ],
        }),
      });

      if (chapterChatResponse.ok) {
        const chapterResult = await chapterChatResponse.json();
        if (chapterResult.usage) {
          chapterUsage = {
            provider: useOpenAiChat ? "openai" : "groq",
            model: chatModel,
            promptTokens: chapterResult.usage.prompt_tokens,
            completionTokens: chapterResult.usage.completion_tokens,
            totalTokens: chapterResult.usage.total_tokens,
          };
        }
        const parsed = JSON.parse(chapterResult.choices[0].message.content);
        chapters = (parsed.chapters || []).map((ch: any, idx: number) => ({
          id: crypto.randomUUID(),
          timeMs: idx === 0 ? 0 : Math.max(0, Math.round(ch.timeMs)),
          title: (ch.title || `Chapter ${idx + 1}`).trim(),
        }));
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      noSpeechDetected: cues.length === 0,
      transcriptionProvider: useGroqTranscription ? "groq" : "openai",
      transcriptionModel,
      cues, 
      chapters,
      usage: (translationUsage || chapterUsage) ? { translation: translationUsage, chapters: chapterUsage } : undefined,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Edge Function Error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
