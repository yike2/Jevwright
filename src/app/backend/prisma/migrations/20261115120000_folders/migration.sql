-- Folders replace Modules: every Module becomes a folder directly in its Project, with the same id, name, times,
-- and Test Files. Runs keep every row and record their file's path in its Project.

-- CreateTable
CREATE TABLE "Folder" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "parentId" UUID,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Folder" ("id", "projectId", "parentId", "name", "createdAt", "updatedAt")
SELECT "id", "projectId", NULL, "name", "createdAt", "updatedAt" FROM "Module";

-- AlterTable: each Test File moves from its Module to the folder made from it, in the same Project.
ALTER TABLE "TestFile" ADD COLUMN "folderId" UUID,
ADD COLUMN "projectId" UUID;

UPDATE "TestFile" SET "folderId" = "Module"."id", "projectId" = "Module"."projectId"
FROM "Module" WHERE "Module"."id" = "TestFile"."moduleId";

ALTER TABLE "TestFile" ALTER COLUMN "projectId" SET NOT NULL;

-- AlterTable: a Run's path is its Module's name and its file name; a Run whose Module is gone keeps its file name.
ALTER TABLE "Run" ADD COLUMN "path" TEXT;

UPDATE "Run" SET "path" = COALESCE((SELECT "name" FROM "Module" WHERE "id" = "Run"."moduleId") || '/', '') || "fileName";

ALTER TABLE "Run" ALTER COLUMN "path" SET NOT NULL;

-- DropForeignKey
ALTER TABLE "Module" DROP CONSTRAINT "Module_projectId_fkey";

-- DropForeignKey
ALTER TABLE "Run" DROP CONSTRAINT "Run_moduleId_fkey";

-- DropForeignKey
ALTER TABLE "TestFile" DROP CONSTRAINT "TestFile_moduleId_fkey";

-- DropIndex
DROP INDEX "TestFile_moduleId_name_key";

-- AlterTable
ALTER TABLE "Run" DROP COLUMN "moduleId";

-- AlterTable
ALTER TABLE "TestFile" DROP COLUMN "moduleId";

-- DropTable
DROP TABLE "Module";

-- CreateIndex: NULLS NOT DISTINCT, so a name is unique directly in the Project as well as in a folder.
CREATE UNIQUE INDEX "Folder_projectId_parentId_name_key" ON "Folder"("projectId", "parentId", "name") NULLS NOT DISTINCT;

-- CreateIndex
CREATE UNIQUE INDEX "TestFile_projectId_folderId_name_key" ON "TestFile"("projectId", "folderId", "name") NULLS NOT DISTINCT;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestFile" ADD CONSTRAINT "TestFile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestFile" ADD CONSTRAINT "TestFile_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
