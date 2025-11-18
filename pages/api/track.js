// pages/api/track.js

// import { randomUUID } from 'crypto';

// const SANDBOX = 'https://wwwcie.ups.com';         
// const PROD    = 'https://onlinetools.ups.com';    
// const BASE    = process.env.USE_PROD === 'true' ? PROD : SANDBOX;

// export default async function handler(req, res) {
//   const { referenceNumber } = req.query;
//   const { UPS_CLIENT_ID, UPS_CLIENT_SECRET } = process.env;

//   if (!referenceNumber) {
//     return res.status(400).json({ error: 'Missing referenceNumber parameter' });
//   }
//   if (!UPS_CLIENT_ID || !UPS_CLIENT_SECRET) {
//     return res
//       .status(500)
//       .json({ error: 'UPS_CLIENT_ID & UPS_CLIENT_SECRET must be set in .env.local' });
//   }

//   const creds = Buffer.from(`${UPS_CLIENT_ID}:${UPS_CLIENT_SECRET}`).toString('base64');
//   const tokenRes = await fetch(`${BASE}/security/v1/oauth/token`, {
//     method: 'POST',
//     headers: {
//       'Content-Type': 'application/x-www-form-urlencoded',
//       Authorization: `Basic ${creds}`,
//     },
//     body: new URLSearchParams({ grant_type: 'client_credentials' }),
//   });
//   if (!tokenRes.ok) {
//     const err = await tokenRes.text();
//     console.error('UPS token error →', err);
//     return res.status(502).json({ error: 'Failed to fetch UPS token' });
//   }
//   const { access_token } = await tokenRes.json();

//   const isTracking = referenceNumber.startsWith('1Z');
//   const path = isTracking
//     ? 'details'
//     : 'reference/details';

//   const query = new URLSearchParams(
//     isTracking
//       ? {
//           locale: 'en_US',
//           returnSignature: 'false',
//           returnMilestones: 'false',
//           returnPOD: 'false',
//         }
//       : {
//           locale: 'en_US',
//           fromPickUpDate: 'currentDate-14',
//           toPickUpDate: 'currentDate',
//           refNumType: 'SmallPackage',
//         }
//   ).toString();

//   const upsRes = await fetch(
//     `${BASE}/api/track/v1/${path}/${referenceNumber}?${query}`,
//     {
//       method: 'GET',
//       headers: {
//         transId: randomUUID(),         
//         transactionSrc: 'testing',     
//         Authorization: `Bearer ${access_token}`,
//         Accept: 'application/json',
//       },
//     }
//   );


//   const raw = await upsRes.text();
//   console.log(`UPS raw (${path}):`, raw);

//   if (!upsRes.ok) {
//     return res.status(upsRes.status).json({ error: raw });
//   }

//   try {
//     const data = JSON.parse(raw);
//     return res.status(200).json(data);
//   } catch (parseErr) {
//     console.error('Failed to parse UPS JSON →', parseErr);
//     return res.status(502).json({ error: 'Invalid JSON from UPS', raw });
//   }
// }


// pages/api/track.js

import { randomUUID } from 'crypto';

const SANDBOX = 'https://wwwcie.ups.com';
const PROD = 'https://onlinetools.ups.com';
const BASE = process.env.USE_PROD === 'true' ? PROD : SANDBOX;

let cachedToken = null;
let tokenExpiry = 0;

export default async function handler(req, res) {
  const { referenceNumber } = req.query;
  const { UPS_CLIENT_ID, UPS_CLIENT_SECRET } = process.env;

  if (!referenceNumber) {
    return res.status(400).json({ error: 'Missing referenceNumber parameter' });
  }

  if (!UPS_CLIENT_ID || !UPS_CLIENT_SECRET) {
    return res
      .status(500)
      .json({ error: 'UPS_CLIENT_ID & UPS_CLIENT_SECRET must be set in .env.local' });
  }

  // Fetch or reuse UPS token
  if (!cachedToken || Date.now() > tokenExpiry) {
    const creds = Buffer.from(`${UPS_CLIENT_ID}:${UPS_CLIENT_SECRET}`).toString('base64');

    const tokenRes = await fetch(`${BASE}/security/v1/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${creds}`,
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error('UPS token error →', err);
      return res.status(502).json({ error: 'Failed to fetch UPS token' });
    }

    const tokenData = await tokenRes.json();
    cachedToken = tokenData.access_token;
    tokenExpiry = Date.now() + (tokenData.expires_in - 60) * 1000; 
  }

  const access_token = cachedToken;

  const isTracking = referenceNumber.startsWith('1Z');
  const path = isTracking ? 'details' : 'reference/details';

  const query = new URLSearchParams(
    isTracking
      ? {
          locale: 'en_US',
          returnSignature: 'false',
          returnMilestones: 'false',
          returnPOD: 'false',
        }
      : {
          locale: 'en_US',
          fromPickUpDate: 'currentDate-14',
          toPickUpDate: 'currentDate',
          refNumType: 'SmallPackage',
        }
  ).toString();

  const upsRes = await fetch(
    `${BASE}/api/track/v1/${path}/${referenceNumber}?${query}`,
    {
      method: 'GET',
      headers: {
        transId: randomUUID(),
        transactionSrc: 'testing',
        Authorization: `Bearer ${access_token}`,
        Accept: 'application/json',
      },
    }
  );

  const raw = await upsRes.text();
  console.log(`UPS raw (${path}):`, raw);

  if (!upsRes.ok) {
    return res.status(upsRes.status).json({ error: raw });
  }

  try {
    const data = JSON.parse(raw);
    return res.status(200).json(data);
  } catch (parseErr) {
    console.error('Failed to parse UPS JSON →', parseErr);
    return res.status(502).json({ error: 'Invalid JSON from UPS', raw });
  }
}
