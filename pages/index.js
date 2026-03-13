import { useState } from 'react';
import { parse, format } from 'date-fns';

export default function Home() {
  const [ref, setRef] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // async function handleTrack() {
  //   setResult(null);
  //   setError('');
  //   setLoading(true);

  //   const trackingNumbers = ref
  //     .split('\n')
  //     .map((t) => t.trim())
  //     .filter(Boolean);

  //   const results = [];

  //   for (const tn of trackingNumbers) {
  //     try {
  //       const res = await fetch(
  //         `/api/track?referenceNumber=${encodeURIComponent(tn)}`
  //       );
  //       const data = await res.json();

  //       if (!res.ok || !data?.trackResponse) {
  //         results.push({
  //           trackingNumber: tn,
  //           error: data.error || 'Tracking failed',
  //         });
  //         continue;
  //       }

  //       const shipment = data.trackResponse.shipment?.[0];
  //       const pkg = shipment?.package?.[0];
  //       const activity = pkg?.activity?.[0];

  //       if (!activity) {
  //         results.push({ trackingNumber: tn, error: 'No activity found' });
  //         continue;
  //       }

  //       const dt = parse(
  //         `${activity.date}${activity.time}`,
  //         'yyyyMMddHHmmss',
  //         new Date()
  //       );
  //       const nice = format(dt, 'Pp');

  //       results.push({
  //         trackingNumber: tn,
  //         city: activity.location.address.city,
  //         state: activity.location.address.stateProvince || '',
  //         country: activity.location.address.country || '',
  //         statusDescription: activity.status.description.trim(),
  //         statusCode: activity.status.statusCode,
  //         datetime: nice,
  //         service: pkg?.service?.description || 'N/A',
  //       });
  //     } catch (e) {
  //       results.push({ trackingNumber: tn, error: e.message });
  //     }
  //   }

  //   setResult(results);
  //   setLoading(false);
  // }
  async function handleTrack() {
    setResult(null);
    setError('');
    setLoading(true);
  
    const trackingNumbers = ref
      .split('\n')
      .map((t) => t.trim())
      .filter(Boolean);
  
    let results = [];
    let toRetry = [...trackingNumbers];
    let retryCount = 0;
    const maxRetries = 3;
    const batchSize = 10;
  
    while (toRetry.length > 0 && retryCount < maxRetries) {
      const currentBatch = toRetry.slice(0, batchSize);
      toRetry = toRetry.slice(batchSize);
  
      const batchResults = await Promise.all(
        currentBatch.map(async (tn) => {
          try {
            const res = await fetch(`/api/track?referenceNumber=${encodeURIComponent(tn)}`);
            const data = await res.json();
  
            if (!res.ok || !data?.trackResponse) {
              const isRateLimit =
                data?.error?.includes('"10429"') ||
                data?.error?.includes('Too Many Requests') ||
                res.status === 429;
  
              return {
                trackingNumber: tn,
                error: isRateLimit ? 'RATE_LIMIT' : data.error || 'Tracking failed',
              };
            }
  
            const shipment = data.trackResponse.shipment?.[0];
            const pkg = shipment?.package?.[0];
            const activity = pkg?.activity?.[0];
  
            if (!activity) {
              return { trackingNumber: tn, error: 'No activity found' };
            }
  
            const dt = parse(
              `${activity.date}${activity.time}`,
              'yyyyMMddHHmmss',
              new Date()
            );
            const nice = format(dt, 'Pp');

            // Extract labelCreated date from activity with statusCode "003" (label created)
            let labelCreatedFormatted = 'N/A';
            const labelCreatedActivity = pkg?.activity?.find(
              (act) => act.status.statusCode === '003'
            );
            if (labelCreatedActivity?.date && labelCreatedActivity?.time) {
              try {
                const labelDt = parse(
                  `${labelCreatedActivity.date}${labelCreatedActivity.time}`,
                  'yyyyMMddHHmmss',
                  new Date()
                );
                labelCreatedFormatted = format(labelDt, 'Pp');
              } catch (e) {
                console.error('Error parsing labelCreated date:', e);
              }
            }
  
            return {
              trackingNumber: tn,
              city: activity.location.address.city,
              state: activity.location.address.stateProvince || '',
              country: activity.location.address.country || '',
              statusDescription: activity.status.description.trim(),
              statusCode: activity.status.statusCode,
              datetime: nice,
              service: pkg?.service?.description || 'N/A',
              labelCreated: labelCreatedFormatted,
            };
          } catch (e) {
            return { trackingNumber: tn, error: e.message };
          }
        })
      );
  
      const failed = batchResults.filter((r) => r.error === 'RATE_LIMIT').map((r) => r.trackingNumber);
      const successful = batchResults.filter((r) => r.error !== 'RATE_LIMIT');
  
      results.push(...successful);
      toRetry.push(...failed);
  
      if (failed.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, 2000 * (retryCount + 1)));
        retryCount++;
      }
    }
  
    // Handle final attempts that still failed with RATE_LIMIT
    if (toRetry.length > 0) {
      toRetry.forEach((tn) => {
        results.push({ trackingNumber: tn, error: 'Rate limit exceeded after multiple retries' });
      });
    }
  
    setResult(results);
    setLoading(false);
  }
  

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>UPS Reference Tracking</h1>

      <textarea
        value={ref}
        onChange={(e) => setRef(e.target.value)}
        placeholder="Paste tracking numbers (one per line)"
        rows={10}
        style={{ padding: '.5rem', width: '100%', maxWidth: '600px' }}
      />

      <button
        onClick={handleTrack}
        disabled={loading}
        style={{
          marginTop: '1rem',
          padding: '.5rem 1rem',
          opacity: loading ? 0.6 : 1,
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Tracking...' : 'Track'}
      </button>

      {loading && (
        <div style={{ marginTop: '1rem' }}>
          <p style={{ marginBottom: '.5rem', fontWeight: 'bold' }}>
            In Progress...
          </p>
          <div
            style={{
              height: '6px',
              backgroundColor: '#ccc',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                background:
                  'linear-gradient(to right, #4caf50 30%, #81c784 60%, #4caf50 90%)',
                backgroundSize: '200% auto',
                animation: 'loading-bar 1s linear infinite',
              }}
            />
            <style jsx>{`
              @keyframes loading-bar {
                0% {
                  background-position: -100% 0;
                }
                100% {
                  background-position: 100% 0;
                }
              }
            `}</style>
          </div>
        </div>
      )}

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {Array.isArray(result) &&
        result.map((item, index) => (
          <div
            key={index}
            style={{
              marginTop: '1rem',
              background: item.statusCode === '011' ? '#d0f0d0' : '#f0f0f0',
              padding: '1rem',
            }}
          >
            <p>
              <strong>Tracking #:</strong>{' '}
              <a
                href={`https://www.ups.com/track?tracknum=${item.trackingNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#0070f3', textDecoration: 'underline' }}
              >
                {item.trackingNumber}
              </a>
            </p>

            {item.error ? (
              <p style={{ color: 'red' }}>
                <strong>Error:</strong> {item.error}
              </p>
            ) : (
              <>
                <p>
                  <strong>City:</strong> {item.city}, {item.state} (
                  {item.country})
                </p>
                <p>
                  <strong>Status:</strong>{' '}
                  <span
                    style={{
                      color: item.statusCode !== '011' ? 'red' : 'inherit',
                    }}
                  >
                    {item.statusDescription}
                  </span>
                </p>
                <p>
                  <strong>Timestamp:</strong> {item.datetime}
                </p>
                <p>
                  <strong>Service:</strong> {item.service}
                </p>
                <p>
                  <strong>Label Created:</strong> {item.labelCreated}
                </p>
              </>
            )}
          </div>
        ))}
    </div>
  );
}

