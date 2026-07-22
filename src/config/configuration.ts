export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),

  databaseUrl: process.env.DATABASE_URL,

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  },

  app: {
    env: process.env.NODE_ENV ?? 'development',
    corsOrigin: process.env.CORS_ORIGIN ?? '*',
    url: process.env.APP_URL,
  },

  integrationAuth: {
    clientKey: process.env.API_CLIENT_KEY,
    clientSecret: process.env.API_CLIENT_SECRET,
  },

  /**
   * Credenciales para sembrar el SUPER_ADMIN inicial del panel administrativo.
   * Solo se usan si la tabla admin_user está vacía.
   */
  adminSeed: {
    email: process.env.ADMIN_SEED_EMAIL,
    password: process.env.ADMIN_SEED_PASSWORD,
    name: process.env.ADMIN_SEED_NAME,
  },

  swagger: {
    user: process.env.SWAGGER_USER,
    password: process.env.SWAGGER_PASSWORD,
  },

  whatsapp: {
    token: process.env.WHATSAPP_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
    apiVersion: process.env.WHATSAPP_API_VERSION ?? 'v21.0',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
  },

  ai: {
    geminiApiKey: process.env.GEMINI_API_KEY,
  },
});