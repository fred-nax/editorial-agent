import { db } from "../db";
import { logError } from "../logger";

export type DeleteCampaignSuccess = {
  ok: true;
  brandId: string;
  subject: string;
};

export type DeleteCampaignFailure = {
  ok: false;
  status: 404 | 409 | 500;
  error: string;
};

export type DeleteCampaignResult = DeleteCampaignSuccess | DeleteCampaignFailure;

/**
 * Supprime une campagne et ses données exclusives (questions, réponses,
 * mentions via cascade, citations sans FK). Préserve la marque, ses
 * paramètres, les concurrents connus et les entités partagées.
 */
export async function deleteVisibilityCampaign(
  campaignId: string
): Promise<DeleteCampaignResult> {
  try {
    const campaign = await db.visibilityCampaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true,
        brandId: true,
        subject: true,
        status: true,
      },
    });

    if (!campaign) {
      return { ok: false, status: 404, error: "Campagne introuvable." };
    }

    if (campaign.status === "running") {
      return {
        ok: false,
        status: 409,
        error:
          "Impossible de supprimer une campagne dont l’analyse est encore en cours.",
      };
    }

    await db.$transaction(async (tx) => {
      const fresh = await tx.visibilityCampaign.findUnique({
        where: { id: campaignId },
        select: { id: true, status: true },
      });

      if (!fresh) {
        throw new DeleteCampaignConflictError(404, "Campagne introuvable.");
      }
      if (fresh.status === "running") {
        throw new DeleteCampaignConflictError(
          409,
          "Impossible de supprimer une campagne dont l’analyse est encore en cours."
        );
      }

      const responses = await tx.visibilityResponse.findMany({
        where: { campaignId },
        select: { id: true },
      });
      const responseIds = responses.map((item) => item.id);

      // VisibilityCitation n’a pas de relation Prisma / onDelete : nettoyage explicite.
      if (responseIds.length > 0) {
        await tx.visibilityCitation.deleteMany({
          where: { responseId: { in: responseIds } },
        });
      }

      // Questions, réponses et mentions cascade via VisibilityCampaign.
      await tx.visibilityCampaign.delete({ where: { id: campaignId } });
    });

    return {
      ok: true,
      brandId: campaign.brandId,
      subject: campaign.subject,
    };
  } catch (error) {
    if (error instanceof DeleteCampaignConflictError) {
      return { ok: false, status: error.status, error: error.message };
    }

    logError("ai-visibility", "delete campaign failed", {
      campaignId,
      message: error instanceof Error ? error.message : "unknown",
    });
    return {
      ok: false,
      status: 500,
      error: "Impossible de supprimer la campagne.",
    };
  }
}

class DeleteCampaignConflictError extends Error {
  readonly status: 404 | 409;

  constructor(status: 404 | 409, message: string) {
    super(message);
    this.name = "DeleteCampaignConflictError";
    this.status = status;
  }
}
