import axios from 'axios';

const BASE_URL = 'http://localhost:8002';
const ENDPOINT = '/api/v1/enhanced-bot/chat-enhanced';

async function testSupplementCreation() {
  console.log('🧪 Testing Supplement Creation with Purpose Field');
  console.log('─'.repeat(60));
  
  try {
    const response = await axios.post(`${BASE_URL}${ENDPOINT}`, {
      message: 'create a supplement with name: Omega-3 Fish Oil, dosage: 1000mg, purpose: heart health and brain function, created by: NOW Foods, price: $35, description: Premium fish oil supplement rich in EPA and DHA for cardiovascular health and cognitive function, quantity: 90 softgels, brand: NOW Foods, manufacturer: NOW Foods, expiration: 2026-08-15'
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
  
  console.log('─'.repeat(60));
}

// Wait for server to start
setTimeout(() => {
  testSupplementCreation().catch(console.error);
}, 3000);
