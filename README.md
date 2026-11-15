# Travel Planning and Booking Platform — Milestone 1 (Backend & API)

German International University (GIU) — Faculty of Informatics and Computer Science  
**Course:** Software Project I (Winter 2026)

## Team Members, GitHub Accounts & Module Ownership

| # | Student Name | GitHub Username / Git Author | Feature Branch | Assigned Modules & Requirement IDs |
|---|---|---|---|---|
| 1 | **Mohamed Ahmed Abdelmohymen** (Team Lead) | `Abdel-mohymen` | `feature/ACC-01-auth-and-core-setup` | Core Setup, Reference Data Seeding, Auth, User Profiles, Notifications, Media Uploads (`ACC-01`..`ACC-12`, `ACC-18`, `ACC-19`, `FLT-02`, `GEN-01`, `GEN-08`, `GEN-12`, `GEN-13`, `BON-02`) |
| 2 | **Takiee-Allah** | `Takiee-Allah` | `feature/ACC-13-admin-moderation-audit` | Administration, Moderator Management, Provider Status, Content Moderation, Audit Logs (`ACC-07a`, `ACC-13`..`ACC-17`, `GEN-07`, `GEN-09`, `GEN-10`, `BON-01`) |
| 3 | **Abdulrahman Walid (Abdo)** | `abdullrahmanwalidshawky` (`Abdulrahmanwld@gmail.com`) | `feature/FLT-01-airlines-and-flights` | Airlines, Airports, Flights, Cabin Inventory, Baggage & Cancellation Policies, Flight Search (`FLT-01`..`FLT-17`, `FLT-30`, `GEN-06`) |
| 4 | **Abdallah Ahmed (Abdella)** | `Abdallah` | `feature/FLT-22-flight-bookings-and-holds` | Flight Bookings, Concurrency Seat Holds (10-min expiry), E-Ticket PDF, Passenger CSV Export (`FLT-19`..`FLT-29`, `GEN-11`) |
| 5 | **Adham** | `Adham` | `feature/HTL-01-hotels-bookings-reviews` | Hotels, Rooms, Availability & Blocked Dates, Hotel Search, Hotel Bookings & Reviews (`HTL-01`..`HTL-26`) |
| 6 | **Youssef** | `omarashraf4488` / `Youssef` | `feature/PAY-01-payments-and-refunds` | Payments (Stripe Test Mode PaymentIntents & Webhooks), Policy Acceptance, Refunds (`PAY-01`..`PAY-04`) |
| 7 | **Hamza Feras** | `hamzaferas4` | `feature/ITN-01-itineraries-and-blog` | Itineraries, Day Reordering & City Grouping, FXRatesAPI Budgeting, Blog & Community (`ITN-01`..`ITN-28`, `BLG-01`..`BLG-13`) |

---

## Setup & Installation Instructions

### 1. Prerequisites
- **Node.js** v18+ and **npm**
- **MongoDB Atlas** shared cluster connection URI

### 2. Environment Variables
Copy `.env.example` into `backend/.env` and fill in your team's shared MongoDB Atlas URI and Stripe test keys:

```bash
cp .env.example backend/.env
```

### 3. Install Dependencies, Run & Test
```bash
cd backend
npm install
npm run start:dev
```

To run the automated Milestone 1 test suite:
```bash
cd backend
npm test
```

### 4. Swagger API Documentation
Once the server is running on port `4000`, open Swagger UI in your browser:
- **Swagger UI:** `http://localhost:4000/api/docs`
