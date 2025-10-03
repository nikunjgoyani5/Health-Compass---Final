const axios = require('axios');

const api = axios.create({
  baseURL: process.env.HC_API_URL || 'http://localhost:8000',
  timeout: 60000 // allow up to 60s for OpenAI-backed requests
});

async function askBot(query, opts = {}) {
  const { supplement_id, medicine_id, vaccine_id, anon_token } = opts;
  const { data } = await api.post('/api/bot/ask', {
    query,
    supplement_id,
    medicine_id,
    vaccine_id,
    anon_token
  });
  return data;
}

async function factsheetSearch(query, anon_token) {
  const { data } = await api.post('/api/bot/factsheet-search', { query, anon_token });
  return data;
}

async function recommend(tags = [], properties = {}, anon_token) {
  const { data } = await api.post('/api/bot/recommend', { tags, properties, anon_token });
  return data;
}

async function rateLimitInfo() {
  const { data } = await api.get('/api/rate-limit/info');
  return data;
}

async function health() {
  const { data } = await api.get('/health');
  return data;
}

module.exports = { askBot, factsheetSearch, recommend, rateLimitInfo, health };


