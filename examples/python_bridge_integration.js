/**
 *  Python-Node Bridge Integration Examples
 * 
 * This file demonstrates how to integrate and use the Python-Node bridge
 * in the Health Compass application.
 */

import pythonNodeBridge from "../python_node_bridge.js";
import pythonBridgeConfig from "../config/python-bridge.config.js";

// Example 1: Basic Bridge Integration
export const basicIntegrationExample = async () => {
  console.log("🔧 Basic Bridge Integration Example");
  
  try {
    // Check if Python bridge is available
    if (pythonNodeBridge.isAvailable()) {
      console.log("✅ Python Bridge is running");
      
      // Get bridge status
      const status = pythonNodeBridge.getStatus();
      console.log("📊 Bridge Status:", status);
      
      // Get configuration
      const pythonUrl = pythonBridgeConfig.getPythonUrl();
      console.log("🌐 Python Service URL:", pythonUrl);
      
    } else {
      console.log("⚠️ Python Bridge is not available");
      console.log("🔄 Falling back to Node.js GPT service");
    }
    
  } catch (error) {
    console.error("Integration error:", error.message);
  }
};

// Example 2: Enhanced AI Chat with Python Bridge
export const enhancedAIChatExample = async (userMessage) => {
  console.log(" Enhanced AI Chat Example");
  
  try {
    if (pythonNodeBridge.isAvailable()) {
      console.log(" Using Python Bridge for enhanced AI response...");
      
      const response = await pythonNodeBridge.chatWithAI(userMessage, {
        queryType: "GENERAL",
        anonToken: "user123",
        userId: "user456"
      });
      
      if (response.success) {
        console.log("Python Bridge response successful");
        console.log("Response:", response.response);
        console.log("Source:", response.source);
        return response;
      }
      
    } else {
      console.log("Python Bridge unavailable, using Node.js fallback");
      // Fallback to Node.js GPT would happen automatically
    }
    
  } catch (error) {
    console.error("AI chat error:", error.message);
  }
};

// Example 3: Factsheet Search
export const factsheetSearchExample = async (query, searchType = "AUTO") => {
  console.log(" Factsheet Search Example");
  
  try {
    if (pythonNodeBridge.isAvailable()) {
      console.log("🔍 Searching factsheet for:", query);
      
      const result = await pythonNodeBridge.searchFactsheet(query, searchType);
      
      if (result.success) {
        console.log("Factsheet found!");
        console.log(" Data:", result.data);
        console.log("Source:", result.source);
        return result;
      } else {
        console.log(" No factsheet found");
        console.log(" Will use GPT-4 fallback");
      }
      
    } else {
      console.log(" Python Bridge not available for factsheet search");
    }
    
  } catch (error) {
    console.error(" Factsheet search error:", error.message);
  }
};

// Example 4: Supplement Recommendations
export const supplementRecommendationsExample = async () => {
  console.log(" Supplement Recommendations Example");
  
  try {
    if (pythonNodeBridge.isAvailable()) {
      const healthTags = ["immunity", "energy", "sleep"];
      const preferences = {
        userId: "user123",
        dietaryRestrictions: ["vegetarian"],
        age: 30,
        activityLevel: "moderate"
      };
      
      console.log(" Health Tags:", healthTags);
      console.log(" Preferences:", preferences);
      
      const result = await pythonNodeBridge.getSupplementRecommendations(healthTags, preferences);
      
      if (result.success) {
        console.log(" Recommendations generated successfully!");
        console.log(" Recommendations:", result.recommendations);
        return result;
      } else {
        console.log(" Failed to generate recommendations");
      }
      
    } else {
      console.log("Python Bridge not available for recommendations");
    }
    
  } catch (error) {
    console.error(" Supplement recommendations error:", error.message);
  }
};

// Example 5: AI Analytics and Logs
export const aiAnalyticsExample = async () => {
  console.log(" AI Analytics Example");
  
  try {
    if (pythonNodeBridge.isAvailable()) {
      // Get AI query logs
      console.log("Fetching AI query logs...");
      const queryLogs = await pythonNodeBridge.getAILogs({
        date: new Date().toISOString().split('T')[0],
        model: "gpt-4-python-bridge"
      });
      
      if (queryLogs.success) {
        console.log(" Query logs retrieved:", queryLogs.logs);
      }
      
      // Get supplement view analytics
      console.log("👁️ Fetching supplement view analytics...");
      const viewAnalytics = await pythonNodeBridge.getSupplementAnalytics({
        dateRange: "last_7_days"
      });
      
      if (viewAnalytics.success) {
        console.log("View analytics retrieved:", viewAnalytics.analytics);
      }
      
    } else {
      console.log("Python Bridge not available for analytics");
    }
    
  } catch (error) {
    console.error(" AI analytics error:", error.message);
  }
};

// Example 6: Rate Limit Information
export const rateLimitExample = async (identifier) => {
  console.log("Rate Limit Example");
  
  try {
    if (pythonNodeBridge.isAvailable()) {
      console.log("🔍 Checking rate limit for:", identifier);
      
      const rateLimitInfo = await pythonNodeBridge.getRateLimitInfo(identifier);
      
      if (rateLimitInfo.success) {
        console.log(" Rate limit info:", rateLimitInfo.info);
        return rateLimitInfo;
      } else {
        console.log(" Failed to get rate limit info");
      }
      
    } else {
      console.log(" Python Bridge not available for rate limiting");
    }
    
  } catch (error) {
    console.error("Rate limit error:", error.message);
  }
};

// Example 7: Supplement View Logging
export const supplementViewLoggingExample = async (supplementId) => {
  console.log(" Supplement View Logging Example");
  
  try {
    if (pythonNodeBridge.isAvailable()) {
      const context = {
        anonToken: "user123",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        ipAddress: "192.168.1.100",
        referrer: "https://health-compass.com/supplements"
      };
      
      console.log(" Logging view for supplement:", supplementId);
      console.log(" Context:", context);
      
      const result = await pythonNodeBridge.logSupplementView(supplementId, context);
      
      if (result.success) {
        console.log(" Supplement view logged successfully");
        console.log(" Source:", result.source);
        return result;
      } else {
        console.log(" Failed to log supplement view");
      }
      
    } else {
      console.log(" Python Bridge not available for view logging");
    }
    
  } catch (error) {
    console.error(" Supplement view logging error:", error.message);
  }
};

// Example 8: Health Monitoring
export const healthMonitoringExample = () => {
  console.log(" Health Monitoring Example");
  
  // Set up health monitoring
  const healthCheckInterval = setInterval(async () => {
    try {
      const status = pythonNodeBridge.getStatus();
      
      if (status.isRunning) {
        console.log("Python service is healthy");
        console.log(" Status:", status);
      } else {
        console.warn("Python service is down");
        console.log("Attempting to restart...");
        
        // The bridge will automatically handle restart
        // You can also manually restart if needed
      }
      
    } catch (error) {
      console.error(" Health check error:", error.message);
    }
  }, 30000); // Check every 30 seconds
  
  // Return cleanup function
  return () => {
    clearInterval(healthCheckInterval);
    console.log("🧹 Health monitoring stopped");
  };
};

// Example 9: Graceful Shutdown
export const gracefulShutdownExample = async () => {
  console.log("Graceful Shutdown Example");
  
  try {
    console.log("Shutting down Python-Node bridge...");
    
    await pythonNodeBridge.shutdown();
    
    console.log("Bridge shutdown complete");
    
  } catch (error) {
    console.error("Shutdown error:", error.message);
  }
};

// Example 10: Configuration Management
export const configurationExample = () => {
  console.log("Configuration Management Example");
  
  try {
    // Check feature flags
    const factsheetEnabled = pythonBridgeConfig.isFeatureEnabled('factsheet.enabled');
    const analyticsEnabled = pythonBridgeConfig.isFeatureEnabled('analytics.enabled');
    const rateLimitEnabled = pythonBridgeConfig.isFeatureEnabled('rateLimiting.enabled');
    
    console.log("Factsheet Search Enabled:", factsheetEnabled);
    console.log("Analytics Enabled:", analyticsEnabled);
    console.log("Rate Limiting Enabled:", rateLimitEnabled);
    
    // Get configuration values
    const pythonUrl = pythonBridgeConfig.getPythonUrl();
    const dbUrl = pythonBridgeConfig.getDatabaseUrl();
    const openaiConfig = pythonBridgeConfig.getOpenAIConfig();
    
    console.log(" Python URL:", pythonUrl);
    console.log(" Database URL:", dbUrl);
    console.log("OpenAI Config:", openaiConfig);
    
  } catch (error) {
    console.error("Configuration error:", error.message);
  }
};

// Example 11: Error Handling and Fallback
export const errorHandlingExample = async (query) => {
  console.log(" Error Handling and Fallback Example");
  
  try {
    // Try Python bridge first
    if (pythonNodeBridge.isAvailable()) {
      console.log("Attempting Python bridge...");
      
      try {
        const response = await pythonNodeBridge.chatWithAI(query);
        
        if (response.success) {
          console.log(" Python bridge successful");
          return response;
        }
        
      } catch (pythonError) {
        console.warn(" Python bridge failed:", pythonError.message);
        console.log(" Falling back to Node.js GPT...");
      }
    }
    
    // Fallback to Node.js GPT
    console.log("Using Node.js GPT fallback...");
    
    // This would typically call your existing Node.js GPT service
    const fallbackResponse = {
      success: true,
      response: "This is a fallback response from Node.js GPT",
      source: "node_fallback"
    };
    
    console.log("Fallback successful");
    return fallbackResponse;
    
  } catch (error) {
    console.error(" All services failed:", error.message);
    
    // Final fallback - user-friendly error message
    return {
      success: false,
      error: "I'm experiencing technical difficulties. Please try again later.",
      source: "error_fallback"
    };
  }
};

// Example 12: Performance Testing
export const performanceTestingExample = async () => {
  console.log(" Performance Testing Example");
  
  try {
    if (pythonNodeBridge.isAvailable()) {
      const queries = [
        "What is vitamin C?",
        "Tell me about aspirin",
        "Information about flu vaccine",
        "What's omega 3?",
        "Explain ibuprofen"
      ];
      
      console.log(" Testing performance with", queries.length, "queries");
      
      const startTime = Date.now();
      const results = [];
      
      for (const query of queries) {
        const queryStart = Date.now();
        
        try {
          const result = await pythonNodeBridge.chatWithAI(query);
          const queryTime = Date.now() - queryStart;
          
          results.push({
            query,
            success: result.success,
            time: queryTime,
            source: result.source
          });
          
          console.log(` "${query}" - ${queryTime}ms - ${result.source}`);
          
        } catch (error) {
          const queryTime = Date.now() - queryStart;
          results.push({
            query,
            success: false,
            time: queryTime,
            error: error.message
          });
          
          console.log(`"${query}" - ${queryTime}ms - Error: ${error.message}`);
        }
      }
      
      const totalTime = Date.now() - startTime;
      const avgTime = totalTime / queries.length;
      
      console.log("Performance Results:");
      console.log(" Total Time:", totalTime, "ms");
      console.log(" Average Time:", avgTime.toFixed(2), "ms");
      console.log(" Successful Queries:", results.filter(r => r.success).length);
      console.log(" Failed Queries:", results.filter(r => !r.success).length);
      
      return {
        totalTime,
        avgTime,
        results,
        successCount: results.filter(r => r.success).length,
        failureCount: results.filter(r => !r.success).length
      };
      
    } else {
      console.log("Python Bridge not available for performance testing");
    }
    
  } catch (error) {
    console.error(" Performance testing error:", error.message);
  }
};

// Export all examples
export default {
  basicIntegrationExample,
  enhancedAIChatExample,
  factsheetSearchExample,
  supplementRecommendationsExample,
  aiAnalyticsExample,
  rateLimitExample,
  supplementViewLoggingExample,
  healthMonitoringExample,
  gracefulShutdownExample,
  configurationExample,
  errorHandlingExample,
  performanceTestingExample
};
