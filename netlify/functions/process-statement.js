exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    let body;
    try {
      body = JSON.parse(event.body);
    } catch(e) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
    }

    const { pdfBase64, apiKey, model } = body;

    if (!pdfBase64) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing pdfBase64' }) };
    if (!apiKey)    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing apiKey' }) };

    // Check size — base64 PDF should be under 4MB
    const sizeKB = Math.round(pdfBase64.length / 1024);
    console.log(`PDF base64 size: ${sizeKB} KB`);
    if (pdfBase64.length > 5000000) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: `PDF too large (${sizeKB} KB). Please use a smaller statement.` }) };
    }

    const selectedModel = model || 'claude-sonnet-4-20250514';
    console.log('Using model:', selectedModel);

    const prompt = `Analyze this bank statement and extract ALL transactions.

For each transaction return:
- date: YYYY-MM-DD format
- merchant: merchant/description name
- amount: positive number only
- category: one of these exact values:
  Food & Supplies, Beverage, Utilities, Rent, Payroll, Equipment, Marketing,
  Maintenance & Repairs, Insurance, Licenses & Permits, Professional Services,
  Office Supplies, Sales Tax, Payroll Taxes, Bank Fees, Credit Card Fees, Other

Return ONLY raw JSON, no markdown, no backticks, no explanation:
{"transactions":[{"date":"2026-01-15","merchant":"SYSCO FOODS","amount":1234.56,"category":"Food & Supplies"}]}`;

    console.log('Calling Anthropic API...');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': apiKey
      },
      body: JSON.stringify({
        model: selectedModel,
        max_tokens: 8000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 }
            },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    console.log('Anthropic response status:', response.status);

    if (!response.ok) {
      let errMsg = response.statusText;
      try { const e = await response.json(); errMsg = e.error?.message || errMsg; } catch {}
      return { statusCode: response.status, headers, body: JSON.stringify({ error: `Anthropic API error: ${errMsg}` }) };
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    console.log('Response length:', text.length);

    let parsed;
    try {
      const match = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(match ? match[0] : text);
    } catch(e) {
      console.error('JSON parse failed. Raw:', text.slice(0, 500));
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Could not parse AI response as JSON', raw: text.slice(0, 200) }) };
    }

    if (!parsed.transactions?.length) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'No transactions found in statement' }) };
    }

    console.log(`Returning ${parsed.transactions.length} transactions`);
    return { statusCode: 200, headers, body: JSON.stringify(parsed) };

  } catch(error) {
    console.error('Unhandled error:', error.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message || 'Internal server error' }) };
  }
};
