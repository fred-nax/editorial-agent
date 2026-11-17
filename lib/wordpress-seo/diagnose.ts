import type { WordPressConfig } from "@/lib/settings/app-settings";
import {
  assertSafeWordPressUrlResolved,
  fetchWordPressNoRedirect,
  WordPressUrlError,
} from "@/lib/settings/wp-url";
import {
  YOAST_META_DESC_KEY,
  YOAST_META_TITLE_KEY,
} from "@/lib/wordpress-seo/yoast-seo";
import type { WpSeoPlugin } from "@/lib/wordpress-seo/types";

const DIAGNOSE_TIMEOUT_MS = 12_000;

export type SeoDiagnoseStatus =
  | "compatible"
  | "incomplete"
  | "connection_error";

export type SeoDiagnoseResult = {
  status: SeoDiagnoseStatus;
  message: string;
  plugin: WpSeoPlugin;
  /** Connexion REST + auth réussies. */
  restConnected: boolean;
  /** Champs SEO attendus présents dans le schéma / une réponse meta. */
  metaFieldsAccessible: boolean;
  /** Capacités d’édition détectées via users/me (sans écriture). */
  editCapabilityDetected: boolean | null;
  /** Toujours false pour ce diagnostic non destructif. */
  writeValidated: boolean;
  details: {
    titleKeyPresent: boolean;
    descriptionKeyPresent: boolean;
    schemaChecked: boolean;
    samplePostChecked: boolean;
    httpStatus: number | null;
    userCanEditPosts: boolean | null;
  };
};

function authHeader(username: string, appPassword: string): string {
  return `Basic ${Buffer.from(`${username}:${appPassword}`).toString("base64")}`;
}

export type DiagnoseFetch = (
  url: string,
  init?: RequestInit
) => Promise<Response>;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  fetchImpl: DiagnoseFetch
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DIAGNOSE_TIMEOUT_MS);
  try {
    return await fetchImpl(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timer);
  }
}

const defaultDiagnoseFetch: DiagnoseFetch = (url, init) =>
  fetchWordPressNoRedirect(url, init ?? {});

function connectionError(
  plugin: WpSeoPlugin,
  message: string,
  httpStatus: number | null = null
): SeoDiagnoseResult {
  return {
    status: "connection_error",
    message,
    plugin,
    restConnected: false,
    metaFieldsAccessible: false,
    editCapabilityDetected: null,
    writeValidated: false,
    details: {
      titleKeyPresent: false,
      descriptionKeyPresent: false,
      schemaChecked: false,
      samplePostChecked: false,
      httpStatus,
      userCanEditPosts: null,
    },
  };
}

type UsersMe = {
  id?: number;
  capabilities?: Record<string, boolean>;
};

type PostsSchemaPayload = {
  schema?: {
    properties?: {
      meta?: {
        properties?: Record<string, unknown>;
      };
    };
  };
};

function extractMetaKeysFromSchema(
  payload: PostsSchemaPayload
): Set<string> {
  const props = payload.schema?.properties?.meta?.properties;
  if (!props || typeof props !== "object") {
    return new Set();
  }
  return new Set(Object.keys(props));
}

function extractMetaKeysFromPost(meta: unknown): Set<string> {
  if (!meta || typeof meta !== "object") {
    return new Set();
  }
  return new Set(Object.keys(meta as Record<string, unknown>));
}

export type DiagnoseOptions = {
  /** Injection de fetch pour tests — défaut : fetchWordPressNoRedirect. */
  fetchImpl?: DiagnoseFetch;
  /** Si fourni, saute la résolution DNS SSRF (tests unitaires). */
  skipUrlSafetyCheck?: boolean;
};

/**
 * Diagnostic non destructif de l’intégration SEO WordPress.
 * Aucune écriture, aucune création de brouillon, aucun appel OpenAI.
 */
export async function diagnoseWordPressSeo(
  plugin: WpSeoPlugin,
  config: Pick<WordPressConfig, "url" | "username" | "appPassword">,
  options: DiagnoseOptions = {}
): Promise<SeoDiagnoseResult> {
  if (plugin === "slim_seo") {
    return diagnoseSlimSeo(config, options);
  }
  return diagnoseYoastSeo(config, options);
}

