### Option 1: Using the official `openai` SDK (Recommended)

```javascript
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY,[cite: 1]
  baseURL: "https://integrate.api.nvidia.com/v1",[cite: 1]
});

async function main() {
  const response = await client.embeddings.create(
    {
      input: ["What is the civil caseload in South Dakota courts?"],[cite: 1]
      model: "nvidia/nemotron-3-embed-1b",[cite: 1]
      encoding_format: "float",[cite: 1]
    },
    {
      body: {
        input_type: "query",[cite: 1]
        truncate: "NONE",[cite: 1]
      },
    }
  );

  console.log(response.data[0].embedding);[cite: 1]
}

main().catch(console.error);

```

> **Note:** The API expects the `nvidia/nemotron-3-embed-1b` model. Remember to use `input_type: "query"` for searches or `input_type: "passage"` if you are indexing documents.
> 
> 

---

### Option 2: Using native `fetch` (`curl` style)

```javascript
async function getEmbedding() {
  const response = await fetch("https://integrate.api.nvidia.com/v1/embeddings", {[cite: 1]
    method: "POST",[cite: 1]
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,[cite: 1]
    },
    body: JSON.stringify({
      input: ["What is the civil caseload in South Dakota courts?"],[cite: 1]
      model: "nvidia/nemotron-3-embed-1b",[cite: 1]
      input_type: "query",[cite: 1]
      encoding_format: "float",[cite: 1]
      truncate: "NONE",[cite: 1]
    }),
  });

  const data = await response.json();
  console.log(data.data[0].embedding);[cite: 1]
}

getEmbedding().catch(console.error);

```

---

### Option 3: Using `@langchain/nvidia-ai-endpoints`

```javascript
import { NVIDIAEmbeddings } from "@langchain/nvidia-ai-endpoints";

const client = new NVIDIAEmbeddings({
  model: "nvidia/nemotron-3-embed-1b",[cite: 1]
  apiKey: process.env.NVIDIA_API_KEY,[cite: 1]
  inputType: "query",[cite: 1]
  truncate: "NONE",[cite: 1]
});

async function main() {
  const embedding = await client.embedQuery(
    "What is the civil caseload in South Dakota courts?"
  );
  console.log(embedding);
}

main().catch(console.error);

```
