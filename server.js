import { createReadStream, existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { createServer } from "node:http";

loadDotEnv();

const root = process.cwd();
const port = Number(process.env.PORT || 5173);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (request.method === "POST" && url.pathname === "/api/suggest-title") {
      await handleSuggestTitle(request, response);
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      sendJson(response, 405, { error: "Method not allowed." });
      return;
    }

    serveStatic(url.pathname, response);
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: "Server error." });
  }
}).listen(port, () => {
  console.log(`SharedSpace running at http://localhost:${port}`);
});

async function handleSuggestTitle(request, response) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    sendJson(response, 503, {
      error: "OPENAI_API_KEY is not set on the local server."
    });
    return;
  }

  const body = await readJsonBody(request);
  const prompt = buildTitlePrompt(body);
  const content = [{ type: "input_text", text: prompt }];

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
      input: [
        {
          role: "user",
          content
        }
      ],
      max_output_tokens: 30
    })
  });

  const data = await openAiResponse.json();
  if (!openAiResponse.ok) {
    sendJson(response, openAiResponse.status, {
      error: data?.error?.message || "OpenAI title generation failed."
    });
    return;
  }

  const title = sanitizeTitle(data.output_text || extractOutputText(data));
  if (!title) {
    sendJson(response, 502, { error: "The model did not return a title." });
    return;
  }

  sendJson(response, 200, { title });
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

function serveStatic(pathname, response) {
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const safePath = normalize(relativePath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(root, safePath);

  if (!filePath.startsWith(root) || !existsSync(filePath)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("File not found");
    return;
  }

  const contentType = mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream";
  response.writeHead(200, { "Content-Type": contentType });
  createReadStream(filePath).pipe(response);
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body too large."));
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

function extractOutputText(response) {
  return (response.output || [])
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

function loadDotEnv() {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const index = trimmed.indexOf("=");
    if (index === -1) return;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  });
}
