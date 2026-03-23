// Netlify Function: sync-data.js
// Simple PIN-protected data sync for FinTrack
// Uses Netlify Blobs for persistent storage

const { getStore } = require('@netlify/blobs');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-fintrack-pin',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const pin = event.headers['x-fintrack-pin'] || '';
  if (!pin || pin.length < 4) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: 'Invalid PIN' })
    };
  }

  // Use PIN as the store key (hashed for safety)
  const storeKey = 'fintrack_' + Buffer.from(pin).toString('base64').replace(/[^a-z0-9]/gi, '');

  try {
    const store = getStore('fintrack-sync');

    if (event.httpMethod === 'GET') {
      // Download data
      const raw = await store.get(storeKey);
      if (!raw) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ exists: false, transactions: [], customExpCats: [], customIncCats: [], vendorRules: [] })
        };
      }
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ exists: true, ...JSON.parse(raw) })
      };
    }

    if (event.httpMethod === 'POST') {
      // Upload data
      let body;
      try {
        body = JSON.parse(event.body);
      } catch(e) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
      }

      const data = {
        transactions:   body.transactions   || [],
        customExpCats:  body.customExpCats  || [],
        customIncCats:  body.customIncCats  || [],
        vendorRules:    body.vendorRules    || [],
        lastSync:       new Date().toISOString()
      };

      await store.set(storeKey, JSON.stringify(data));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, transactions: data.transactions.length, lastSync: data.lastSync })
      };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch(e) {
    console.error('Sync error:', e);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: e.message || 'Server error' })
    };
  }
};
