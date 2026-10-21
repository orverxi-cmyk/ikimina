const fs = require('fs');
const path = require('path');
const https = require('https');

async function getFirebaseUserToken() {
  const configPath = path.join(process.env.USERPROFILE, '.config', 'configstore', 'firebase-tools.json');
  if (!fs.existsSync(configPath)) {
    throw new Error('firebase-tools.json not found');
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const tokens = config.tokens;
  if (!tokens || !tokens.access_token) {
    throw new Error('No access token found in firebase-tools.json');
  }

  // If token is still valid (or within valid window)
  if (tokens.access_token && (!tokens.expires_at || Date.now() < tokens.expires_at)) {
    return tokens.access_token;
  }

  // If expired, refresh it using client id from user.azp
  const clientId = (config.user && config.user.azp) || '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
  const clientSecret = 'jZeEpMlfgZ1gtJhA2Dekyqhu'; // or standard client secret if known

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: tokens.refresh_token,
    grant_type: 'refresh_token'
  }).toString();

  return new Promise((resolve, reject) => {
    const req = https.request('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.access_token) {
            resolve(parsed.access_token);
          } else {
            resolve(tokens.access_token);
          }
        } catch (e) {
          resolve(tokens.access_token);
        }
      });
    });
    req.on('error', () => resolve(tokens.access_token));
    req.write(body);
    req.end();
  });
}

function fetchJson(url, accessToken) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const projectId = 'studio-1670844393-18cbb';
  const region = 'us-central1';

  console.log(`Authenticating via signed-in Firebase CLI user...`);
  const accessToken = await getFirebaseUserToken();
  console.log(`Access token acquired successfully.`);

  console.log(`Querying Google Cloud Functions API for project '${projectId}' in '${region}'...`);
  const v2Url = `https://cloudfunctions.googleapis.com/v2/projects/${projectId}/locations/${region}/functions`;
  const v2Res = await fetchJson(v2Url, accessToken);

  if (v2Res.status !== 200) {
    console.error('API Error:', v2Res.data);
    return;
  }

  const deployedFunctions = v2Res.data.functions || [];
  console.log(`Found ${deployedFunctions.length} deployed functions in Cloud Functions v2.\n`);

  // Parse local exports from functions/lib/index.js
  const indexJs = fs.readFileSync(path.resolve(__dirname, '../functions/lib/index.js'), 'utf8');
  const exportStarMatches = [...indexJs.matchAll(/__exportStar\(require\("([^"]+)"\),\s*exports\)/g)].map(m => m[1]);
  
  const localFunctionsSet = new Set();
  for (const mod of exportStarMatches) {
    const modFile = path.resolve(__dirname, '../functions/lib', mod + '.js');
    if (fs.existsSync(modFile)) {
      const content = fs.readFileSync(modFile, 'utf8');
      const exportsMatches = [...content.matchAll(/exports\.(\w+)\s*=/g)].map(m => m[1]);
      for (const exp of exportsMatches) {
        localFunctionsSet.add(exp);
      }
    }
  }

  const localFunctions = Array.from(localFunctionsSet).sort();
  console.log(`=== LOCAL FUNCTIONS FOUND IN CODEBASE (${localFunctions.length} total) ===`);
  console.log(localFunctions.join(', '));
  console.log('\n');

  console.log(`=== DEPLOYED CLOUD FUNCTIONS (${deployedFunctions.length} total) ===`);
  const deployedMap = new Map();
  for (const fn of deployedFunctions) {
    const shortName = fn.name.split('/').pop();
    deployedMap.set(shortName, {
      state: fn.state,
      updateTime: fn.updateTime,
      createTime: fn.createTime,
      url: fn.url || (fn.serviceConfig && fn.serviceConfig.uri),
      environment: fn.environment
    });
  }

  for (const [name, info] of Array.from(deployedMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`- [${info.state}] ${name} (updated: ${info.updateTime})`);
  }
  console.log('\n');

  console.log('=== AUDIT & RECONCILIATION SUMMARY ===');
  const missingFromCloud = localFunctions.filter(name => !deployedMap.has(name));
  const notInLocal = Array.from(deployedMap.keys()).filter(name => !localFunctions.includes(name));
  const nonActive = Array.from(deployedMap.entries()).filter(([_, info]) => info.state !== 'ACTIVE');

  console.log(`Total Local Exported Functions: ${localFunctions.length}`);
  console.log(`Total Deployed Cloud Functions: ${deployedMap.size}`);
  console.log(`Active Cloud Functions: ${Array.from(deployedMap.values()).filter(i => i.state === 'ACTIVE').length}`);

  if (missingFromCloud.length === 0) {
    console.log('\n✅ ALL LOCAL FUNCTIONS ARE DEPLOYED!');
  } else {
    console.log(`\n❌ ${missingFromCloud.length} LOCAL FUNCTION(S) NOT DEPLOYED:`);
    missingFromCloud.forEach(f => console.log('   - ' + f));
  }

  if (notInLocal.length > 0) {
    console.log(`\nℹ️ ${notInLocal.length} DEPLOYED FUNCTION(S) NOT PRESENT IN CURRENT LOCAL CODEBASE:`);
    notInLocal.forEach(f => console.log('   - ' + f));
  }

  if (nonActive.length === 0) {
    console.log('\n✅ ALL DEPLOYED FUNCTIONS ARE IN ACTIVE STATE!');
  } else {
    console.log(`\n⚠️ ${nonActive.length} FUNCTIONS NOT ACTIVE:`);
    nonActive.forEach(([name, info]) => console.log(`   - ${name}: ${info.state}`));
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
