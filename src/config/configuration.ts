/**
 * Factory de configuracion centralizada.
 *
 * Por que: agrupar variables de entorno por dominio (app/database/jwt) en lugar
 * de leer process.env disperso en cada modulo. Si manana cambia el nombre de
 * una variable, se ajusta en un solo lugar y los servicios siguen consumiendo
 * `configService.get('database.host')` sin enterarse.
 */
export default () => ({
  app: {
    port: parseInt(process.env.PORT ?? '3000', 10),
    nodeEnv: process.env.NODE_ENV ?? 'development',
  },
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME ?? 'stocksense',
    password: process.env.DB_PASSWORD ?? '',
    name: process.env.DB_NAME ?? 'stocksense',
  },
  mongo: {
    // URI completa con credenciales y authSource. Si esta vacia, AppModule
    // no registra MongooseModule -> la app arranca sin analitica.
    uri: process.env.MONGO_URI ?? '',
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? '',
    expiration: process.env.JWT_EXPIRATION ?? '15m',
    refreshExpiration: process.env.JWT_REFRESH_EXPIRATION ?? '7d',
  },
  groq: {
    // Si esta vacia, GroqProvider devuelve null y AiService responde
    // ServiceUnavailable en runtime. La app arranca igual sin IA.
    apiKey: process.env.GROQ_API_KEY ?? '',
    model: process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
    maxTokens: parseInt(process.env.GROQ_MAX_TOKENS ?? '2048', 10),
    temperature: parseFloat(process.env.GROQ_TEMPERATURE ?? '0.3'),
  },
});