async function diagnoseSlimSeo(
  config: Pick<WordPressConfig, "url" | "username" | "appPassword">,
  options: DiagnoseOptions
): Promise<SeoDiagnoseResult> {
  const fetchImpl = options.fetchImpl ?? defaultDiagnoseFetch;
  // Slim SEO : connexion + présence éventuelle de meta.slim_seo dans le schéma.
  const base = await resolveBase(config, options);
  if (!base.ok) {
    return connectionError("slim_seo", base.message, base.httpStatus);
  }

  const user = await fetchUsersMe(base.baseUrl, base.token, fetchImpl);
  if (!user.ok) {
    return connectionError("slim_seo", user.message, user.httpStatus);
  }

  const metaKeys = await collectMetaKeys(base.baseUrl, base.token, fetchImpl);
  const titleKeyPresent = metaKeys.keys.has("slim_seo");
  // Slim expose un objet groupé ; la présence de la clé slim_seo suffit.
  const metaFieldsAccessible = titleKeyPresent || metaKeys.keys.has("slim_seo");

  if (!metaFieldsAccessible) {
    return {
      status: "incomplete",
      message:
        "Connexion WordPress OK, mais meta.slim_seo n’est pas visible dans le schéma REST. Vérifiez que Slim SEO est actif.",
      plugin: "slim_seo",
      restConnected: true,
      metaFieldsAccessible: false,
      editCapabilityDetected: user.canEdit,
      writeValidated: false,
      details: {
        titleKeyPresent: false,
        descriptionKeyPresent: false,
        schemaChecked: metaKeys.schemaChecked,
        samplePostChecked: metaKeys.samplePostChecked,
        httpStatus: metaKeys.httpStatus,
        userCanEditPosts: user.canEdit,
      },
    };
  }

  return {
    status: "compatible",
    message:
      "Slim SEO détecté dans l’API WordPress. Les champs SEO sont accessibles. L’écriture réelle n’est pas validée par ce diagnostic.",
    plugin: "slim_seo",
    restConnected: true,
    metaFieldsAccessible: true,
    editCapabilityDetected: user.canEdit,
    writeValidated: false,
    details: {
      titleKeyPresent: true,
      descriptionKeyPresent: true,
      schemaChecked: metaKeys.schemaChecked,
      samplePostChecked: metaKeys.samplePostChecked,
      httpStatus: metaKeys.httpStatus,
      userCanEditPosts: user.canEdit,
    },
  };
}

async function diagnoseYoastSeo(
  config: Pick<WordPressConfig, "url" | "username" | "appPassword">,
  options: DiagnoseOptions
): Promise<SeoDiagnoseResult> {
  const fetchImpl = options.fetchImpl ?? defaultDiagnoseFetch;
  const base = await resolveBase(config, options);
  if (!base.ok) {
    return connectionError("yoast_seo", base.message, base.httpStatus);
  }

  const user = await fetchUsersMe(base.baseUrl, base.token, fetchImpl);
  if (!user.ok) {
    return connectionError("yoast_seo", user.message, user.httpStatus);
  }

  const metaKeys = await collectMetaKeys(base.baseUrl, base.token, fetchImpl);
  const titleKeyPresent = metaKeys.keys.has(YOAST_META_TITLE_KEY);
  const descriptionKeyPresent = metaKeys.keys.has(YOAST_META_DESC_KEY);
  const metaFieldsAccessible = titleKeyPresent && descriptionKeyPresent;

  if (!metaFieldsAccessible) {
    return {
      status: "incomplete",
      message:
        "Les champs SEO Yoast ne sont pas accessibles en écriture via l’API REST. Vérifiez l’extension WordPress et ses permissions.",
      plugin: "yoast_seo",
      restConnected: true,
      metaFieldsAccessible: false,
      editCapabilityDetected: user.canEdit,
      writeValidated: false,
      details: {
        titleKeyPresent,
        descriptionKeyPresent,
        schemaChecked: metaKeys.schemaChecked,
        samplePostChecked: metaKeys.samplePostChecked,
        httpStatus: metaKeys.httpStatus,
        userCanEditPosts: user.canEdit,
      },
    };
  }

  if (user.canEdit === false) {
    return {
      status: "incomplete",
      message:
        "Les champs SEO Yoast sont exposés, mais le compte WordPress n’a pas les permissions d’édition détectées.",
      plugin: "yoast_seo",
      restConnected: true,
      metaFieldsAccessible: true,
      editCapabilityDetected: false,
      writeValidated: false,
      details: {
        titleKeyPresent,
        descriptionKeyPresent,
        schemaChecked: metaKeys.schemaChecked,
        samplePostChecked: metaKeys.samplePostChecked,
        httpStatus: metaKeys.httpStatus,
        userCanEditPosts: false,
      },
    };
  }

  return {
    status: "compatible",
    message:
      "Extension Yoast REST détectée. Les champs SEO sont accessibles via l’API WordPress. L’écriture réelle n’est pas encore validée.",
    plugin: "yoast_seo",
    restConnected: true,
    metaFieldsAccessible: true,
    editCapabilityDetected: user.canEdit,
    writeValidated: false,
    details: {
      titleKeyPresent,
      descriptionKeyPresent,
      schemaChecked: metaKeys.schemaChecked,
      samplePostChecked: metaKeys.samplePostChecked,
      httpStatus: metaKeys.httpStatus,
      userCanEditPosts: user.canEdit,
    },
  };
}

