# Gateway Module

Express/Nest-style module exposing HTTP handlers, auth middleware, request validation, and rate limiting shared across the monolith.

- Defines route registration helpers and tenant-aware controllers.
- Centralizes OpenAPI schema generation + DTO validation using Zod.
- Exposes shared guards for feature flags and role-based access.
