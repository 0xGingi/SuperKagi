import type { ImageModelOption, ModelOption } from "@/types/chat";

export function formatNanoPricing(model: any) {
  const pricing =
    (model && (model.pricing || model.prices || model.price)) || null;
  if (!pricing) {
    const cost = model?.cost ?? model?.costEstimate;
    if (typeof cost === "number") return `$${cost}`;
    if (typeof cost === "string") return cost;
    return "";
  }
  if (typeof pricing === "string") return pricing;
  const prompt =
    pricing.prompt ??
    pricing.input ??
    pricing.input_text ??
    pricing.request ??
    pricing["1k_input"];
  const completion =
    pricing.completion ??
    pricing.output ??
    pricing.output_text ??
    pricing.response ??
    pricing["1k_output"];
  if (prompt && completion) return `${prompt}/${completion}`;
  if (prompt) return `in ${prompt}`;
  if (completion) return `out ${completion}`;
  return "";
}

export function nanoPricingFields(model: any) {
  const pricing =
    (model && (model.pricing || model.prices || model.price)) || null;
  if (!pricing || typeof pricing !== "object") {
    return {
      prompt: undefined,
      completion: undefined,
      unit: undefined,
      currency: undefined,
    };
  }
  const prompt =
    pricing.prompt ??
    pricing.input ??
    pricing.input_text ??
    pricing.request ??
    pricing["1k_input"];
  const completion =
    pricing.completion ??
    pricing.output ??
    pricing.output_text ??
    pricing.response ??
    pricing["1k_output"];
  const unit = pricing.unit || pricing.per || pricing.unit_label;
  const currency = pricing.currency || pricing.curr || pricing.ccy;
  return {
    prompt: typeof prompt === "number" ? prompt : undefined,
    completion: typeof completion === "number" ? completion : undefined,
    unit: typeof unit === "string" ? unit : undefined,
    currency: typeof currency === "string" ? currency : undefined,
  };
}

export function formatOpenrouterPricing(model: any) {
  const pricing = model?.pricing || null;
  if (!pricing) return "";
  if (typeof pricing === "string") return pricing;
  const prompt = pricing.prompt || pricing.input || pricing["1k_input"];
  const completion =
    pricing.completion || pricing.output || pricing["1k_output"];
  if (prompt && completion) return `${prompt}/${completion}`;
  if (prompt) return `in ${prompt}`;
  if (completion) return `out ${completion}`;
  return "";
}

export function normalizeNanoModels(list: any[]): ModelOption[] {
  if (!Array.isArray(list)) {
    if (list && typeof list === "object") {
      if ((list as any).text && typeof (list as any).text === "object") {
        list = Object.values((list as any).text);
      } else {
        list = Object.values(list);
      }
    } else {
      return [];
    }
  }
  return list
    .map((item) => {
      if (!item) return null;
      if (typeof item === "string") return { id: item, label: item };
      if (typeof item !== "object") return null;
      const id = (item as any).id || (item as any).model || (item as any).name;
      if (!id) return null;
      const pricing = formatNanoPricing(item);
      const label = pricing ? `${id} · ${pricing}` : String(id);
      const priceFields = nanoPricingFields(item);
      return {
        id: String(id),
        label,
        pricing,
        pricePrompt: priceFields.prompt,
        priceCompletion: priceFields.completion,
        priceUnit: priceFields.unit,
        priceCurrency: priceFields.currency,
      };
    })
    .filter(Boolean) as ModelOption[];
}

export function normalizeOpenrouterModels(list: any[]): ModelOption[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const id = item.id || item.model || item.name;
      if (!id) return null;
      const pricing = formatOpenrouterPricing(item);
      const label = pricing ? `${id} · ${pricing}` : String(id);
      return { id: String(id), label, pricing };
    })
    .filter(Boolean) as ModelOption[];
}

export function formatNanoImagePricing(model: any) {
  const pricing =
    model?.pricing?.per_image || model?.pricing?.image || model?.cost;
  const currency = model?.pricing?.currency || model?.currency || "USD";
  if (!pricing) return "";
  if (typeof pricing === "number") {
    const symbol = currency === "USD" ? "$" : `${currency} `;
    return `${symbol}${pricing}/img`;
  }
  if (typeof pricing === "string") return pricing;
  const values = Object.values(pricing || {}).filter(
    (v) => typeof v === "number",
  ) as number[];
  if (!values.length) return "";
  const min = Math.min(...values);
  const symbol = currency === "USD" ? "$" : `${currency} `;
  return `${symbol}${min}/img`;
}

export function extractImageResolutions(model: any) {
  const res: string[] = [];
  const addVal = (v?: unknown) => {
    const val =
      typeof v === "string"
        ? v
        : typeof v === "object" && v && "value" in v
          ? String((v as any).value)
          : null;
    if (val && !res.includes(val)) res.push(val);
  };
  const supported = model?.supported_parameters?.resolutions;
  if (Array.isArray(supported)) supported.forEach(addVal);
  const fromRes = model?.resolutions;
  if (Array.isArray(fromRes)) fromRes.forEach(addVal);
  return res;
}

