# FynD backend

Signup and login API using Express, Zod, bcrypt (cost 12), JWT access tokens,
and PostgreSQL through the shared `db` package.

## Setup

From the repository root, install dependencies:

```sh
pnpm --filter backend add "db@workspace:*" bcrypt zod jsonwebtoken cookie-parser cors dotenv express-rate-limit
pnpm --filter backend add -D @types/bcrypt @types/jsonwebtoken @types/cookie-parser @types/cors @types/node tsx typescript
```

Copy `apps/backend/.env.example` to `apps/backend/.env`. Set `DATABASE_URL`
and a random `JWT_ACCESS_SECRET` of at least 32 characters. Generate a secret with:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

The database package CLI reads `packages/db/.env`; its `DATABASE_URL` must point
to the same database as the backend. Deploy the existing migrations, build the
shared database package, then start the API:

```sh
pnpm --filter db exec prisma migrate deploy
pnpm --filter db build
pnpm --filter backend dev
```

## Endpoints

`POST /api/auth/register`

```json
{"email":"rahul@example.com","username":"rahul","password":"a-long-password-you-choose"}
```

Returns 201 and safe user details. Duplicate email/username returns 409. Only
`User` is created: no profile or location, and discovery remains off.
Emails/usernames are normalized to lowercase. Passwords require 12 characters
and at most 72 UTF-8 bytes, and are never trimmed or lowercased.

`POST /api/auth/login`

```json
{"email":"rahul@example.com","password":"a-long-password-you-choose"}
```

Login accepts email and password. Returns a 15-minute access JWT and safe
user details. Invalid credentials return 401. Creates a 30-day web session and
stores only the SHA-256 hash of a random refresh token. The raw refresh token is
sent in an HttpOnly, SameSite=Strict cookie, scoped to `/api/auth`; production
cookies also use Secure. The web frontend must use `credentials: "include"`
and keep the access token in memory.

Cookie settings assume the production web frontend and API share a site
(for example `app.example.com` and `api.example.com`) and use HTTPS.
`WEB_ORIGIN` is the exact allowed frontend origin, without a trailing slash.

This increment implements signup/login only. Refresh-token rotation endpoints,
logout, protected-route token/session verification, email verification, and
password reset are not implemented yet. After the access token expires, login
is needed again until refresh is implemented. These routes are currently for
web clients; native token storage/transport will be added with mobile auth.

The auth router allows 20 requests per IP per 15 minutes using an in-memory
limiter. Multiple API instances will need a shared limiter store. Behind a
reverse proxy, configure Express `trust proxy` for the actual deployment;
do not blindly trust forwarded headers.

## Checks

```sh
pnpm --filter backend check-types
pnpm --filter backend test
pnpm --filter backend build
```

Validation tests run without a database. The integration test is skipped unless
`AUTH_TEST_DATABASE_URL` is set to a separate PostgreSQL test database with the
schema already migrated. It checks real signup/login, privacy defaults,
duplicates, rejected credentials, password hashing, signed JWTs, cookies, and
stored token hashes. It creates and removes only its uniquely named test user.
Never point this variable at production.

PowerShell example, from the repository root:

```powershell
$env:AUTH_TEST_DATABASE_URL = 'postgresql://USER:PASSWORD@localhost:5432/fynd_test'
pnpm --filter backend test
```
