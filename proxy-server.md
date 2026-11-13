Task: Build Bacuflix Proxy Server and Deploy to Vercel

1. Background

The Bacuflix movie streaming application currently has a connectivity issue.

The original movie API domain is being blocked by some ISPs at the DNS resolution level, preventing users from accessing movie data and streaming resources.

I want to build an intermediate reverse proxy server and deploy it to Vercel.

Expected request architecture:

Browser / Bacuflix Frontend
→ Bacuflix Proxy (Vercel)
→ Original Movie API / Streaming Server

The frontend should send requests to the Vercel proxy instead of directly accessing the original upstream domain.

The proxy should forward requests to the original upstream server and return responses transparently to the frontend.

2. Repository Inspection

Before writing code:

- Inspect the existing repository structure.
- Identify the original movie API base URL.
- Identify all API endpoints currently used by the frontend.
- Inspect the API client, HTTP interceptors, authentication headers, query parameters, and request configurations.
- Identify how the application retrieves movie information, images, subtitles, and streaming URLs.
- Determine whether the application uses HLS (.m3u8), MPEG-TS (.ts), MP4, or other streaming formats.

IMPORTANT:
Do not read the entire repository unnecessarily. Only inspect files relevant to API communication, network configuration, and streaming.

Do not assume the upstream API structure. Derive it from the existing implementation.

3. Create an Independent Proxy Project

Create a new directory at the repository root:

"bacuflix-proxy/"

This must be a standalone project that can be independently deployed to Vercel.

Do not place proxy implementation code inside the existing frontend project.

Do not unnecessarily modify the existing frontend architecture.

Use a lightweight Vercel-compatible Node.js serverless implementation.

4. Reverse Proxy Implementation

Implement a reverse proxy that:

- Accepts incoming HTTP requests from the frontend.
- Forwards requests to the configured upstream domain.
- Preserves HTTP methods (GET, POST, PUT, PATCH, DELETE, etc.).
- Preserves query parameters.
- Forwards request bodies when applicable.
- Forwards necessary headers, including authorization and content negotiation.
- Preserves upstream HTTP status codes.
- Preserves relevant response headers.
- Supports JSON, text, images, subtitles, and binary responses.
- Supports HTTP Range requests (206 Partial Content).
- Handles streaming responses without unnecessarily buffering the entire response.
- Handles timeouts and upstream errors gracefully.

Streaming requirements

Because Bacuflix is a movie streaming application, streaming compatibility is critical.

Pay special attention to:

- HLS playlists (.m3u8).
- MPEG-TS segments (.ts).
- MP4 video.
- HTTP Range requests.
- Content-Type.
- Content-Length.
- Content-Range.
- Accept-Ranges.
- Cache-Control.
- CORS.

If an HLS playlist contains relative segment URLs or absolute upstream URLs, inspect how those URLs are resolved.

If necessary, implement URL rewriting so subsequent playlist and segment requests also pass through the proxy.

Do not break existing streaming URL formats.

5. Security and Configuration

Configure the upstream domain using environment variables:

"UPSTREAM_BASE_URL"

Requirements:

- Do not hardcode upstream credentials.
- Do not expose secret environment variables to the browser.
- Restrict forwarding to the configured upstream host.
- Do not implement an unrestricted open proxy.
- Validate incoming paths to prevent path traversal and SSRF.
- Forward only necessary headers.
- Avoid forwarding hop-by-hop headers.
- Handle CORS appropriately for the Bacuflix frontend.

Create an ".env.example" file.

6. Vercel Deployment

Prepare all required files:

- package.json
- Vercel-compatible serverless API functions
- vercel.json (if necessary)
- .env.example
- README.md

The project must support independent deployment.

Deployment commands:

Preview deployment:

"cd bacuflix-proxy && vercel deploy"

Production deployment:

"cd bacuflix-proxy && vercel deploy --prod"

Do not execute production deployment without explicit approval.

7. Frontend Integration

Inspect the existing frontend API configuration.

Implement a configurable API base URL that allows switching between:

- Original upstream API.
- Bacuflix Vercel proxy.

Use the project's existing environment configuration conventions.

Requirements:

- Keep existing API interfaces unchanged.
- Avoid unnecessary frontend refactoring.
- Preserve authentication and request behavior.
- Ensure all relevant API requests use the configured proxy when enabled.
- Ensure movie streaming and subtitle requests are also routed correctly when required.

8. Testing and Validation

Test the following:

1. GET request forwarding.
2. POST request forwarding, if used by the upstream API.
3. Query parameter preservation.
4. Authorization header forwarding.
5. HTTP error handling.
6. JSON response integrity.
7. Image and subtitle delivery.
8. HLS playlist retrieval.
9. HLS segment retrieval.
10. HTTP Range requests and 206 Partial Content.
11. Large response streaming without unnecessary buffering.

If the original upstream domain cannot be reached from the development environment, document this limitation rather than pretending the integration works.

9. Documentation

Create "bacuflix-proxy/README.md" documenting:

- Architecture and request flow.
- Installation instructions.
- Local development.
- Environment variable configuration.
- Vercel deployment instructions.
- Frontend integration.
- Streaming compatibility.
- Troubleshooting.

10. Final Report

After implementation, provide:

1. Project structure created.
2. Files created and modified.
3. Proxy architecture.
4. Environment variables required.
5. Local testing results.
6. Vercel deployment instructions.
7. Frontend configuration changes.
8. Known limitations and unresolved issues.

Important Constraints

- Keep all proxy implementation inside "bacuflix-proxy/".
- Do not rewrite unrelated frontend components.
- Do not change the original upstream API.
- Do not assume DNS blocking is the only possible connectivity issue.
- Do not claim deployment succeeded without actually deploying and verifying it.
- Do not deploy to production without explicit approval.
- Prioritize compatibility with Vercel Hobby.
- Prioritize movie streaming reliability over unnecessary abstraction.
- Inspect first, implement second, test third.
