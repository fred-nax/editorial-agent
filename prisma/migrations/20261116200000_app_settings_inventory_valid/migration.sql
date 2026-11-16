-- V7.7.0 — Invalidation inventaire WP (additive).
-- inventoryValid=false : inventaire local inutilisable jusqu'à une sync full réussie.
ALTER TABLE "AppSettings" ADD COLUMN "inventoryValid" BOOLEAN NOT NULL DEFAULT true;
