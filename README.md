# Travel Planning and Booking Platform — Milestone 1 (Backend & API)

German International University (GIU) — Faculty of Informatics and Computer Science  
**Course:** Software Project I (Winter 2026)

## Team Members, GitHub Commit Authors & Module Ownership

| # | Student Name | Git Author / GitHub Handle | Feature Branch | Assigned Modules & Requirement IDs |
|---|---|---|---|---|
| 1 | **Mohamed Ahmed Abdelmohymen** (Team Lead) | `Abdel-mohymen` | `feature/ACC-01-auth-and-core-setup` | Core Setup, Reference Data Seeding, Auth, User Profiles, Notifications, Media Uploads (`ACC-01`..`ACC-12`, `ACC-18`, `ACC-19`, `FLT-02`, `GEN-01`, `GEN-08`, `GEN-12`, `GEN-13`, `BON-02`) |
| 2 | **Takiee-Allah** | `Takiee` | `feature/ACC-13-admin-moderation-audit` | Administration, Moderator Management, Provider Status, Content Moderation, Audit Logs (`ACC-07a`, `ACC-13`..`ACC-17`, `GEN-07`, `GEN-09`, `GEN-10`, `BON-01`) |
| 3 | **Abdulrahman Walid** | `abdullrahmanwalidshawky` (`Abdulrahmanwld@gmail.com`) | `feature/FLT-01-airlines-and-flights` | Airlines, Airports, Flights, Cabin Inventory, Baggage & Cancellation Policies, Flight Search (`FLT-01`..`FLT-17`, `FLT-30`, `GEN-06`) |
| 4 | **Abdallah Ahmed** | `abdallaahmadd` | `feature/FLT-22-flight-bookings-and-holds` | Flight Bookings, Concurrency Seat Holds (10-min expiry), E-Ticket PDF, Passenger CSV Export (`FLT-19`..`FLT-29`, `GEN-11`) |
| 5 | **Adam Mohamed (Adham)** | `adammohamed16001342` | `feature/HTL-01-hotels-bookings-reviews` | Hotels, Rooms, Availability & Blocked Dates, Hotel Search, Hotel Bookings & Reviews (`HTL-01`..`HTL-26`) |
| 6 | **Hamza Feras** | `hamzaferas4` | `feature/PAY-01-payments-and-refunds` | Payments (Stripe Test Mode PaymentIntents & Webhooks), Policy Acceptance, Refunds (`PAY-01`..`PAY-04`) |
| 7 | **Omar Ashraf** | `omarashraf4488` | `feature/ITN-01-itineraries-and-blog` | Itineraries, Day Reordering & City Grouping, FXRatesAPI Budgeting, Blog & Community (`ITN-01`..`ITN-28`, `BLG-01`..`BLG-13`) |

---

## Setup & Installation Instructions

### 1. Prerequisites
- **Node.js** v18+ and **npm**
- **MongoDB Atlas** shared cluster connection URI

### 2. Environment Variables (`backend/.env`)
Copy `.env.example` into `backend/.env` and set your team's shared `MONGODB_URI`:

```bash
cp .env.example backend/.env
```
> **Important Note on `STRIPE_WEBHOOK_SECRET`:** `PaymentsService` validates on startup (`onModuleInit`) that `STRIPE_WEBHOOK_SECRET` is configured in `backend/.env` (at least 12 characters, not a `replace_with` placeholder). `.env.example` already includes a ready-to-use local dev signing secret (`whsec_giu_sp1_w26_local_dev_webhook_signing_key`), so copying `.env.example` to `backend/.env` and setting `MONGODB_URI` works immediately.

### 3. Install Dependencies, Run Tests & Start Server
```bash
cd backend
npm install
npm test
npm run start:dev
```

### 4. Testing Signed Webhooks Locally in Swagger UI
To generate a valid `stripe-signature` header for a `paymentIntentId` when testing `POST /api/payments/webhook` in Swagger UI:
```bash
cd backend
npm run webhook:sign <paymentIntentId>
```

### 5. Swagger API Documentation
Once the server is running on port `4000`, open Swagger UI in your browser:
- **Swagger UI:** `http://localhost:4000/api/docs`
