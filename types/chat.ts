export type Provider = "local" | "openrouter" | "nanogpt";

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ChatMessage = {
  role: "user" | "assistant" | "tool";
  content: string | ContentPart[];
  id?: string;
  pending?: boolean;
  error?: string;
  createdAt?: number;
  edited?: boolean;
  tool_call_id?: string;
  reasoning?: string;
  reasoningDetails?: unknown;
  cost?: number;
};

export type ChatMap = Record<string, ChatMessage[]>;

export type ModelOption = {
  id: string;
  label: string;
  pricing?: string;
  pricePrompt?: number;
  priceCompletion?: number;
  priceUnit?: string;
  priceCurrency?: string;
};

export type ImageModelOption = {
  id: string;
  label: string;
  name?: string;
  pricing?: string;
  scope: "subscription" | "paid";
  resolutions?: string[];
  defaultSize?: string;
  defaultSteps?: number;
  defaultGuidance?: number;
  pricePerResolution?: Record<string, number>;
  currency?: string;
  baseCost?: number;
};

export type UiConfig = {
  provider: Provider;
  model: string;
  models: { local: string; openrouter: string; nanogpt: string };
  imageModel: string;
  imageSize: string;
  imageSteps: number;
  imageGuidanceScale: number;
  imageSeed?: number;
  apiKeyOpenrouter?: string;
  apiKeyNanogpt?: string;
  apiKey?: string;
  localUrl: string;
  systemPrompt: string;
  deepSearch: boolean;
  userSet?: {
    provider?: boolean;
    models?: { local?: boolean; openrouter?: boolean; nanogpt?: boolean };
    imageModel?: boolean;
    imageSize?: boolean;
    imageSteps?: boolean;
    imageGuidanceScale?: boolean;
    imageSeed?: boolean;
    localUrl?: boolean;
    systemPrompt?: boolean;
    deepSearch?: boolean;
    apiKey?: boolean;
  };
};

export type ServerDefaults = {
  provider: Provider;
  modelLocal: string;
  modelOpenrouter: string;
  modelNanogpt: string;
  imageModelNanogpt: string;
  hasApiKey: boolean;
  hasNanoApiKey: boolean;
  localUrl: string;
  systemPrompt: string;
  deepSearch: boolean;
};
