const axios = require('axios');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:5000';
const ML_RECOMMEND_TIMEOUT_MS = parseInt(
  process.env.ML_SERVICE_TIMEOUT_MS || process.env.ML_RECOMMEND_TIMEOUT_MS || '15000',
  10
);

async function callMlService(path, payload, { timeoutMs } = {}) {
  const url = `${ML_SERVICE_URL.replace(/\/+$/, '')}${path}`;
  const timeout =
    timeoutMs != null
      ? timeoutMs
      : path.includes('recommend-services')
        ? Math.max(4000, ML_RECOMMEND_TIMEOUT_MS)
        : 4000;
  try {
    const response = await axios.post(url, payload, {
      timeout,
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

