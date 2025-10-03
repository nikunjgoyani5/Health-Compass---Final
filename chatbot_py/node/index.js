const { askBot, factsheetSearch, recommend, rateLimitInfo, health } = require('./apiClient');

(async () => {
  try {
    console.log('Health:', await health());

    const ask = await askBot('What is vitamin C?');
    console.log('Ask bot:', ask);

    const fsr = await factsheetSearch('aspirin');
    console.log('Factsheet search:', fsr);

    const rec = await recommend(['immune support', 'energy'], { age: 'adult' });
    console.log('Recommendations:', rec);

    console.log('Rate limit:', await rateLimitInfo());
  } catch (e) {
    console.error('Node API client error:', e.message);
    process.exit(1);
  }
})();


