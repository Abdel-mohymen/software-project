# Travel Planning and Booking Platform — Milestone 1 (Backend & API)

German International University (GIU) — Faculty of Informatics and Computer Science  
**Course:** Software Project I (Winter 2026)

## Team Members & Module Ownership

| # | Team Member | Assigned Modules & Requirement IDs |
|---|---|---|
| 1 | **Abdelmohymen** (Team Lead) | Core Setup, Reference Data Seeding, Auth, User Profiles, Notifications, Media Uploads (`ACC-01`..`ACC-12`, `ACC-18`, `ACC-19`, `FLT-02`, `GEN-01`, `GEN-08`, `GEN-12`, `GEN-13`) |
| 2 | **Takiee** | Administration, Moderator Management, Provider Status, Content Moderation, Audit Logs (`ACC-13`..`ACC-17`, `GEN-07`, `GEN-09`, `GEN-10`, `BON-01`) |
| 3 | **Abdo** | Airlines, Airports, Flights, Cabin Inventory, Baggage & Cancellation Policies, Flight Search (`FLT-01`..`FLT-17`, `FLT-30`, `GEN-06`) |
| 4 | **Abdella** | Flight Bookings, Concurrency Seat Holds (10-min expiry), E-Ticket PDF, Passenger CSV Export (`FLT-19`..`FLT-29`, `GEN-11`) |
| 5 | **Adham** | Hotels, Rooms, Availability & Blocked Dates, Hotel Search, Hotel Bookings & Reviews (`HTL-01`..`HTL-26`) |
| 6 | **Youssef** | Payments (Stripe Test Mode PaymentIntents & Webhooks), Policy Acceptance, Refunds (`PAY-01`..`PAY-04`) |
| 7 | **Hamza** | Itineraries, Day Reordering & City Grouping, FXRatesAPI Budgeting, Blog & Community (`ITN-01`..`ITN-28`, `BLG-01`..`BLG-13`, `BON-02`) |

---

## Repository Structure

```text
project-root/
|-- backend/
|   |-- data/                  # Official CSV reference datasets (Countries, Cities, Airports, Attractions)
|   |-- src/
|   |   |-- common/            # Guards, decorators, filters, pagination DTOs, timezone helpers
|   |   |-- modules/
|   |   |   |-- auth/          # Authentication & session/cookie handling (Abdelmohymen)
|   |   |   |-- users/         # Profile & account lifecycle (Abdelmohymen)
|   |   |   |-- reference/     # Reference dataset seeding & lookup (Abdelmohymen)
|   |   |   |-- notifications/ # In-app notifications & optional email service (Abdelmohymen)
|   |   |   |-- uploads/       # Image upload validation & static serving (Abdelmohymen)
|   |   |   |-- admin/         # Admin accounts, moderators, providers, reports, audit logs (Takiee)
|   |   |   |-- airlines/      # Airline profiles, baggage & cancellation policies (Abdo)
|   |   |   |-- flights/       # Flights, cabin inventory, timezone conversion & search (Abdo)
|   |   |   |-- flight-bookings/# Concurrency seat holds, flight bookings, e-tickets, CSV export (Abdella)
|   |   |   |-- hotels/        # Hotels, rooms, availability ranges, policies & search (Adham)
|   |   |   |-- hotel-bookings/# Multi-room reservations, holds, cancellations & reviews (Adham)
|   |   |   |-- payments/      # Policy acceptance, Stripe PaymentIntents, webhooks & refunds (Youssef)
|   |   |   |-- itineraries/   # Itineraries, days, activities, FXRatesAPI budgets & cloning (Hamza)
|   |   |   `-- blog/          # Blog posts, comments, likes, tags & author profiles (Hamza)
|   |-- package.json
|   `-- tsconfig.json
|-- docs/
|   |-- requirements/          # Requirement traceability matrix
|   `-- api/                   # REST API endpoint reference
|-- AI_PROMPTS.txt             # Mandatory AI prompt log (Section 11.1)
|-- .env.example
|-- .gitignore
`-- README.md
```

---

## Setup & Installation Instructions

### 1. Prerequisites
- **Node.js** v18+ and **npm**
- **MongoDB Atlas** shared cluster connection URI
- **Stripe Account** (Test Mode API keys)

### 2. Environment Variables
Copy `.env.example` into `backend/.env` (and root `.env` if running from root) and fill in your team's shared MongoDB Atlas URI and Stripe test keys:

```bash
cp .env.example backend/.env
```

### 3. Install Dependencies & Start Backend
```bash
cd backend
npm install
npm run start:dev
```

On startup, the backend automatically:
1. Connects to the shared **MongoDB Atlas** database.
2. Seeds the official reference datasets (`Countries.csv`, `Cities.csv`, `Airports.csv`, `Attractions.csv`) if not yet present (`GEN-12`, `FLT-02`).
3. Seeds the default Administrator account (`ACC-18`).
4. Starts the background hold-expiration worker (`FLT-22`, `HTL-18`, `GEN-11`).

### 4. Swagger API Documentation
Once the server is running on port `4000`, open Swagger UI in your browser:
- **Swagger UI:** `http://localhost:4000/api/docs`
