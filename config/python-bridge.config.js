/**
 * Python Bridge Configuration
 * 
 * Configuration settings for the Python-Node.js bridge integration
 */

import dotenv from "dotenv";

dotenv.config();

const pythonBridgeConfig = {
  // Python Process Configuration
  python: {
    port: process.env.PYTHON_BRIDGE_PORT || 8001,
    host: process.env.PYTHON_BRIDGE_HOST || "localhost",
    startupTimeout: parseInt(process.env.PYTHON_STARTUP_TIMEOUT) || 30000, // 30 seconds
    healthCheckInterval: parseInt(process.env.PYTHON_HEALTH_CHECK_INTERVAL) || 30000, // 30 seconds
    gracefulShutdownTimeout: parseInt(process.env.PYTHON_GRACEFUL_SHUTDOWN_TIMEOUT) || 5000, // 5 seconds
  },

  // Bridge Features Configuration
  features: {
    enabled: process.env.ENABLE_PYTHON_BRIDGE === "true",
    autoStart: process.env.AUTO_START_PYTHON_BRIDGE === "true",
    fallbackToNode: process.env.PYTHON_BRIDGE_FALLBACK === "true",
    installDependencies: process.env.INSTALL_PYTHON_DEPS === "true",
  },

  // AI Service Configuration
  ai: {
    defaultModel: process.env.PYTHON_DEFAULT_MODEL || "gpt-4",
    timeout: parseInt(process.env.PYTHON_AI_TIMEOUT) || 30000, // 30 seconds
    maxRetries: parseInt(process.env.PYTHON_AI_MAX_RETRIES) || 3,
    rateLimitEnabled: process.env.PYTHON_RATE_LIMIT_ENABLED === "true",
  },

  // Factsheet Search Configuration
  factsheet: {
    enabled: process.env.PYTHON_FACTSHEET_ENABLED === "true",
    searchTimeout: parseInt(process.env.PYTHON_FACTSHEET_TIMEOUT) || 15000, // 15 seconds
    autoDetection: process.env.PYTHON_FACTSHEET_AUTO_DETECTION === "true",
    gpt4Fallback: process.env.PYTHON_FACTSHEET_GPT4_FALLBACK === "true",
  },

  // Analytics Configuration
  analytics: {
    enabled: process.env.PYTHON_ANALYTICS_ENABLED === "true",
    logQueries: process.env.PYTHON_LOG_QUERIES === "true",
    logViews: process.env.PYTHON_LOG_VIEWS === "true",
    logRateLimits: process.env.PYTHON_LOG_RATE_LIMITS === "true",
  },

  // Security Configuration
  security: {
    validateRequests: process.env.PYTHON_VALIDATE_REQUESTS === "true",
    allowedOrigins: process.env.PYTHON_ALLOWED_ORIGINS?.split(",") || ["*"],
    maxRequestSize: process.env.PYTHON_MAX_REQUEST_SIZE || "10mb",
    enableCors: process.env.PYTHON_ENABLE_CORS === "true",
  },

  // Logging Configuration
  logging: {
    level: process.env.PYTHON_LOG_LEVEL || "info",
    enableConsole: process.env.PYTHON_LOG_CONSOLE === "true",
    enableFile: process.env.PYTHON_LOG_FILE === "true",
    logFile: process.env.PYTHON_LOG_FILE_PATH || "logs/python-bridge.log",
  },

  // Database Configuration (for Python service)
  database: {
    mongodb: {
      url: process.env.MONGODB_URL || "mongodb://localhost:27017",
      database: process.env.MONGODB_DB || "health-compass",
      options: {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      },
    },
    redis: {
      url: process.env.REDIS_URL || "redis://localhost:6379",
      enabled: process.env.REDIS_ENABLED === "true",
    },
  },

  // OpenAI Configuration (for Python service)
  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    model: process.env.OPENAI_MODEL || "gpt-4",
    maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 4000,
    temperature: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.7,
  },

  // Rate Limiting Configuration
  rateLimiting: {
    enabled: process.env.PYTHON_RATE_LIMIT_ENABLED === "true",
    requestsPerWindow: parseInt(process.env.PYTHON_RATE_LIMIT_REQUESTS) || 100,
    windowInSeconds: parseInt(process.env.PYTHON_RATE_LIMIT_WINDOW) || 3600,
    enableIPBased: process.env.PYTHON_RATE_LIMIT_IP === "true",
    enableTokenBased: process.env.PYTHON_RATE_LIMIT_TOKEN === "true",
  },

  // Health Check Configuration
  healthCheck: {
    enabled: process.env.PYTHON_HEALTH_CHECK_ENABLED === "true",
    endpoint: process.env.PYTHON_HEALTH_ENDPOINT || "/health",
    interval: parseInt(process.env.PYTHON_HEALTH_INTERVAL) || 30000, // 30 seconds
    timeout: parseInt(process.env.PYTHON_HEALTH_TIMEOUT) || 5000, // 5 seconds
    maxFailures: parseInt(process.env.PYTHON_HEALTH_MAX_FAILURES) || 3,
  },

  // Development Configuration
  development: {
    debug: process.env.NODE_ENV === "development",
    hotReload: process.env.PYTHON_HOT_RELOAD === "true",
    verboseLogging: process.env.PYTHON_VERBOSE_LOGGING === "true",
    mockPythonService: process.env.PYTHON_MOCK_SERVICE === "true",
  },
};

// Helper functions
pythonBridgeConfig.getPythonUrl = () => {
  return `http://${pythonBridgeConfig.python.host}:${pythonBridgeConfig.python.port}`;
};

pythonBridgeConfig.isFeatureEnabled = (featureName) => {
  return pythonBridgeConfig.features[featureName] === true;
};

pythonBridgeConfig.getDatabaseUrl = () => {
  return pythonBridgeConfig.database.mongodb.url;
};

pythonBridgeConfig.getDatabaseName = () => {
  return pythonBridgeConfig.database.mongodb.database;
};

pythonBridgeConfig.getOpenAIConfig = () => {
  return {
    apiKey: pythonBridgeConfig.openai.apiKey,
    model: pythonBridgeConfig.openai.model,
    maxTokens: pythonBridgeConfig.openai.maxTokens,
    temperature: pythonBridgeConfig.openai.temperature,
  };
};

export default pythonBridgeConfig;
