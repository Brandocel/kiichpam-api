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
    },
  });
  