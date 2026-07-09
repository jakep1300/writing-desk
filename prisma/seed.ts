import "dotenv/config";
import { prisma } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth/password";

async function main() {
  const username = process.env.APP_USERNAME;
  const password = process.env.APP_PASSWORD;

  if (!username || !password) {
    throw new Error("APP_USERNAME and APP_PASSWORD must be set in .env");
  }

  const passwordHash = await hashPassword(password);

  await prisma.user.upsert({
    where: { username },
    create: { username, passwordHash },
    update: { passwordHash },
  });

  await prisma.settings.upsert({
    where: { id: "global" },
    create: { id: "global" },
    update: {},
  });

  console.log(`Seeded user "${username}" and default settings.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
