const axios = require('axios');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:5000';

async function callMlService(path, payload) {
  const url = `${ML_SERVICE_URL.replace(/\/+$/, '')}${path}`;
  try {
    const response = await axios.post(url, payload, {
      timeout: 4000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    return { data: response.data, error: null };
  } catch (error) {
    const message = error?.response?.data || error?.message || 'Unknown ML service error';
    console.error(`ML service call failed for ${path}:`, message);
    return { data: null, error: message };
  }
}

async function rankProvidersForBooking(booking, providers, topK = 5) {
  return callMlService('/rank-providers', {
    booking,
    providers,
    top_k: topK
  });
}

async function recommendServicesForUser(payload) {
  return callMlService('/recommend-services', payload);
}

module.exports = {
  rankProvidersForBooking,
  recommendServicesForUser
};

