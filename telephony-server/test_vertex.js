import { GoogleAuth } from 'google-auth-library';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

async function testGenerate(location, model) {
  try {
    const auth = new GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
      scopes: 'https://www.googleapis.com/auth/cloud-platform'
    });
    const client = await auth.getClient();
    const projectId = await auth.getProjectId();
    const accessToken = await client.getAccessToken();

    const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`;
    
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }]
      })
    });
    
    if (!res.ok) {
      console.log(`[${location} / ${model}] FAILED: ${res.status}`);
      const text = await res.json().catch(() => ({}));
      console.log("Error details:", text?.error?.message || text);
    } else {
      console.log(`[${location} / ${model}] SUCCESS!`);
    }
  } catch (err) {
    console.error(err.message);
  }
}

async function runTests() {
  await testGenerate('us-central1', 'gemini-2.5-flash');
  await testGenerate('asia-south1', 'gemini-2.5-flash');
  await testGenerate('asia-south1', 'gemini-3.5-flash');
}

runTests();
