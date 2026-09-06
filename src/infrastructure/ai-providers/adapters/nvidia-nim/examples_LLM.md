### Option 1: Using the official `openai` SDK (Recommended)

```javascript
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY || '$NVIDIA_API_KEY',
  baseURL: 'https://integrate.api.nvidia.com/v1',
});

async function main() {
  const completion = await openai.chat.completions.create({
    model: "deepseek-ai/deepseek-v4-pro-0813",
    messages: [{ "role": "user", "content": "Write a limerick about the wonders of GPU computing." }],
    temperature: 1,
    top_p: 0.95,
    max_tokens: 16384,
    seed: 42,
    chat_template_kwargs: { "thinking": false },
    stream: false
  });
   
  process.stdout.write(completion.choices[0]?.message?.content || '');
}

main();

```

---

### Option 2: Using native `fetch` (`curl` style)

```javascript
async function main() {
  const url = 'https://integrate.api.nvidia.com/v1/chat/completions';
  const apiKey = process.env.NVIDIA_API_KEY || '$NVIDIA_API_KEY';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "deepseek-ai/deepseek-v4-pro-0813",
      messages: [{ "role": "user", "content": "Write a limerick about the wonders of GPU computing." }],
      temperature: 1,
      top_p: 0.95,
      max_tokens: 16384,
      seed: 42,
      chat_template_kwargs: { "thinking": false },
      stream: false
    })
  });

  const data = await response.json();
  console.log(data.choices[0]?.message?.content || '');
}

main();

```

---

### Option 3: Using `axios` (Multimodal & Streaming support)

```javascript
import axios from 'axios';

const invokeUrl = "https://integrate.api.nvidia.com/v1/chat/completions";
const stream = true;
const apiKey = process.env.NVIDIA_API_KEY || "$NVIDIA_API_KEY";

const headers = {
  "Authorization": `Bearer ${apiKey}`,
  "Accept": stream ? "text/event-stream" : "application/json"
};

async function main() {
  const payload = {
    model: "moonshotai/kimi-k3",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "What is in this image?" },
          { 
            type: "image_url", 
            image_url: { "url": "https://assets.ngc.nvidia.com/products/api-catalog/phi-3-5-vision/example1b.jpg" } 
          }
        ]
      }
    ],
    max_tokens: 16384,
    seed: 0,
    stream: stream,
    temperature: 1,
    reasoning_effort: "max"
  };

  const response = await axios.post(invokeUrl, payload, {
    headers: headers,
    responseType: stream ? 'stream' : 'json'
  });

  if (stream) {
    response.data.on('data', (chunk) => {
      console.log(chunk.toString());
    });
  } else {
    console.log(JSON.stringify(response.data));
  }
}

main().catch(error => {
  if (error.response) {
    console.error(`HTTP ${error.response.status}`);
    if (error.response.data?.on) {
      error.response.data.on('data', (chunk) => console.error(chunk.toString()));
    } else {
      console.error(error.response.data);
    }
  } else {
    console.error(error);
  }
});

```

---

### Option 4: Using `@langchain/nvidia-ai-endpoints`

#### Chat Completion Model (`ChatNVIDIA`)

```javascript
import { ChatNVIDIA } from "@langchain/nvidia-ai-endpoints";

async function main() {
  const model = new ChatNVIDIA({
    model: "deepseek-ai/deepseek-v4-pro-0813",
    apiKey: process.env.NVIDIA_API_KEY || '$NVIDIA_API_KEY',
    temperature: 1,
    topP: 0.95,
    maxTokens: 16384,
  });

  const response = await model.invoke([
    ["user", "Write a limerick about the wonders of GPU computing."]
  ]);

  console.log(response.content);
}

main();

```
