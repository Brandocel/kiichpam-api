-- AlterTable
ALTER TABLE "Package" ALTER COLUMN "codigoweb" SET DEFAULT nextval('package_web_code_seq'::regclass),
ALTER COLUMN "codigoweb" DROP DEFAULT;
DROP SEQUENCE "package_web_code_seq";
