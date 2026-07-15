# IP Intelligence Explorer

A full-stack IP intelligence application combining GeoJS geolocation with RIPEstat network and routing data. The strict-TypeScript React frontend presents a responsive Explorer Workspace, while the lean strict-TypeScript backend focuses on external API integration, typed data handling, partial-failure resilience, and simple deployment.

## Project status

The frontend and backend are implemented and locally verified.

## Highlights

- Public IP lookup and provider-independent health endpoints
- Sample IPv4/IPv6 shortcuts in a responsive search-led Explorer Workspace
- Complete and partial dashboards with a map/report layout and source-state badges
- Accessible missing-coordinate fallbacks and safe, actionable error states
- Concurrent GeoJS and RIPEstat requests with five-second timeouts
- Stable complete or partial reports when at least one provider succeeds
- Process-local TTL cache with same-IP in-flight request coalescing
- Sanitized public errors and structured logs
- Deterministic frontend and backend smoke tests with no live provider calls

## Architecture

`ip-intelligence` is one feature module containing its providers, schema, types, service, controller, and route. Shared code is limited to a generic memory cache, errors, and HTTP helpers.

The cache is intentionally process-local. Redis, authentication, persistent history, and distributed rate limiting are possible production evolutions when measured traffic or user-owned data requires them; they are not requirements for this stateless version.

### Frontend

The frontend is a strict-TypeScript React feature module. TanStack React
Query owns the provider-independent health query and the explicit no-retry
lookup mutation. Components call feature hooks, the hooks call a feature
service, and the service calls one shared typed API client. The backend remains
authoritative for IP validation, provider integration, caching, and
complete/partial outcomes.

The Explorer Workspace combines a responsive search hero, sample IPv4/IPv6
shortcuts, a Leaflet/OpenStreetMap location panel, network and routing
cards, source-state badges, partial-result warnings, and safe error states.
Missing coordinates use a readable fallback instead of placing a marker at
zero. The frontend contains no Firebase, authentication, or lookup history.

## Local setup

Requirements: Node.js `>=22.13.0 <23` and npm.

```bash
nvm use
npm install
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
npm run dev
```

The API runs at `http://localhost:3000`; the frontend runs at `http://localhost:5173`. No API key or database is required.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | No | Local API port; defaults to `3000`. |
| `ALLOWED_ORIGINS` | No | Comma-separated browser origins; defaults to `http://localhost:5173`. |
| VITE_API_BASE_URL | No locally; yes for separate deployment | Backend origin; defaults to http://localhost:3000 during development. |

## REST API

### Health

```http
GET /api/v1/health
```

Health returns service status and an ISO timestamp without calling external providers.

### Create a lookup

```http
POST /api/v1/ip-lookups
Content-Type: application/json

{"ip":"2001:4860:4860::8888"}
```

```json
{
  "data": {
    "ip": "2001:4860:4860::8888",
    "location": {
      "city": null,
      "region": null,
      "country": "United States",
      "countryCode": "US",
      "latitude": 37.751,
      "longitude": -97.822,
      "timezone": "America/Chicago"
    },
    "network": {
      "asn": 15169,
      "organization": "Google LLC",
      "prefix": "2001:4860::/32"
    },
    "routing": {
      "announced": true,
      "queryTime": "2026-07-15T12:00:00.000Z",
      "firstSeen": null,
      "lastSeen": null,
      "visibility": {
        "ipv4": { "peersSeeing": 0, "totalPeers": 0 },
        "ipv6": { "peersSeeing": 109, "totalPeers": 109 }
      }
    }
  },
  "meta": {
    "status": "complete",
    "cached": false,
    "sources": {
      "geojs": "available",
      "ripestatNetwork": "available",
      "ripestatRouting": "available"
    },
    "requestId": "req_uuid",
    "lookedUpAt": "2026-07-15T12:00:00.000Z"
  },
  "warnings": []
}
```

Unavailable scalar fields remain `null`. Source status is `available`, `rate_limited`, `timeout`, or `unavailable`.

Errors use `{ "error": { "code": string, "message": string, "requestId": string } }`. Invalid input returns `400`, disallowed origins `403`, unknown routes `404`, oversized bodies `413`, total provider rate limiting `429`, and other total provider failure `502`.

## Cache and resilience

- Providers run concurrently and are not retried automatically.
- Each provider has a five-second timeout covering fetch and JSON parsing.
- Complete reports cache for 60 minutes; partial reports for five minutes.
- Total failures are not cached.
- Same-IP misses share one in-flight lookup within a running instance.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Each workspace keeps one focused smoke-test file. Tests use fakes and make no
live provider calls.

## Deployment

Use separate Vercel projects. Set the API project root to `backend`, the
frontend project root to `frontend`, and choose Node.js 22 for each project.

1. Deploy backend from the backend project root.
2. Set VITE_API_BASE_URL in the frontend project to the backend origin.
3. Deploy frontend from the frontend project root.
4. Set backend ALLOWED_ORIGINS to the exact deployed frontend origin and
   redeploy the backend.

`backend/api/index.ts` is the Vercel entrypoint. `backend/src/server.ts` runs the same Express app locally.

## Data providers

- [GeoJS Geo API](https://www.geojs.io/docs/v1/endpoints/geo/)
- [RIPEstat Network Info](https://stat.ripe.net/docs/data-api/api-endpoints/network-info.html)
- [RIPEstat Routing Status](https://stat.ripe.net/docs/data-api/api-endpoints/routing-status)

## License

MIT
