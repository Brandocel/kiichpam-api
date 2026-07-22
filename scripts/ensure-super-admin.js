/**
 * Crea o reasciende un usuario del panel a SUPER_ADMIN (y lo deja activo).
 * Úsalo para recuperar acceso si te quedaste sin administrador.
 *
 * Uso:
 *   node scripts/ensure-super-admin.js <email> [password]
 *
 * Si no pasas argumentos, usa las envs ADMIN_SEED_EMAIL / ADMIN_SEED_PASSWORD.
 * Si el usuario ya existe:
 *   - Lo pone en rol SUPER_ADMIN y activo.
 *   - Solo cambia la contraseña si le pasas una nueva.
 * Si no existe: lo crea (requiere contraseña).
 *
 * La conexión usa la variable DATABASE_URL del entorno donde lo ejecutes.
 */
const { randomBytes, scryptSync } = require('crypto');
const { PrismaClient } = require('@prisma/client');

function hashPassword(plainPassword) {
  const salt = randomBytes(16);
  const derivedKey = scryptSync(plainPassword, salt, 64);
  return `scrypt$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

async function main() {
  const email = (process.argv[2] || process.env.ADMIN_SEED_EMAIL || '')
    .trim()
    .toLowerCase();
  const password = process.argv[3] || process.env.ADMIN_SEED_PASSWORD || '';

  if (!email) {
    console.error(
      'Falta el email. Uso: node scripts/ensure-super-admin.js <email> [password]',
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    const existing = await prisma.adminUser.findUnique({ where: { email } });

    if (existing) {
      const data = { role: 'SUPER_ADMIN', isActive: true };

      if (password) {
        data.password = hashPassword(password);
      }

      await prisma.adminUser.update({ where: { email }, data });

      console.log(
        `✅ ${email} ahora es SUPER_ADMIN y está activo.` +
          (password ? ' Contraseña actualizada.' : ''),
      );
    } else {
      if (!password) {
        console.error(
          'El usuario no existe. Debes pasar una contraseña para crearlo.',
        );
        process.exit(1);
      }

      await prisma.adminUser.create({
        data: {
          name: 'Administrador',
          email,
          password: hashPassword(password),
          role: 'SUPER_ADMIN',
          isActive: true,
        },
      });

      console.log(`✅ Usuario SUPER_ADMIN creado: ${email}`);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
