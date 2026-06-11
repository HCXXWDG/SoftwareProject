# Changelog

All notable changes follow Semantic Versioning and Keep a Changelog.

## [Unreleased]

### Added
- PostGIS dev startup script at `scripts/start-postgis-dev.ps1`.
- Integration smoke script for validating the frontend-to-backend API chain locally.
- Testcontainers PostGIS integration tests for Flyway seed, spatial reports and commute trends.
- React/TypeScript map dashboard with AMap and offline demo modes.
- Spring Boot API for reports, heatmap, route comparison and commute trends.
- Backend Docker image for running the Spring Boot API in containers.
- PostGIS Docker Compose stack for local PostgreSQL/PostGIS deployment.
- PostgreSQL demo seed migration for heatmap reports, commute trends and a sample route query.
- Optional Maven mirror settings for environments where Maven Central is unstable.
- Route-query persistence for storing route comparison inputs and JSON results in PostGIS.
- Route history API for reading recent route comparisons by device.
- Heatmap refresh API for persisting computed cells into the PostGIS `emotion_cell` cache.
- Backend CI workflow for running Java 17 Maven tests on pushes and pull requests.
- Structured commute trend summary with average stress, stress delta and trend direction.
- OpenAPI metadata and controller tags for clearer Swagger API documentation.
- Committed OpenAPI contract snapshot at `docs/openapi.json` for frontend and integration reference.

### Changed
- Merged `develop` frontend shell for local integration debugging.
- Extended the postgres profile to pass `DEVICE_HASH_SALT` into Flyway migrations.
- Updated `.env.example` with backend, CORS and PostGIS runtime variables.
- Clarified production startup documentation for the current backend/PostGIS Compose stack.
- Documented backend API endpoints in `README.md`.
- Backend CI now runs Maven verify and uploads the API jar plus Surefire test report artifacts.
- Expanded JDBC repository test coverage for PostGIS heatmap cache writes.
- Expanded API smoke coverage for mood report submission and commute completion.
- Added unit tests for report submission validation, rate limiting and commute completion persistence.
- Added unit tests for API error mapping and report rate limiter window behavior.
- Aligned frontend `TrendResult` TypeScript type with backend trend summary fields.
- Actuator info now exposes backend name, version, mode and description.
- Ignored Maven wrapper cache downloads to keep local build artifacts out of commits.

### Fixed
- PostGIS Testcontainers integration tests now declare the PostGIS image as a compatible PostgreSQL substitute for Testcontainers 1.21+.
- Mock route comparison now returns distinct fastest and least-stressful route IDs for the standard Beijing demo coordinates.
- PostgreSQL commute trend queries now read nullable numeric columns without failing on JDBC row mapping.
- Root URL now redirects to Swagger UI instead of returning a 500 error page.
- Missing required request headers now return a structured 400 response.
- Commute and route-query writes now refresh PostGIS `device_profile` activity timestamps.
- Non-finite coordinates, invalid heatmap bounds and invalid trend timezones now return 400 responses.
- Missing query parameters, type mismatches and malformed JSON now return structured 400 responses.

## [0.1.0] - 2026-06-10

### Added
- Architecture baseline and executable project skeleton.

