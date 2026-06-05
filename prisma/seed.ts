import { hash } from "bcryptjs";

import { PrismaClient } from "../generated/prisma";

const db = new PrismaClient();

/**
 * Seeds a small, deterministic dataset for local development:
 *
 *  - "Acme Research" org with a "Diabetes Telehealth Review" project.
 *      - demo@easyslr.dev      (org OWNER,  project OWNER)
 *      - reviewer@easyslr.dev  (org MEMBER, project REVIEWER)
 *  - "Beta Labs" org with its own project, owned by:
 *      - outsider@easyslr.dev  (no access to Acme — used to test authorization)
 *
 * All passwords are the local value below. Safe to run repeatedly (upserts).
 */
const PASSWORD = "demo1234";

async function upsertUser(email: string, name: string, passwordHash: string) {
  return db.user.upsert({
    where: { email },
    update: { name, password: passwordHash },
    create: { email, name, password: passwordHash },
  });
}

async function main() {
  const passwordHash = await hash(PASSWORD, 10);

  const [demo, reviewer, outsider] = await Promise.all([
    upsertUser("demo@easyslr.dev", "Demo Owner", passwordHash),
    upsertUser("reviewer@easyslr.dev", "Rey Reviewer", passwordHash),
    upsertUser("outsider@easyslr.dev", "Olive Outsider", passwordHash),
  ]);

  // --- Acme Research ---
  const acme = await db.organization.upsert({
    where: { slug: "acme" },
    update: { name: "Acme Research" },
    create: { name: "Acme Research", slug: "acme" },
  });

  const project = await db.project.upsert({
    // Deterministic id so re-seeding doesn't create duplicate projects.
    where: { id: "seed-project-diabetes" },
    update: { name: "Diabetes Telehealth Review" },
    create: {
      id: "seed-project-diabetes",
      name: "Diabetes Telehealth Review",
      description:
        "Systematic review of digital/telehealth interventions for diabetes care.",
      organizationId: acme.id,
    },
  });

  await db.orgMembership.upsert({
    where: { userId_organizationId: { userId: demo.id, organizationId: acme.id } },
    update: { role: "OWNER" },
    create: { userId: demo.id, organizationId: acme.id, role: "OWNER" },
  });
  await db.orgMembership.upsert({
    where: {
      userId_organizationId: { userId: reviewer.id, organizationId: acme.id },
    },
    update: { role: "MEMBER" },
    create: { userId: reviewer.id, organizationId: acme.id, role: "MEMBER" },
  });

  await db.projectMembership.upsert({
    where: { userId_projectId: { userId: demo.id, projectId: project.id } },
    update: { role: "OWNER" },
    create: { userId: demo.id, projectId: project.id, role: "OWNER" },
  });
  await db.projectMembership.upsert({
    where: { userId_projectId: { userId: reviewer.id, projectId: project.id } },
    update: { role: "REVIEWER" },
    create: { userId: reviewer.id, projectId: project.id, role: "REVIEWER" },
  });

  // --- Beta Labs (separate org for authorization testing) ---
  const beta = await db.organization.upsert({
    where: { slug: "beta" },
    update: { name: "Beta Labs" },
    create: { name: "Beta Labs", slug: "beta" },
  });

  const betaProject = await db.project.upsert({
    where: { id: "seed-project-beta" },
    update: { name: "Unrelated Cardiology Review" },
    create: {
      id: "seed-project-beta",
      name: "Unrelated Cardiology Review",
      organizationId: beta.id,
    },
  });

  await db.orgMembership.upsert({
    where: {
      userId_organizationId: { userId: outsider.id, organizationId: beta.id },
    },
    update: { role: "OWNER" },
    create: { userId: outsider.id, organizationId: beta.id, role: "OWNER" },
  });
  await db.projectMembership.upsert({
    where: { userId_projectId: { userId: outsider.id, projectId: betaProject.id } },
    update: { role: "OWNER" },
    create: { userId: outsider.id, projectId: betaProject.id, role: "OWNER" },
  });

  console.log("Seed complete.");
  console.log("  Login with any of these (password: %s):", PASSWORD);
  console.log("    demo@easyslr.dev      -> Acme (owner)");
  console.log("    reviewer@easyslr.dev  -> Acme (reviewer)");
  console.log("    outsider@easyslr.dev  -> Beta (owner), no Acme access");
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
