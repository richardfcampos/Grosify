-- Membros que já existiam antes da coluna onboarded_at NÃO devem re-ver o onboarding
-- (já usam o app) — senão re-veem o tour e o "semear itens" duplicaria o catálogo.
-- Marca-os como já-onboardados; membros que entrarem depois nascem com NULL e veem o tour.
UPDATE "household_members" SET "onboarded_at" = "joined_at" WHERE "onboarded_at" IS NULL;
