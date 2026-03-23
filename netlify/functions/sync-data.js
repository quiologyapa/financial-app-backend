// Netlify Function: sync-data.js
// PIN-protected data sync using Netlify Blobs (persistent storage)

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

  const pin = (event.headers['x-fintrack-pin'] || '').trim();
  if (!pin || pin.length < 4) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: 'Invalid PIN — must be 4+ characters' })
    };
  }

  // Derive a safe storage key from PIN
  const storeKey = 'user_' + Buffer.from(pin).toString('hex');

  try {
    // Dynamically require blobs (available in Netlify runtime)
    const { getStore } = require('@netlify/blobs');
    const store = getStore({ name: 'fintrack', consistency: 'strong' });

    if (event.httpMethod === 'GET') {
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
      let body;
      try { body = JSON.parse(event.body); }
      catch(e) { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) }; }

      const data = {
        transactions:  body.transactions  || [],
        customExpCats: body.customExpCats || [],
        customIncCats: body.customIncCats || [],
        vendorRules:   body.vendorRules   || [],
        lastSync:      new Date().toISOString()
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
    console.error('Sync error:', e.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: e.message || 'Server error' })
    };
  }
};
