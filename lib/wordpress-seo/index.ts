import { buildSlimSeoMeta, verifySlimSeoMeta } from "./slim-seo";
import { buildYoastSeoMeta, verifyYoastSeoMeta } from "./yoast-seo";
import type {
  SeoAdapterResult,
  SeoMetaFields,
  SeoVerifyResult,
  WpSeoPlugin,
} from "./types";

export {
  DEFAULT_WP_SEO_PLUGIN,
  WP_SEO_PLUGINS,
  isWpSeoPlugin,
  normalizeWpSeoPlugin,
  wpSeoPluginLabel,
  type SeoMetaFields,
  type SeoVerifyResult,
  type WpSeoPlugin,
} from "./types";

export { YOAST_META_DESC_KEY, YOAST_META_TITLE_KEY } from "./yoast-seo";

export function buildSeoRestMeta(
  plugin: WpSeoPlugin,
  fields: SeoMetaFields
): SeoAdapterResult {
  if (plugin === "yoast_seo") {
    return buildYoastSeoMeta(fields);
  }
  return buildSlimSeoMeta(fields);
}

export function verifySeoRestMeta(
  plugin: WpSeoPlugin,
  meta: Record<string, unknown> | null | undefined,
  fields: SeoMetaFields
): SeoVerifyResult {
  if (plugin === "yoast_seo") {
    return verifyYoastSeoMeta(meta, fields);
  }
  return verifySlimSeoMeta(meta, fields);
}
