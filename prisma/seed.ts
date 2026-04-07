import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const packages = [
    {
      code: "KX_TOTAL",
      isActive: true,
      adultPriceMXN: 64600,
      childPriceMXN: 38900,
      infantPriceMXN: 0,
      currency: "MXN",
      maxAdults: 10,
      maxChildren: 5,
      maxInfants: 3,
      ageRules: {
        adultMin: 12,
        childMax: 11,
        childMin: 5,
        infantMax: 4,
      },
      translation: {
        lang: "es",
        name: "Aventura KX TOTAL",
        description:
          "Experiencia completa con acceso a dos cenotes, transporte en bicicleta y buffet.",
        includes: [
          "Ceremonia de Bienvenida.",
          "Entrada a los dos cenotes Yun Chen y X Kokay.",
          "Chaleco salvavidas.",
          "Comida tipo buffet (no incluye bebidas).",
          "Talleres y degustaciones: Chocolate, Tequila y Mezcal.",
          "Transportación al segundo cenote en bicicletas.",
          "Acceso a instalaciones como baños, regaderas, cambiadores y áreas libres.",
        ],
        excludes: ["Bebidas."],
        notes: [
          "Uso obligatorio de chaleco salvavidas.",
          "No incluye bebidas durante el buffet.",
        ],
      },
    },
    {
      code: "KX_PLUS",
      isActive: true,
      adultPriceMXN: 14900,
      childPriceMXN: 9900,
      infantPriceMXN: 0,
      currency: "MXN",
      maxAdults: 10,
      maxChildren: 5,
      maxInfants: 3,
      ageRules: {
        adultMin: 12,
        childMax: 11,
        childMin: 5,
        infantMax: 4,
      },
      translation: {
        lang: "es",
        name: "Aventura KX PLUS",
        description:
          "Paquete con alimentos incluidos y acceso al cenote Yun Chen.",
        includes: [
          "Ceremonia de Bienvenida.",
          "Acceso a Cenote Yun Chen.",
          "Chaleco salvavidas.",
          "Comida tipo buffet (no incluye bebidas).",
          "Talleres y degustaciones: Chocolate, Tequila y Mezcal.",
          "Acceso a instalaciones como baños, regaderas y cambiadores.",
        ],
        excludes: ["Bebidas."],
        notes: [
          "Uso obligatorio de chaleco salvavidas.",
          "No incluye bebidas durante el buffet.",
        ],
      },
    },
    {
      code: "KX_BASIC",
      isActive: true,
      adultPriceMXN: 14900,
      childPriceMXN: 9900,
      infantPriceMXN: 0,
      currency: "MXN",
      maxAdults: 10,
      maxChildren: 5,
      maxInfants: 3,
      ageRules: {
        adultMin: 12,
        childMax: 11,
        childMin: 5,
        infantMax: 4,
      },
      translation: {
        lang: "es",
        name: "Aventura KX BÁSICO",
        description:
          "Paquete básico para disfrutar del cenote Yun Chen y experiencias culturales.",
        includes: [
          "Ceremonia de Bienvenida.",
          "Acceso a Cenote Yun Chen.",
          "Chaleco salvavidas.",
          "Talleres y degustaciones: Chocolate, Tequila y Mezcal.",
          "Acceso a instalaciones como baños, regaderas y cambiadores.",
        ],
        excludes: ["Servicio de buffet.", "Bebidas."],
        notes: [
          "Uso obligatorio de chaleco salvavidas.",
          "No incluye servicio de buffet ni bebidas.",
        ],
      },
    },
  ];

  for (const pkg of packages) {
    await prisma.package.upsert({
      where: { code: pkg.code },
      update: {
        isActive: pkg.isActive,
        adultPriceMXN: pkg.adultPriceMXN,
        childPriceMXN: pkg.childPriceMXN,
        infantPriceMXN: pkg.infantPriceMXN,
        currency: pkg.currency,
        maxAdults: pkg.maxAdults,
        maxChildren: pkg.maxChildren,
        maxInfants: pkg.maxInfants,
        ageRules: pkg.ageRules,
        translations: {
          upsert: {
            where: {
              packageId_lang: {
                packageId: (
                  await prisma.package.findUnique({
                    where: { code: pkg.code },
                    select: { id: true },
                  })
                )?.id ?? "",
                lang: pkg.translation.lang,
              },
            },
            update: {
              name: pkg.translation.name,
              description: pkg.translation.description,
              includes: pkg.translation.includes,
              excludes: pkg.translation.excludes,
              notes: pkg.translation.notes,
            },
            create: {
              lang: pkg.translation.lang,
              name: pkg.translation.name,
              description: pkg.translation.description,
              includes: pkg.translation.includes,
              excludes: pkg.translation.excludes,
              notes: pkg.translation.notes,
            },
          },
        },
      },
      create: {
        code: pkg.code,
        isActive: pkg.isActive,
        adultPriceMXN: pkg.adultPriceMXN,
        childPriceMXN: pkg.childPriceMXN,
        infantPriceMXN: pkg.infantPriceMXN,
        currency: pkg.currency,
        maxAdults: pkg.maxAdults,
        maxChildren: pkg.maxChildren,
        maxInfants: pkg.maxInfants,
        ageRules: pkg.ageRules,
        translations: {
          create: {
            lang: pkg.translation.lang,
            name: pkg.translation.name,
            description: pkg.translation.description,
            includes: pkg.translation.includes,
            excludes: pkg.translation.excludes,
            notes: pkg.translation.notes,
          },
        },
      },
    });
  }

  console.log("✅ Paquetes sembrados correctamente");
}

main()
  .catch((e) => {
    console.error("❌ Error al sembrar paquetes:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });