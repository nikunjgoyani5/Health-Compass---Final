/**
 * Test script for Python Bridge functionality
 * Run this to verify if the bridge is working properly
 */

import pythonNodeBridge from "./python_node_bridge.js";

async function testPythonBridge() {
  console.log("🧪 Testing Python Bridge...");
  
  // Wait a bit for initialization
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log("📊 Bridge Status:", pythonNodeBridge.getStatus());
  console.log("🔍 Is Available:", pythonNodeBridge.isAvailable());
  
  if (pythonNodeBridge.isAvailable()) {
    console.log("✅ Python Bridge is available!");
    
    try {
      // Test medicine schedule function
      console.log("🧪 Testing getMedicineSchedule...");
      const result = await pythonNodeBridge.getMedicineSchedule(
        "What medicines do I need to take today?",
        "test_token",
        "2025-08-26"
      );
      console.log("📋 Medicine Schedule Result:", result);
    } catch (error) {
      console.error("❌ Error testing medicine schedule:", error.message);
    }
    
    try {
      // Test AI chat function
      console.log("🧪 Testing chatWithAI...");
      const chatResult = await pythonNodeBridge.chatWithAI(
        "Hello, how are you?",
        { queryType: "GENERAL" }
      );
      console.log("💬 Chat Result:", chatResult);
    } catch (error) {
      console.error("❌ Error testing AI chat:", error.message);
    }
  } else {
    console.log("❌ Python Bridge is not available");
    console.log("💡 Check if:");
    console.log("   - ENABLE_PYTHON_BRIDGE=true is set");
    console.log("   - Python process is running");
    console.log("   - Port 8000 is accessible");
  }
  
  // Cleanup
  await pythonNodeBridge.shutdown();
  process.exit(0);
}

// Handle errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run test
testPythonBridge().catch(console.error);
