-- CreateTable
CREATE TABLE "contracts" (
    "id" SERIAL NOT NULL,
    "gsis_id" TEXT,
    "year_signed" INTEGER,
    "apy_cap_pct" DOUBLE PRECISION,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contracts_gsis_id_idx" ON "contracts"("gsis_id");

-- CreateIndex
CREATE INDEX "contracts_year_signed_idx" ON "contracts"("year_signed");
