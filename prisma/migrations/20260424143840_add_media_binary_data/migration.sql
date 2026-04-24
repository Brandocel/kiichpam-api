/*
  Warnings:

  - Added the required column `data` to the `MediaAsset` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN     "data" BYTEA NOT NULL;
