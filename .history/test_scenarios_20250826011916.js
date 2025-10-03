import axios from 'axios';

const BASE_URL = 'http://localhost:8002';
const ENDPOINT = '/api/v1/enhanced-bot/chat-enhanced';

async function testScenario(scenarioName, message) {
  console.log(`\n🧪 Testing: ${scenarioName}`);
  console.log(`📝 Message: "${message}"`);
  console.log('─'.repeat(50));
  
  try {
    const response = await axios.post(`${BASE_URL}${ENDPOINT}`, {
      message: message
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Response received:');
    console.log(`Status: ${response.status}`);
    console.log(`Bot Reply: "${response.data.body.messages[response.data.body.messages.length - 1].message}"`);
    
    if (response.data.body.messages.length > 1) {
      console.log(`Previous messages: ${response.data.body.messages.length - 1}`);
    }
    
  } catch (error) {
    console.log('❌ Error occurred:');
    if (error.response) {
      console.log(`Status: ${error.response.status}`);
      console.log(`Error: ${error.response.data.message || error.message}`);
    } else {
      console.log(`Error: ${error.message}`);
    }
  }
  
  console.log('─'.repeat(50));
}

async function runAllTests() {
  console.log('🚀 Starting Health Bot Enhanced Controller Tests');
  console.log('='.repeat(60));
  
  // Wait a bit for server to start
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Test 1: Off-topic query
  await testScenario(
    'Off-topic Query', 
    'what is python'
  );
  
  // Wait between tests
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Test 2: Medicine schedule query
  await testScenario(
    'Medicine Schedule Query', 
    'show my medicine schedule on 2025-08-25'
  );
  
  // Wait between tests
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Test 3: Supplement creation with full details
  await testScenario(
    'Supplement Creation with Full Details', 
    'create a supplement with name: Omega-3 Fish Oil, dosage: 1000mg, purpose: heart health and brain function, created by: NOW Foods, price: $35, description: Premium fish oil supplement rich in EPA and DHA for cardiovascular health and cognitive function, quantity: 90 softgels, brand: NOW Foods, manufacturer: NOW Foods, expiration: 2026-08-15'
  );
  
  console.log('\n🎯 All tests completed!');
}

runAllTests().catch(console.error);
