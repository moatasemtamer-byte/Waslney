# Shuttle — Fixed Route Ride Sharing App

Full-stack app: React + Node.js + MySQL (phpMyAdmin/XAMPP) + Socket.io real-time maps.

---

## Setup — 3 steps

### Step 1 — Start XAMPP
1. Open XAMPP Control Panel
2. Click **Start** next to **Apache**
3. Click **Start** next to **MySQL**

---

### Step 2 — Import the database
1. Open your browser → go to `http://localhost/phpmyadmin`
2. Click **Import** in the top menu
3. Click **Choose File** → select `shuttle.sql` from this folder
4. Click **Go** at the bottom
5. You should see "Import has been successfully finished"

---

### Step 3 — Install & run
Open a terminal in this folder and run:

```bash
npm run install:all
```

Then start the app:

```bash
npm run dev
```

Open your browser → `http://localhost:5173`

---

## Demo accounts

All passwords are: `password`

| Phone | Role | Name |
|---|---|---|
| +20100111222 | Passenger | Ahmed Hassan |
| +20100222333 | Passenger | Sara Mohamed |
| +20101333444 | Driver | Khaled Mohamed |
| +20101444555 | Driver | Mohamed Amr |
| +20102555666 | Driver | Tamer Ibrahim |
| +20100000001 | Admin | Admin |

---

## What's running

| Service | URL |
|---|---|
| Frontend (React) | http://localhost:5173 |
| Backend (Express) | http://localhost:3001 |
| API health check | http://localhost:3001/api/health |
| phpMyAdmin | http://localhost/phpmyadmin |

---

## Real-time maps

- **Driver**: Open a trip → tap **"Share my location"** — your GPS streams every 4 seconds
- **Passenger**: Open a booking → the map shows the driver's live pin moving
- **Admin**: Overview tab shows all active drivers on a live map

Maps use **OpenStreetMap** — no API key needed, free forever.

---

## If MySQL password is not empty

Edit `backend/.env`:
```
DB_PASS=your_password_here
```

---

## Folder structure

```
shuttle/
├── shuttle.sql          ← Import this in phpMyAdmin first
├── package.json         ← Root scripts
├── README.md
├── backend/
│   ├── .env             ← DB config (XAMPP defaults pre-filled)
│   ├── server.js        ← Express + Socket.io
│   ├── db.js            ← MySQL pool
│   ├── auth.js          ← JWT helpers
│   ├── socket/
│   │   └── tracking.js  ← Real-time location
│   └── routes/
│       ├── auth.js
│       ├── trips.js
│       ├── bookings.js
│       ├── checkins.js
│       ├── ratings.js
│       ├── notifications.js
│       ├── location.js
│       └── users.js
└── frontend/
    ├── index.html
    ├── vite.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── api.js
        ├── socket.js
        ├── components/
        │   ├── UI.jsx
        │   ├── Toast.jsx
        │   └── TripMap.jsx   ← Leaflet live map
        └── pages/
            ├── Landing.jsx
            ├── passenger/PassengerDash.jsx
            ├── driver/DriverDash.jsx
            └── admin/AdminDash.jsx
```