async function resolveBase(
  config: Pick<WordPressConfig, "url" | "username" | "appPassword">,
  options: DiagnoseOptions
): Promise<
  | { ok: true; baseUrl: string; token: string }
  | { ok: false; message: string; httpStatus: number | null }
> {
  const username = config.username.trim();
  const appPassword = config.appPassword.trim();
  if (!config.url.trim() || !username || !appPassword) {
    return {
      ok: false,
      message: "Identifiants WordPress incomplets pour le diagnostic SEO.",
      httpStatus: null,
    };
  }

  try {
    const baseUrl = options.skipUrlSafetyCheck
      ? config.url.replace(/\/$/, "")
      : await assertSafeWordPressUrlResolved(config.url);
    return {
      ok: true,
      baseUrl,
      token: authHeader(username, appPassword),
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "URL WordPress invalide.",
      httpStatus: error instanceof WordPressUrlError ? error.status : null,
    };
  }
}

async function fetchUsersMe(
  baseUrl: string,
  token: string,
  fetchImpl: DiagnoseFetch
): Promise<
  | { ok: true; canEdit: boolean }
  | { ok: false; message: string; httpStatus: number | null }
> {
  try {
    const response = await fetchWithTimeout(
      `${baseUrl}/wp-json/wp/v2/users/me?context=edit`,
      {
        method: "GET",
        headers: {
          Authorization: token,
          Accept: "application/json",
        },
      },
      fetchImpl
    );

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        message: "Identifiants WordPress refusés.",
        httpStatus: response.status,
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        message: `Impossible de vérifier la configuration SEO WordPress (HTTP ${response.status}).`,
        httpStatus: response.status,
      };
    }

    const data = (await response.json()) as UsersMe;
    const caps = data.capabilities ?? {};
    const canEdit =
      caps.edit_posts === true ||
      caps.edit_others_posts === true ||
      caps.publish_posts === true;

    return { ok: true, canEdit };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        ok: false,
        message: "Délai dépassé lors de la connexion à WordPress.",
        httpStatus: null,
      };
    }
    if (error instanceof WordPressUrlError) {
      return { ok: false, message: error.message, httpStatus: error.status };
    }
    return {
      ok: false,
      message:
        "Impossible de vérifier la configuration SEO WordPress. Vérifiez la connexion et les identifiants configurés.",
      httpStatus: null,
    };
  }
}

async function collectMetaKeys(
  baseUrl: string,
  token: string,
  fetchImpl: DiagnoseFetch
): Promise<{
  keys: Set<string>;
  schemaChecked: boolean;
  samplePostChecked: boolean;
  httpStatus: number | null;
}> {
  const keys = new Set<string>();
  let schemaChecked = false;
  let samplePostChecked = false;
  let httpStatus: number | null = null;

  // 1) Schéma OPTIONS /wp/v2/posts — source privilégiée, sans écriture.
  try {
    const optionsRes = await fetchWithTimeout(
      `${baseUrl}/wp-json/wp/v2/posts`,
      {
        method: "OPTIONS",
        headers: {
          Authorization: token,
          Accept: "application/json",
        },
      },
      fetchImpl
    );
    httpStatus = optionsRes.status;
    if (optionsRes.ok) {
      const payload = (await optionsRes.json()) as PostsSchemaPayload;
      for (const key of extractMetaKeysFromSchema(payload)) {
        keys.add(key);
      }
      schemaChecked = true;
    }
  } catch {
    // continue with sample post fallback
  }

  // 2) Fallback lecture d’un article existant (GET uniquement).
  const yoastComplete =
    keys.has(YOAST_META_TITLE_KEY) && keys.has(YOAST_META_DESC_KEY);
  if (!yoastComplete && !keys.has("slim_seo")) {
    try {
      const listRes = await fetchWithTimeout(
        `${baseUrl}/wp-json/wp/v2/posts?per_page=1&context=edit&status=draft,publish,pending,private,future`,
        {
          method: "GET",
          headers: {
            Authorization: token,
            Accept: "application/json",
          },
        },
        fetchImpl
      );
      httpStatus = listRes.status;
      if (listRes.ok) {
        const posts = (await listRes.json()) as Array<{ meta?: unknown }>;
        samplePostChecked = true;
        if (Array.isArray(posts) && posts[0]) {
          for (const key of extractMetaKeysFromPost(posts[0].meta)) {
            keys.add(key);
          }
        }
      }
    } catch {
      // ignore — résultat basé sur ce qui a déjà été collecté
    }
  }

  return { keys, schemaChecked, samplePostChecked, httpStatus };
}
