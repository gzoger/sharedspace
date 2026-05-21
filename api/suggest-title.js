export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed." });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    response.status(503).json({ error: "OPENAI_API_KEY is not set on the server." });
    return;
  }

  const body = request.body || {};
  const content = [{ type: "input_text", text: buildTitlePrompt(body) }];

  if (isHttpUrl(body.thumbnailUrl)) {
    content.push({
      type: "input_image",
      image_url: body.thumbnailUrl,
      detail: "low"
    });
  }

  const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_TITLE_MODEL || "gpt-4.1-nano",
      input: [{ role: "user", content }],
      max_output_tokens: 30
    })
  });

  const data = await openAiResponse.json();
  if (!openAiResponse.ok) {
    response.status(openAiResponse.status).json({
      error: data?.error?.message || "OpenAI title generation failed."
    });
    return;
  }

  const title = sanitizeTitle(data.output_text || extractOutputText(data));
  if (!title) {
    response.status(502).json({ error: "The model did not return a title." });
    return;
  }

  response.status(200).json({ title });
}

function buildTitlePrompt(data) {
  return `
Suggest one short title for this saved video item.

Rules:
- Return only the title, no quotes, no explanation.
- Fewer than six words.
- Conservative, simple, literal.
- If a clean title already exists in the provided title, description, transcript, filename, URL, or screenshot, use that.
- Do not make it catchy or poetic.
- Describe exactly what the video/data is.

Data:
Current title: ${clean(data.title)}
Platform: ${clean(data.platform)}
URL: ${clean(data.sourceUrl)}
File name: ${clean(data.fileName)}
Transcript excerpt: ${clip(data.transcript, 1600)}
Notes/description: ${clip(data.notes, 900)}
`.trim();
}

function extractOutputText(apiResponse) {
  return (apiResponse.output || [])
    .flatMap((item) => item.content || [])
    .map((content) => content.text || "")
    .join(" ");
}

function sanitizeTitle(value) {
  return clean(value)
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/[.!?]+$/g, "")
    .split(/\s+/)
    .slice(0, 5)
    .join(" ");
}

function clip(value, limit) {
  return clean(value).slice(0, limit);
}

function clean(value) {
  return String(value || "").trim();
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(clean(value));
}
