/**
 * Corrige el campo `method` de la tabla Payment leyendo el método real desde
 * Stripe (el cargo liquidado de cada PaymentIntent).
 *
 * Hace falta porque durante un tiempo el método se dedujo de
 * `payment_method_types`, que con `automatic_payment_methods` trae TODOS los
 * métodos habilitados en la cuenta. Como OXXO se revisaba antes que tarjeta,
 * los cobros con tarjeta quedaron guardados como OXXO.
 *
 * Uso:
 *   node scripts/fix-payment-methods.js --dry-run     (solo reporta)
 *   node scripts/fix-payment-methods.js               (aplica los cambios)
 *
 * Requiere STRIPE_SECRET_KEY y DATABASE_URL del entorno donde lo ejecutes.
 * Ojo: la llave debe ser la del MISMO modo (live/test) que creó los pagos.
 */
require('dotenv').config({ quiet: true });

const { PrismaClient } = require('@prisma/client');
const Stripe = require('stripe');

const prisma = new PrismaClient();

async function resolveRealMethod(stripe, reference) {
  if (!reference || !reference.startsWith('pi_')) {
    return null;
  }

  const intent = await stripe.paymentIntents.retrieve(reference);

  if (!intent.latest_charge) {
    // Sin cargo liquidado no hay forma de saber con qué se pagó.
    // Se respeta la intención declarada al crear el intent, si existe.
    const declared = intent.metadata?.paymentType;

    if (declared === 'oxxo') return 'OXXO';
    if (declared === 'card') return 'CARD';

    const types = intent.payment_method_types || [];

    return types.length === 1 ? types[0].toUpperCase() : 'PENDING';
  }

  const charge = await stripe.charges.retrieve(String(intent.latest_charge));
  const type = charge.payment_method_details?.type;

  return type ? type.toUpperCase() : null;
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');

  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY no está configurado');
  }

  const stripe = new Stripe(secretKey);

  const payments = await prisma.payment.findMany({
    where: { provider: 'STRIPE' },
    orderBy: { createdAt: 'asc' },
  });

  console.log(
    `${payments.length} pagos de Stripe por revisar${isDryRun ? ' (simulacro, no se escribe nada)' : ''}.\n`,
  );

  const summary = { corregidos: 0, iguales: 0, sinDato: 0, errores: 0 };
  const cambios = {};

  for (const payment of payments) {
    try {
      const real = await resolveRealMethod(stripe, payment.reference);

      if (!real) {
        summary.sinDato += 1;
        continue;
      }

      if (real === payment.method) {
        summary.iguales += 1;
        continue;
      }

      const key = `${payment.method} -> ${real}`;
      cambios[key] = (cambios[key] || 0) + 1;

      if (!isDryRun) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { method: real },
        });
      }

      summary.corregidos += 1;
    } catch (error) {
      summary.errores += 1;

      const message = error instanceof Error ? error.message : String(error);

      console.warn(`  ! ${payment.reference}: ${message}`);
    }
  }

  console.log('\nResumen:', summary);
  console.log('Cambios por tipo:', cambios);

  if (isDryRun && summary.corregidos > 0) {
    console.log(
      '\nFue un simulacro. Vuelve a correrlo sin --dry-run para aplicarlo.',
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
