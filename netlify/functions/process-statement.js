// Netlify Function: process-statement.js
// This runs on Netlify's servers, so no CORS issues!

exports.handler = async (event, context) => {
  // CORS headers for all responses
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle OPTIONS preflight request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { pdfBase64, apiKey, model } = JSON.parse(event.body);
    
    if (!pdfBase64 || !apiKey) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing pdfBase64 or apiKey' })
      };
    }

    // Use provided model or default to Sonnet 4
    const selectedModel = model || 'claude-sonnet-4-20250514';
    console.log('Processing bank statement with model:', selectedModel);

    const prompt = `You are analyzing a bank statement PDF. Extract ALL transactions and categorize them for a restaurant business.

Extract each transaction with:
1. Date (YYYY-MM-DD format)
2. Description/Merchant
3. Amount (positive number, no currency symbols)
4. Suggested Category (from the list below)

CATEGORIES (choose most appropriate):
- Food & Supplies
- Beverage
- Utilities
- Rent
- Payroll
- Equipment
- Marketing
- Maintenance & Repairs
- Insurance
- Licenses & Permits
- Professional Services
- Office Supplies
- Sales Tax
- Payroll Taxes
- Other Taxes
- Bank Fees
- Credit Card Fees
- Transaction Fees
- Other

IMPORTANT:
- Skip: payments to credit cards, transfers between accounts, deposits
- Only include: actual business expenses (purchases, bills, fees)
- If unsure about category, use "Other"

Return ONLY valid JSON (no markdown, no backticks):
{
  "transactions": [
    {
      "date": "2026-02-15",
      "merchant": "SYSCO FOODS",
      "amount": 1234.56,
      "category": "Food & Supplies"
    }
  ]
}`;

    // Call Anthropic API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': apiKey
      },
      body: JSON.stringify({
        model: selectedModel,
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: pdfBase64
              }
            },
            {
              type: 'text',
              text: prompt
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Anthropic API error:', errorData);
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ 
          error: `Anthropic API error: ${errorData.error?.message || response.statusText}` 
        })
      };
    }

    const data = await response.json();
    const responseText = data.content[0].text;
    
    console.log('AI response received');

    // Parse JSON response
    let jsonData;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      jsonData = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
    } catch (e) {
      console.error('Could not parse response:', responseText);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'Could not parse AI response',
          raw: responseText 
        })
      };
    }

    if (!jsonData.transactions || jsonData.transactions.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'No transactions found in statement' 
        })
      };
    }

    console.log(`Extracted ${jsonData.transactions.length} transactions`);

    // Return success
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(jsonData)
    };

  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: error.message || 'Internal server error' 
      })
    };
  }
};