export function deriveImageDefaults(model: any) {
  const resolutions = extractImageResolutions(model);
  const firstNonAuto = resolutions.find((r: string) => r !== "auto");
  const defaultSizeRaw =
    model?.defaultSettings?.resolution ||
    model?.defaultSettings?.size ||
    model?.defaultSettings?.resolution_name ||
    model?.default_size;
  const defaultSize =
    typeof defaultSizeRaw === "string"
      ? defaultSizeRaw
      : firstNonAuto || resolutions[0];
  const steps =
    typeof model?.defaultSettings?.steps === "number"
      ? model.defaultSettings.steps
      : typeof model?.defaultSettings?.num_inference_steps === "number"
        ? model.defaultSettings.num_inference_steps
        : typeof model?.additionalParams?.steps?.default === "number"
          ? model.additionalParams.steps.default
          : undefined;
  const guidance =
    typeof model?.defaultSettings?.CFGScale === "number"
      ? model.defaultSettings.CFGScale
      : typeof model?.defaultSettings?.guidance_scale === "number"
        ? model.defaultSettings.guidance_scale
        : typeof model?.additionalParams?.CFGScale?.default === "number"
          ? model.additionalParams.CFGScale.default
          : typeof model?.additionalParams?.guidance_scale?.default === "number"
            ? model.additionalParams.guidance_scale.default
            : undefined;
  return { size: defaultSize, steps, guidance, resolutions };
}

function normalizeImageModelTagValue(value: unknown) {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized || null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).toLowerCase();
  }
  return null;
}

function hasImageModelImg2ImgSupport(model: any) {
  if (!model) return false;
  const flagKeys = [
    "supportsMultipleImg2Img",
    "supportsImg2Img",
    "supports_img2img",
    "supportsImageEdit",
    "supports_image_edit",
    "supports_image_editing",
    "supportsImageToImage",
    "supports_image_to_image",
    "requiresSwapAndTargetImages",
  ];
  for (const key of flagKeys) {
    if ((model as any)[key]) return true;
  }

  const normalizedList = [
    ...(Array.isArray(model?.tags) ? model.tags : []),
    ...(Array.isArray(model?.capabilities) ? model.capabilities : []),
  ];
  const matchTag = (value: unknown) => {
    const normalized = normalizeImageModelTagValue(value);
    if (!normalized) return false;
    return (
      normalized.includes("img2img") ||
      normalized.includes("image-edit") ||
      normalized.includes("image-to-image")
    );
  };
  if (normalizedList.some(matchTag)) return true;
  const iconLabel = normalizeImageModelTagValue(model?.iconLabel);
  if (iconLabel && matchTag(iconLabel)) return true;
  return false;
}

function buildImageModelTags(model: any, supportsImg2Img: boolean) {
  const tags = new Set<string>();
  const addTag = (value: unknown) => {
    const normalized = normalizeImageModelTagValue(value);
    if (normalized) tags.add(normalized);
  };
  if (Array.isArray(model?.tags)) model.tags.forEach(addTag);
  if (Array.isArray(model?.capabilities)) model.capabilities.forEach(addTag);
  addTag(model?.iconLabel);
  addTag(model?.category);
  addTag(model?.provider);
  addTag(model?.engine);
  if (supportsImg2Img) {
    tags.add("img2img");
    tags.add("image-edit");
  }
  return tags.size ? Array.from(tags) : undefined;
}

function extractImagePriceMap(model: any) {
  const pricing =
    model?.pricing?.per_image ||
    model?.pricing?.image ||
    model?.cost ||
    model?.prices;
  if (!pricing || typeof pricing !== "object") return undefined;
  const map: Record<string, number> = {};
  Object.entries(pricing).forEach(([key, val]) => {
    if (typeof val === "number") map[key.toLowerCase()] = val;
  });
  return Object.keys(map).length ? map : undefined;
}

export function normalizeNanoImageModels(
  list: any[],
  scope: "subscription" | "paid",
): ImageModelOption[] {
  if (!Array.isArray(list)) {
    if (list && typeof list === "object") {
      list = Object.values(list);
    } else {
      return [];
    }
  }
  return list
    .map((item) => {
      if (!item) return null;
      const id = item.id || item.model || item.name;
      if (!id) return null;
      const pricing = formatNanoImagePricing(item);
      const defaults = deriveImageDefaults(item);
      const pricePerResolution = extractImagePriceMap(item);
      const minPrice =
        pricePerResolution && Object.values(pricePerResolution).length
          ? Math.min(...Object.values(pricePerResolution))
          : undefined;
      const labelBase = item.name || id;
      const meta = [pricing, defaults.size].filter(Boolean).join(" • ");
      const supportsImg2Img = hasImageModelImg2ImgSupport(item);
      const tags = buildImageModelTags(item, supportsImg2Img);
      return {
        id: String(id),
        label: meta ? `${labelBase} · ${meta}` : String(labelBase),
        name: item.name,
        pricing,
        scope,
        resolutions: defaults.resolutions,
        defaultSize: defaults.size,
        defaultSteps: defaults.steps,
        defaultGuidance: defaults.guidance,
        pricePerResolution,
        currency: item?.pricing?.currency || item?.currency,
        baseCost: minPrice,
        supportsImg2Img,
        tags,
      };
    })
    .filter(Boolean) as ImageModelOption[];
}

export function estimateImageCost(
  nanoImageModels: ImageModelOption[],
  modelId?: string,
  size?: string,
) {
  if (!modelId) return undefined;
  const match = nanoImageModels.find((m) => m.id === modelId);
  if (!match) return undefined;
  const key = (size || "").toLowerCase();
  const map = match.pricePerResolution;
  if (map) {
    const direct = key ? map[key] : undefined;
    if (typeof direct === "number") return direct;
    const compactKey = key.replace(/\s+/g, "");
    const compactVal =
      compactKey && compactKey !== key ? map[compactKey] : undefined;
    if (typeof compactVal === "number") return compactVal;
    if (typeof map.auto === "number") return map.auto;
    const values = Object.values(map).filter(
      (v): v is number => typeof v === "number",
    );
    if (values.length) return Math.min(...values);
  }
  if (typeof match.baseCost === "number") return match.baseCost;
  return undefined;
}
