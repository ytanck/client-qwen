import { getClientConfig } from "../config/client";
import { getServerSideConfig } from "../config/server";
import { ACCESS_CODE_PREFIX } from "../constant";
import { ChatMessage, ModelType, useAccessStore, useAppConfig } from "../store";
import { ChatGPTApi } from "./platforms/openai";
import { QwenApi } from "./platforms/alibaba";
// import { DEFAULT_CONFIG } from "../store/config";

export const ROLES = ["system", "user", "assistant"] as const;
export type MessageRole = (typeof ROLES)[number];

export const Models = ["qwen-turbo", "qwen-plus"] as const;
export type ChatModel = ModelType;

export interface MultimodalContent {
  type: "text" | "image_url";
  text?: string;
  image_url?: {
    url: string;
  };
}
export interface RequestMessage {
  role: MessageRole;
  content: string | MultimodalContent[];
}

export interface LLMConfig {
  model: string;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  presence_penalty?: number;
  frequency_penalty?: number;
}

export interface ChatOptions {
  messages: RequestMessage[];
  config: LLMConfig;

  onUpdate?: (message: string, chunk: string) => void;
  onFinish: (message: string) => void;
  onError?: (err: Error) => void;
  onController?: (controller: AbortController) => void;
}

export interface LLMUsage {
  used: number;
  total: number;
}

export interface LLMModel {
  name: string;
  available: boolean;
}

export abstract class LLMApi {
  abstract chat(options: ChatOptions): Promise<void>;
  abstract usage(): Promise<LLMUsage>;
  abstract models(): Promise<LLMModel[]>;
}

type ProviderName = "openai" | "azure" | "claude" | "palm";

interface Model {
  name: string;
  provider: ProviderName;
  ctxlen: number;
}

interface ChatProvider {
  name: ProviderName;
  apiConfig: {
    baseUrl: string;
    apiKey: string;
    summaryModel: Model;
  };
  models: Model[];

  chat: () => void;
  usage: () => void;
}
const { provider } = getServerSideConfig();

export class ClientApi {
  public llm: LLMApi;

  constructor(provider: string) {
    // TODO:
    switch (provider) {
      case "OpenAI":
        this.llm = new ChatGPTApi();
      case "Alibaba":
        this.llm = new QwenApi();
        console.log('provider===>a', provider);
        break;
      default:
        console.log('provider===>d', provider);
        this.llm = new QwenApi();//bug：浏览器客户端都是默认走这里
    }
  }

  config() {}

  prompts() {}

  masks() {}

  async share(messages: ChatMessage[], avatarUrl: string | null = null) {
    const msgs = messages
      .map((m) => ({
        from: m.role === "user" ? "human" : "gpt",
        value: m.content,
      }))
      .concat([
        {
          from: "human",
          value:
            "Share from [ChatGPT Next Web]: https://github.com/Yidadaa/ChatGPT-Next-Web",
        },
      ]);
    // 敬告二开开发者们，为了开源大模型的发展，请不要修改上述消息，此消息用于后续数据清洗使用
    // Please do not modify this message

    console.log("[Share]", messages, msgs);
    const clientConfig = getClientConfig();
    const proxyUrl = "/sharegpt";
    const rawUrl = "https://sharegpt.com/api/conversations";
    const shareUrl = clientConfig?.isApp ? rawUrl : proxyUrl;
    const res = await fetch(shareUrl, {
      body: JSON.stringify({
        avatarUrl,
        items: msgs,
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    const resJson = await res.json();
    console.log("[Share]", resJson);
    if (resJson.id) {
      return `https://shareg.pt/${resJson.id}`;
    }
  }
}

export const api = new ClientApi(provider);

export function getHeaders() {
  const accessStore = useAccessStore.getState();
  let headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-requested-with": "XMLHttpRequest",
  };

  const makeBearer = (token: string) => `Bearer ${token.trim()}`;
  const validString = (x: string) => x && x.length > 0;

  // use user's api key first
  if (validString(accessStore.token)) {
    headers.Authorization = makeBearer(accessStore.token);
  } else if (
    accessStore.enabledAccessControl() &&
    validString(accessStore.accessCode)
  ) {
    headers.Authorization = makeBearer(
      ACCESS_CODE_PREFIX + accessStore.accessCode,
    );
  }

  return headers;
}
