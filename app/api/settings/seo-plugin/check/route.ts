import { NextResponse } from "next/server";
import {
  resolveWordPressConfig,
  resolveWpSeoPlugin,
} from "@/lib/settings/app-settings";
import { logError } from "@/lib/logger";
import { requireAuth } from "@/lib/require-auth";
import { diagnoseWordPressSeo } from "@/lib/wordpress-seo";
import { isWpSeoPlugin } from "@/lib/wordpress-seo/types";

export const runtime = "nodejs";

/**
 * Diagnostic SEO WordPress non destructif.
 * GET — aucune écriture WordPress, aucun appel agent éditorial.
 */
export async function GET(request: Request) {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const url = new URL(request.url);
  const pluginParam = url.searchParams.get("plugin");
  const plugin = isWpSeoPlugin(pluginParam)
    ? pluginParam
    : await resolveWpSeoPlugin();

  const wp = await resolveWordPressConfig();
  if (!wp) {
    return NextResponse.json(
      {
        status: "connection_error",
        message:
          "Impossible de vérifier la configuration SEO WordPress. Vérifiez la connexion et les identifiants configurés.",
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
          httpStatus: null,
          userCanEditPosts: null,
        },
      },
      { status: 400 }
    );
  }

  try {
    const result = await diagnoseWordPressSeo(plugin, {
      url: wp.url,
      username: wp.username,
      appPassword: wp.appPassword,
    });

    const httpStatus =
      result.status === "connection_error"
        ? 400
        : result.status === "incomplete"
          ? 200
          : 200;

    return NextResponse.json(result, { status: httpStatus });
  } catch (error) {
    logError("settings-seo-plugin-check", "diagnose failed");
    return NextResponse.json(
      {
        status: "connection_error",
        message:
          "Impossible de vérifier la configuration SEO WordPress. Vérifiez la connexion et les identifiants configurés.",
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
          httpStatus: null,
          userCanEditPosts: null,
        },
        error:
          error instanceof Error
            ? "Diagnostic interrompu."
            : "Diagnostic interrompu.",
      },
      { status: 500 }
    );
  }
}
