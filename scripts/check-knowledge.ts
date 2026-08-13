import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

async function main() {
  const ke = await p.knowledgeEntry.count();
  console.log("KnowledgeEntry:", ke);

  try {
    const kent = await p.knowledgeEntity.count();
    console.log("KnowledgeEntity:", kent);
  } catch (e) {
    console.log("KnowledgeEntity: error -", (e as Error).message.slice(0, 80));
  }

  try {
    const krel = await p.knowledgeRelation.count();
    console.log("KnowledgeRelation:", krel);
  } catch (e) {
    console.log("KnowledgeRelation: error -", (e as Error).message.slice(0, 80));
  }

  const modelNames = Object.keys(p).filter(k => !k.startsWith("$") && !k.startsWith("_") && typeof (p as any)[k] === "object");
  console.log("Available models:", modelNames.join(", "));

  await p.$disconnect();
}

main().catch(console.error);
