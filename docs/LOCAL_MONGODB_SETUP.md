# Local MongoDB setup for NEXORA (Windows)

This project uses MongoDB locally during development.

## Tested local environment

- Windows 10 build 19045
- MongoDB Community Server 7.0
- MongoDB service name: `MongoDB`
- MongoDB port: `27017`

MongoDB 8.3 produced a Windows binary/service compatibility problem on this machine, so MongoDB 7.0 is the known working local version.

## Check MongoDB

Open Command Prompt and run:

```cmd
sc query MongoDB
```

Expected state:

```text
STATE              : 4  RUNNING
```

Check the installed version:

```cmd
"C:\Program Files\MongoDB\Server\7.0\bin\mongod.exe" --version
```

## Backend local environment

Create this file locally if it does not exist:

```text
backend/.env
```

Use this local-development configuration:

```env
MONGO_URL=mongodb://127.0.0.1:27017
DB_NAME=nexora_local
JWT_SECRET=nexora-local-secret-change-later
STORAGE_BACKEND=local
SEED_DEMO_DATA=true
ALLOW_DEV_SUBSCRIPTIONS=true
CORS_ORIGINS=http://localhost:3000
ADMIN_EMAIL=admin@nexora.com
ADMIN_PASSWORD=admin123
FRONTEND_URL=http://localhost:3000
```

`backend/.env` is intentionally ignored by Git and must not be committed because real deployments can contain secrets.

The safe template is committed as `backend/.env.example`.

## Frontend local environment

Create or keep:

```text
frontend/.env
```

with:

```env
REACT_APP_BACKEND_URL=http://127.0.0.1:8000
```

The real `.env` file is also ignored by Git.

## Start backend

```cmd
cd /d "C:\Users\shawon\Documents\Websites\newrun\backend"
py -m uvicorn server:app --reload --host 127.0.0.1 --port 8000
```

Expected startup includes:

```text
Seed complete
Storage initialized
Application startup complete
```

API check:

```text
http://127.0.0.1:8000/api/
```

## Start frontend

```cmd
cd /d "C:\Users\shawon\Documents\Websites\newrun\frontend"
yarn start
```

Frontend:

```text
http://localhost:3000
```

## Demo admin

Local seed credentials:

```text
Email: admin@nexora.com
Password: admin123
```

These are local demo credentials only and must not be reused in production.

## Important Git note

Installing MongoDB, starting the Windows MongoDB service, and creating local MongoDB data do not make the Git working tree dirty.

If `git status` reports modified React/JavaScript files, those are local source-code edits and are unrelated to the MongoDB service or database files.
