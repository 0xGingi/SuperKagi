const DEFAULT_NANO_BASE = "https://nano-gpt.com/api/v1";

function stripChatPath(base: string) {
  return base.replace(/\/+$/, "").replace(/\/chat\/completions$/i, "");
}

function normalizeNanoRoot(base?: string) {
  const trimmed = stripChatPath(base || DEFAULT_NANO_BASE);
  return trimmed
    .replace(/\/api\/subscription\/v1$/i, "")
    .replace(/\/api\/paid\/v1$/i, "")
    .replace(/\/api\/v1thinking$/i, "")
    .replace(/\/api\/v1legacy$/i, "")
    .replace(/\/api\/v1$/i, "")
    .replace(/\/v1thinking$/i, "")
    .replace(/\/v1legacy$/i, "")
    .replace(/\/v1$/i, "");
}

export function getNanoApiBase(
  base?: string,
  options?: { allowChatVariants?: boolean },
) {
  const trimmed = stripChatPath(base || DEFAULT_NANO_BASE);
  const isChatVariant =
    /(\/api)?\/v1(legacy|thinking)?$/i.test(trimmed) &&
    !/\/api\/(paid|subscription)\/v1$/i.test(trimmed);
  if (options?.allowChatVariants && isChatVariant) return trimmed;
  const root = normalizeNanoRoot(trimmed);
  return `${root}/api/v1`;
}

export function getNanoSubscriptionModelsUrl(detailed = false, base?: string) {
  const root = normalizeNanoRoot(base);
  const url = `${root}/api/subscription/v1/models`;
  return detailed ? `${url}?detailed=true` : url;
}

export function getNanoPaidModelsUrl(detailed = false, base?: string) {
  const root = normalizeNanoRoot(base);
  const url = `${root}/api/paid/v1/models`;
  return detailed ? `${url}?detailed=true` : url;
}

export function getNanoAllModelsUrl(base?: string) {
  const root = normalizeNanoRoot(base);
  return `${root}/api/models/text`;
}

export function getNanoSubscriptionImageModelsUrl(
  detailed = false,
  base?: string,
) {
  const root = normalizeNanoRoot(base);
  const url = `${root}/api/subscription/v1/image-models`;
  return detailed ? `${url}?detailed=true` : url;
}

export function getNanoPaidImageModelsUrl(detailed = false, base?: string) {
  const root = normalizeNanoRoot(base);
  const url = `${root}/api/models/image`;
  return detailed ? `${url}?detailed=true` : url;
}
