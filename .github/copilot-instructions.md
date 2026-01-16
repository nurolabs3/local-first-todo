# Local-First Architecture Instructions

This project uses a **Local-First Architecture** with the MERN stack. It differs significantly from standard REST API patterns.

## 1. Core Architecture Principles (STRICT)
- **Frontend Source of Truth:** The UI reads/writes *only* to the local RxDB database running in the browser.
- **No Direct API Calls:** UI components (`.jsx` files) must NEVER make `fetch` or `axios` calls directly to the backend. All data transfer happens via the background replication plugins in `db.js`.
- **Client-Side IDs:** IDs are generated on the client (using `uuid`) before insertion. Do not rely on MongoDB `_id` auto-generation.

## 2. Frontend Coding Rules (React + RxDB)
- **Reading Data:** Use `useRxCollection` or `useEffect` with `.subscribe()` to listen to local data changes. Do not use `useEffect` to fetch data from an API.
- **Writing Data:** - Use `db.collection.insert()` for creates.
    - Use `document.patch()` for updates.
    - **CRITICAL:** Every update must modify the `updatedAt` field to `Date.now()`. If this field is not changed, the sync engine will not pick up the change.
    - Example of correct update: `await todo.patch({ isDone: true, updatedAt: Date.now() })`

## 3. Backend Coding Rules (Express + MongoDB)
- **Role of Backend:** The backend exists primarily to **Sync** data, not to serve traditional views.
- **Sync Endpoints:**
    - `GET /sync`: Returns documents where `updatedAt > lastPulledAt`.
    - `POST /sync`: Receives a list of changes and performs "Upserts" (Update if exists, Insert if new).
- **Soft Deletes:** Do not delete documents from MongoDB. Set a `deleted: true` flag and update `updatedAt` so the deletion propagates to other clients.

## 4. Technology Specifics
- **Database:** RxDB (Client) -> Sync -> MongoDB (Server).
- **Schema:** The RxDB JSON schema must match the Mongoose Schema fields.