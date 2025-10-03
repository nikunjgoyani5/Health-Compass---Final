/**
 *  Python-Node.js Bridge for Health Compass AI System
 * 
 * This file integrates the Python FastAPI chatbot functionality into the Node.js application.
 * It provides:
 * - AI-powered health chatbot with factsheet detection
 * - Supplement/medicine/vaccine information search
 * - GPT-4 fallback for unknown queries
 * - Rate limiting and security measures
 * - Comprehensive logging and analytics
 */

import axios from "axios";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PythonNodeBridge {
  constructor() {
    this.pythonProcess = null;
    // Use env override; default to FastAPI's main.py default (8000)
    this.pythonPort = parseInt(process.env.PYTHON_BRIDGE_PORT || "8000");
    // Use 127.0.0.1 to avoid IPv6 (::1) localhost issues on Windows
    this.pythonUrl = `http://127.0.0.1:${this.pythonPort}`;
    this.isPythonRunning = false;
    this.healthCheckInterval = null;
    this.externalUrl = process.env.PYTHON_EXTERNAL_URL || null;
    this.externalMode = !!this.externalUrl;
    if (this.externalMode) {
      this.pythonUrl = this.externalUrl; // override host:port entirely
    }
    
    // Initialize the bridge
    this.init();
  }

  /**
   * Initialize the Python-Node bridge
   */
  async init() {
    try {
      console.log(" Initializing Python-Node.js Bridge...");
      
      // Normalize ENABLE_PYTHON_BRIDGE flag (accepts true/"true"/1/on/yes; anything else treated as disabled)
      const rawFlag = (process.env.ENABLE_PYTHON_BRIDGE || "").trim();
      const normalizedFlag = rawFlag.replace(/['"]/g, "").toLowerCase();
      // Default ENABLED unless explicitly disabled
      const explicitlyDisabled = ["false", "0", "off", "no", "disabled"].includes(normalizedFlag);
      const enableBridge = normalizedFlag === "" ? true : !explicitlyDisabled;
      console.log(" Python bridge flag:", rawFlag || "<empty>", "=>", enableBridge ? "enabled" : "disabled");

      // Check if Python process should be started
      if (enableBridge) {
        if (this.externalMode) {
          console.log(" Using external Python service:", this.pythonUrl);
          await this.waitForPythonStartup();
          this.startHealthCheck();
        } else {
          await this.startPythonProcess();
          this.startHealthCheck();
        }
      } else {
        console.log(" Python bridge disabled. Set ENABLE_PYTHON_BRIDGE=true to enable.");
      }
    } catch (error) {
      console.error("Failed to initialize Python-Node bridge:", error.message);
    }
  }

  /**
   * Start the Python FastAPI process
   */
  async startPythonProcess() {
    try {
      const pythonDir = path.join(__dirname, "chatbot_py");
      
      // Check if Python directory exists
      if (!fs.existsSync(pythonDir)) {
        console.warn(" Python chatbot directory not found:", pythonDir);
        return;
      }

      // Check if requirements.txt exists and install dependencies
      const requirementsPath = path.join(pythonDir, "requirements.txt");
      if (fs.existsSync(requirementsPath)) {
        console.log(" Installing Python dependencies...");
        await this.installPythonDependencies(pythonDir);
      }

      // Start Python process
      console.log("Starting Python FastAPI process...");
      // Start FastAPI on the configured port. main.py defaults to 8000; we pass PORT env
      const pythonExecutable = process.env.PYTHON_PATH || "python";
      this.pythonProcess = spawn(pythonExecutable, ["main.py"], {
        cwd: pythonDir,
        env: {
          ...process.env,
          PORT: this.pythonPort.toString(),
          MONGODB_URL: process.env.MONGODB_URL || "mongodb://localhost:27017",
          MONGODB_DB: process.env.MONGODB_DB || "health-compass",
          OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
          LOG_LEVEL: process.env.LOG_LEVEL || "INFO"
        },
        stdio: ["pipe", "pipe", "pipe"]
      });

      // Handle Python process events
      this.pythonProcess.stdout.on("data", (data) => {
        console.log("Python:", data.toString().trim());
      });

      this.pythonProcess.stderr.on("data", (data) => {
        console.error("Python Error:", data.toString().trim());
      });

      this.pythonProcess.on("close", (code) => {
        console.log(` Python process exited with code ${code}`);
        this.isPythonRunning = false;
        this.pythonProcess = null;
      });

      this.pythonProcess.on("error", (error) => {
        console.error("Python process error:", error);
        this.isPythonRunning = false;
      });

      // Wait for Python to start
      await this.waitForPythonStartup();
      
    } catch (error) {
      console.error("Failed to start Python process:", error.message);
    }
  }

  /**
   * Install Python dependencies
   */
  async installPythonDependencies(pythonDir) {
    return new Promise((resolve, reject) => {
      const pythonExecutable = process.env.PYTHON_PATH || "python";
      const pip = spawn(pythonExecutable, ["-m", "pip", "install", "-r", "requirements.txt"], {
        cwd: pythonDir,
        stdio: "pipe"
      });

      pip.on("close", (code) => {
        if (code === 0) {
          console.log("Python dependencies installed successfully");
          resolve();
        } else {
          console.warn("Failed to install Python dependencies");
          resolve(); // Continue anyway
        }
      });

      pip.on("error", (error) => {
        console.warn(" Pip error:", error.message);
        resolve(); // Continue anyway
      });
    });
  }

  /**
   * Wait for Python FastAPI to start up
   */
  async waitForPythonStartup() {
    const maxAttempts = 90;
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const response = await axios.get(`${this.pythonUrl}/health`, { timeout: 3000 });
        if (response.status === 200) {
          console.log("Python FastAPI is running on port", this.pythonPort);
          this.isPythonRunning = true;
          return;
        }
      } catch (error) {
        // Expected during startup
      }

      attempts++;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.warn("Python FastAPI failed to start within timeout");
  }

  /**
   * Start health check for Python process
   */
  startHealthCheck() {
    this.healthCheckInterval = setInterval(async () => {
      if ((this.externalMode || this.pythonProcess) && !this.isPythonRunning) {
        try {
          const response = await axios.get(`${this.pythonUrl}/health`, { timeout: 5000 });
          if (response.status === 200) {
            this.isPythonRunning = true;
          }
        } catch (error) {
          this.isPythonRunning = false;
        }
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Stop the Python process
   */
  async stopPythonProcess() {
    if (this.pythonProcess) {
      console.log("Stopping Python process...");
      this.pythonProcess.kill("SIGTERM");
      
      // Wait for graceful shutdown
      await new Promise(resolve => {
        this.pythonProcess.on("close", resolve);
        setTimeout(resolve, 5000); // Force kill after 5 seconds
      });
      
      this.pythonProcess = null;
      this.isPythonRunning = false;
    }

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Check if Python bridge is available
   */
  isAvailable() {
    return this.isPythonRunning && (this.externalMode || this.pythonProcess);
  }

  /**
   * Get Python bridge status
   */
  getStatus() {
    return {
      isRunning: this.isPythonRunning,
      port: this.externalMode ? null : this.pythonPort,
      url: this.pythonUrl,
      processId: this.externalMode ? null : (this.pythonProcess?.pid || null)
    };
  }

  /**
   * Enhanced AI chatbot with Python integration
   */
  async chatWithAI(query, context = {}) {
    try {
      console.log('🐍 Python Bridge: Starting AI chat...');
      
      // Always use comprehensive endpoint - no more personalized query logic
      const response = await this._callComprehensiveEndpoint(query, context);
      
      console.log('🐍 Python Bridge: Comprehensive response successful ✅');
      return response;
      
    } catch (error) {
      console.error('🐍 Python Bridge Error:', error);
      throw error;
    }
  }

  /**
   * Get AI-based supplement recommendations
   */
  async getSupplementRecommendations(healthTags, preferences = {}) {
    try {
      if (!this.isAvailable()) {
        throw new Error("Python bridge not available");
      }

      const response = await axios.post(`${this.pythonUrl}/api/bot/recommend`, {
        health_tags: healthTags,
        preferences,
        user_id: preferences.userId
      }, {
        timeout: 20000,
        headers: {
          "Content-Type": "application/json",
          "X-Node-Bridge": "true"
        }
      });

      return {
        success: true,
        recommendations: response.data,
        source: "python_bridge"
      };

    } catch (error) {
      console.error("Supplement recommendations error:", error.message);
      
      return {
        success: false,
        error: error.message,
        source: "none"
      };
    }
  }

  /**
   * Get medicine schedule from Python bridge
   */
  async getMedicineSchedule(message, userToken, date) {
    try {
      if (!this.isAvailable()) {
        throw new Error("Python bridge not available");
      }

      console.log('🐍 Python Bridge: Getting medicine schedule for date:', date);
      
      const response = await axios.post(`${this.pythonUrl}/api/bot/medicine-schedule`, {
        query: message,
        date: date,
        user_token: userToken
      }, {
        timeout: 20000,
        headers: {
          "Content-Type": "application/json",
          "X-Node-Bridge": "true",
          "Authorization": `Bearer ${userToken}`
        }
      });

      return {
        success: true,
        data: response.data,
        response: response.data?.response || response.data?.message || "Medicine schedule retrieved successfully",
        source: "python_bridge"
      };

    } catch (error) {
      console.error("Medicine schedule error:", error.message);
      
      return {
        success: false,
        error: error.message,
        source: "none"
      };
    }
  }

  /**
   * Get AI query logs and analytics
   */
  async getAILogs(filters = {}) {
    try {
      if (!this.isAvailable()) {
        throw new Error("Python bridge not available");
      }

      const response = await axios.get(`${this.pythonUrl}/api/admin/logs/queries`, {
        params: filters,
        timeout: 10000,
        headers: {
          "X-Node-Bridge": "true"
        }
      });

      return {
        success: true,
        logs: response.data,
        source: "python_bridge"
      };

    } catch (error) {
      console.error("AI logs error:", error.message);
      
      return {
        success: false,
        error: error.message,
        source: "none"
      };
    }
  }

  /**
   * Get supplement view analytics
   */
  async getSupplementAnalytics(filters = {}) {
    try {
      if (!this.isAvailable()) {
        throw new Error("Python bridge not available");
      }

      const response = await axios.get(`${this.pythonUrl}/api/admin/logs/views`, {
        params: filters,
        timeout: 10000,
        headers: {
          "X-Node-Bridge": "true"
        }
      });

      return {
        success: true,
        analytics: response.data,
        source: "python_bridge"
      };

    } catch (error) {
      console.error("Supplement analytics error:", error.message);
      
      return {
        success: false,
        error: error.message,
        source: "none"
      };
    }
  }

  /**
   * Log supplement view for analytics
   */
  async logSupplementView(supplementId, context = {}) {
    try {
      if (!this.isAvailable()) {
        console.warn("Python bridge not available, skipping supplement view log");
        return { success: false, skipped: true };
      }

      const response = await axios.post(`${this.pythonUrl}/api/supplements/${supplementId}/view`, {
        anon_token: context.anonToken,
        user_agent: context.userAgent,
        ip_address: context.ipAddress,
        referrer: context.referrer
      }, {
        timeout: 5000,
        headers: {
          "Content-Type": "application/json",
          "X-Node-Bridge": "true"
        }
      });

      return {
        success: true,
        logged: true,
        source: "python_bridge"
      };

    } catch (error) {
      console.error(" Supplement view logging error:", error.message);
      
      return {
        success: false,
        error: error.message,
        source: "none"
      };
    }
  }

  /**
   * Get rate limit information
   */
  async getRateLimitInfo(identifier) {
    try {
      if (!this.isAvailable()) {
        throw new Error("Python bridge not available");
      }

      const response = await axios.get(`${this.pythonUrl}/api/rate-limit/info`, {
        params: { identifier },
        timeout: 5000,
        headers: {
          "X-Node-Bridge": "true"
        }
      });

      return {
        success: true,
        info: response.data,
        source: "python_bridge"
      };

    } catch (error) {
      console.error("Rate limit info error:", error.message);
      
      return {
        success: false,
        error: error.message,
        source: "none"
      };
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log("Shutting down Python-Node bridge...");
    await this.stopPythonProcess();
    console.log(" Python-Node bridge shutdown complete");
  }

  async _callComprehensiveEndpoint(query, context) {
    try {
      const response = await axios.post(`${this.pythonUrl}/api/bot/comprehensive`, {
        query
      }, {
        timeout: 30000,
        headers: {
          "Content-Type": "application/json",
          "X-Node-Bridge": "true"
        }
      });

      return {
        success: true,
        response: response.data,
        source: "python_bridge_comprehensive"
      };
    } catch (error) {
      console.error('🐍 Python Bridge: Comprehensive endpoint error:', error);
      throw error;
    }
  }
}

// Create singleton instance
const pythonNodeBridge = new PythonNodeBridge();

// Handle process termination
process.on("SIGINT", async () => {
  console.log("Received SIGINT, shutting down...");
  await pythonNodeBridge.shutdown();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("Received SIGTERM, shutting down...");
  await pythonNodeBridge.shutdown();
  process.exit(0);
});

export default pythonNodeBridge;