# Milestone 1 — Complete REST API Endpoint Reference

Interactive Swagger UI is hosted at: `http://localhost:4000/api/docs`

## 1. Reference Data & Airports (`GEN-12`, `FLT-02`)
| Method | Endpoint | Auth | Requirement | Description |
|---|---|---|---|---|
| `GET` | `/api/airports` | Public | `FLT-02`, `GEN-12` | List/search predefined airports (`?q=`) with IATA code and IANA `time_zone` |
| `GET` | `/api/reference/countries` | Public | `GEN-12` | List predefined countries and currency codes |
| `GET` | `/api/reference/cities` | Public | `GEN-12` | List predefined cities (`?countryCode=`) |
| `GET` | `/api/reference/attractions` | Public | `GEN-12` | List predefined attractions (`?cityId=`) |
| `GET` | `/api/reference/currencies` | Public | `GEN-12` | List supported currency codes from `Countries.csv` |

## 2. Authentication & Accounts (`ACC-01`..`ACC-12`, `ACC-19`, `BON-02`)
| Method | Endpoint | Auth | Requirement | Description |
|---|---|---|---|---|
| `POST` | `/api/auth/register` | Public | `ACC-01` | Register traveler (`name`, `email`, `password` >=8 chars letter+digit, `termsConsent: true`) |
| `GET` | `/api/auth/verify-email` | Public | `ACC-02` (Bonus) | Verify email via token |
| `POST` | `/api/auth/login` | Public | `ACC-04`, `ACC-05`, `ACC-19` | Login; sets `httpOnly` `access_token` (30m sliding) & `refresh_token` cookies; locks 15m after 5 failed attempts |
| `POST` | `/api/auth/refresh` | Cookie | `ACC-06`, `ACC-19` | Refresh `access_token` cookie using `refresh_token` cookie |
| `POST` | `/api/auth/logout` | Auth | `ACC-06` | Clear auth cookies and revoke refresh token |
| `POST` | `/api/auth/forgot-password` | Public | `ACC-07` (Bonus) | Generate single-use 30m reset token |
| `POST` | `/api/auth/reset-password` | Public | `ACC-07` (Bonus) | Reset password with token |
| `PATCH` | `/api/auth/change-password` | Auth | `ACC-08`, `ACC-07a` | Change password and clear `mustChangePassword` flag |
| `GET` | `/api/auth/me` | Auth | `ACC-04`, `ACC-19` | Return authenticated session user |
| `GET` | `/api/users/me` | Auth | `ACC-11` | Get user profile |
| `PATCH` | `/api/users/me` | Auth | `ACC-09` | Update name, phone, and validated `preferredCurrency` |
| `DELETE` | `/api/users/me?confirm=true` | Auth | `ACC-12`, `GEN-03` | Deactivate own account (requires `confirm=true`; blocked if upcoming Confirmed bookings exist) |
| `GET` | `/api/users/me/favourites` | Auth | `BON-02` (Bonus) | List saved favourite hotels and public itineraries |
| `POST` | `/api/users/me/favourites` | Auth | `BON-02` (Bonus) | Add hotel or public itinerary to favourites |
| `DELETE` | `/api/users/me/favourites/:id` | Auth | `BON-02` (Bonus) | Remove item from favourites |

## 3. Administration & Moderation (`ACC-07a`, `ACC-13`..`ACC-17`, `GEN-07`, `GEN-09`, `GEN-10`, `BON-01`)
| Method | Endpoint | Auth | Requirement | Description |
|---|---|---|---|---|
| `POST` | `/api/admin/moderators` | Admin | `ACC-13` | Create Airline or Hotel Moderator linked to one provider |
| `POST` | `/api/admin/users/:id/reset-password` | Admin | `ACC-07a` | Admin-assisted password reset (`mustChangePassword: true`) |
| `GET` | `/api/admin/accounts` | Admin | `ACC-14`, `GEN-05` | Paginated accounts list (10/page) with `search`, `role`, `status` |
| `PATCH` | `/api/admin/accounts/:id/suspend` | Admin | `ACC-15`, `ACC-16` | Suspend user/moderator account + notification + audit log |
| `PATCH` | `/api/admin/accounts/:id/reactivate` | Admin | `ACC-15`, `ACC-16` | Reactivate user/moderator account + notification + audit log |
| `PATCH` | `/api/admin/providers/:type/:id/deactivate` | Admin | `ACC-15` | Deactivate airline/hotel (hidden from search; Confirmed bookings remain valid) |
| `PATCH` | `/api/admin/providers/:type/:id/reactivate` | Admin | `ACC-15` | Reactivate airline/hotel provider |
| `GET` | `/api/admin/bookings` | Admin | `ACC-17` | Inspect all flight and hotel bookings (`type`, `status`, `startDate`, `endDate`) |
| `POST` | `/api/reports` | Auth | `GEN-09` | Report post, comment, review, or itinerary (once per user per item) |
| `GET` | `/api/admin/reports` | Admin | `GEN-09`, `GEN-10` | List content reports |
| `PATCH` | `/api/admin/reports/:id` | Admin | `GEN-10`, `GEN-07` | Resolve report (`dismiss`, `hide`, `delete`) + audit log |
| `DELETE` | `/api/admin/content/:type/:id` | Admin | `GEN-10`, `GEN-07` | Hide or delete post, comment, review, or itinerary |
| `GET` | `/api/admin/audit-logs` | Admin | `GEN-07` | Paginated admin audit logs |
| `GET` | `/api/admin/analytics` | Admin | `BON-01` (Bonus) | Bookings and revenue per provider |

## 4. Airlines, Flights & Flight Bookings (`FLT-01`..`FLT-30`, `GEN-06`, `GEN-11`)
| Method | Endpoint | Auth | Requirement | Description |
|---|---|---|---|---|
| `POST` | `/api/airlines` | Admin | `FLT-01` | Create airline |
| `GET` | `/api/airlines` | Public | `FLT-01` | List all airlines |
| `GET` | `/api/airlines/:id` | Public | `FLT-01` | Get airline profile and policies |
| `PATCH` | `/api/airlines/:id` | Airline Mod | `FLT-01` | Update assigned airline profile |
| `PUT` | `/api/airlines/:id/baggage-policy` | Airline Mod | `FLT-08` | Set `extraBagPrice` and `maxExtraBagsPerPassenger` |
| `PUT` | `/api/airlines/:id/cancellation-policy` | Airline Mod | `FLT-09` | Set cancellation tiers (`daysBeforeDeparture` -> `refundPercentage`) |
| `POST` | `/api/flights` | Airline Mod | `FLT-03`, `GEN-06` | Create flight (converts local airport IANA timezone to UTC) |
| `GET` | `/api/flights/search` | Public | `FLT-11`, `FLT-12`, `FLT-15` | Search one-way/round-trip Scheduled flights |
| `GET` | `/api/flights/:id` | Public | `FLT-17` | Get flight details, cabins, and policies |
| `PATCH` | `/api/flights/:id` | Airline Mod | `FLT-05`, `FLT-30` | Update flight schedule and notify Confirmed passengers |
| `POST` | `/api/flights/:id/cancel` | Airline Mod | `FLT-06` | Cancel Scheduled flight and issue 100% refunds |
| `POST` | `/api/flights/:id/cabins` | Airline Mod | `FLT-04` | Add cabin (`Economy`, `Premium Economy`, `Business`, `First`) |
| `PATCH` | `/api/flights/:id/cabins/:cabinId` | Airline Mod | `FLT-04`, `FLT-05` | Update cabin price/seats (cannot reduce below `bookedSeats + heldSeats`) |
| `POST` | `/api/flight-bookings/hold` | Auth | `FLT-22` | Atomically hold flight seats for 10 minutes (`Pending Payment`) |
| `POST` | `/api/flight-bookings` | Auth | `FLT-19`, `FLT-21`, `FLT-22` | Create flight booking with atomic 10-minute seat hold |
| `GET` | `/api/flight-bookings` | Auth | `FLT-25` | List user flight bookings (`upcoming`, `past`, `cancelled`) |
| `GET` | `/api/flight-bookings/:id` | Auth | `FLT-25`, `ACC-11` | Get flight booking details (ownership enforced) |
| `POST` | `/api/flight-bookings/:id/cancel` | Auth | `FLT-26` | Cancel Confirmed booking before departure with tier refund |
| `GET` | `/api/flight-bookings/:id/e-ticket` | Auth | `FLT-23` | Download PDF e-ticket for Confirmed booking |
| `PATCH` | `/api/flight-bookings/:id/change-flight` | Auth | `FLT-27` (Bonus) | Change flight on same route and cabin |
| `PATCH` | `/api/flight-bookings/:id/seat` | Auth | `FLT-28` (Bonus) | Select passenger seat |
| `GET` | `/api/flights/:id/bookings` | Airline Mod | `FLT-29` | View flight bookings and cabin availability |
| `GET` | `/api/flights/:id/passengers/export` | Airline Mod | `FLT-29` | Export flight passenger manifest as CSV |

## 5. Hotels, Rooms, Hotel Bookings & Reviews (`HTL-01`..`HTL-26`)
| Method | Endpoint | Auth | Requirement | Description |
|---|---|---|---|---|
| `POST` | `/api/hotels` | Admin | `HTL-01` | Create hotel |
| `GET` | `/api/hotels/search` | Public | `HTL-11`, `HTL-12` | Search active hotels by city/country, dates, guests, rooms, price, rating |
| `GET` | `/api/hotels/:id` | Public | `HTL-02` | Get hotel details, rooms, policies, and reviews |
| `PATCH` | `/api/hotels/:id` | Hotel Mod | `HTL-01` | Update assigned hotel profile |
| `PUT` | `/api/hotels/:id/policies` | Hotel Mod | `HTL-09`, `HTL-10` | Set check-in/out times and cancellation tiers |
| `POST` | `/api/hotels/:id/rooms` | Hotel Mod | `HTL-03` | Add bookable room |
| `PATCH` | `/api/hotels/:id/rooms/:roomId` | Hotel Mod | `HTL-05`, `HTL-06` | Edit room details or active status |
| `DELETE` | `/api/hotels/:id/rooms/:roomId` | Hotel Mod | `HTL-06` | Delete room (only if never reserved) |
| `GET` | `/api/hotels/:id/rooms/available` | Public | `HTL-15` | List rooms free for searched stay dates |
| `POST` | `/api/hotels/:id/rooms/:roomId/availability` | Hotel Mod | `HTL-04` | Set non-overlapping bookable date ranges |
| `PATCH` | `/api/hotels/:id/rooms/:roomId/availability` | Hotel Mod | `HTL-05`, `HTL-06` | Update bookable ranges and blocked maintenance ranges |
| `GET` | `/api/hotels/:id/availability` | Hotel Mod | `HTL-08` | View room statuses (`Available`, `Booked`, `Blocked`) |
| `GET` | `/api/hotels/:id/reservations` | Hotel Mod | `HTL-22` | View hotel reservations |
| `POST` | `/api/hotel-bookings` | Auth | `HTL-16`, `HTL-18` | Atomically lock and hold one or more rooms for 10 minutes |
| `GET` | `/api/hotel-bookings` | Auth | `HTL-20` | List user hotel reservations (`upcoming`, `past`, `cancelled`) |
| `GET` | `/api/hotel-bookings/:id` | Auth | `HTL-20`, `ACC-11` | Get hotel reservation details |
| `POST` | `/api/hotel-bookings/:id/cancel` | Auth | `HTL-21` | Cancel Confirmed reservation before check-in with tier refund |
| `POST` | `/api/hotel-bookings/:id/review` | Auth | `HTL-23` | Submit rating (1-5) & review for a `Completed` stay |
| `PATCH` | `/api/reviews/:id` | Auth | `HTL-23` | Edit own review and recalculate rating |
| `DELETE` | `/api/reviews/:id` | Auth | `HTL-23` | Delete own review and recalculate rating |
| `GET` | `/api/hotels/:id/reviews` | Public | `HTL-24` | Paginated hotel reviews newest first |
| `POST` | `/api/reviews/:id/reply` | Hotel Mod | `HTL-26` (Bonus) | Hotel moderator reply to a review |

## 6. Payments & Refunds (`PAY-01`..`PAY-04`)
| Method | Endpoint | Auth | Requirement | Description |
|---|---|---|---|---|
| `GET` | `/api/bookings/:type/:id/policies` | Auth | `PAY-02` | View applicable provider policies before payment |
| `POST` | `/api/bookings/:type/:id/accept-policies` | Auth | `PAY-02` | Record `policyAccepted: true` and `policyAcceptedAt` timestamp |
| `POST` | `/api/payments` | Auth | `PAY-01`, `PAY-04` | Create Stripe test-mode `PaymentIntent` |
| `POST` | `/api/payments/:id/retry` | Auth | `PAY-01` | Retry failed payment within 10-minute hold window |
| `GET` | `/api/payments/:id` | Auth | `PAY-01` | Inspect payment status |
| `POST` | `/api/payments/webhook` | Signature | `PAY-01` | Verify `stripe-signature` header and confirm booking |
| `GET` | `/api/refunds/:id` | Auth | `PAY-03` | Inspect refund status (`Pending`, `Refunded`, `Failed`) |

## 7. Itineraries & Blog (`ITN-01`..`ITN-28`, `BLG-01`..`BLG-13`)
| Method | Endpoint | Auth | Requirement | Description |
|---|---|---|---|---|
| `POST` | `/api/itineraries` | Auth | `ITN-01` | Create private itinerary |
| `GET` | `/api/itineraries` | Auth | `ITN-03` | List own itineraries |
| `GET` | `/api/itineraries/:id` | Auth | `ITN-03`, `ITN-09` | Get itinerary details, city groups, and budget summary |
| `PATCH` | `/api/itineraries/:id` | Auth | `ITN-01`, `ITN-20` | Update itinerary or visibility (`private`/`public`) |
| `DELETE` | `/api/itineraries/:id?confirm=true` | Auth | `ITN-01`, `GEN-03` | Delete itinerary after confirmation |
| `POST` | `/api/itineraries/:id/days` | Auth | `ITN-05` | Add day (up to 60 days) |
| `PATCH` | `/api/itineraries/:id/days/reorder` | Auth | `ITN-08` | Reorder days and recalculate dates & city groups |
| `PATCH` | `/api/itineraries/:id/days/:dayId` | Auth | `ITN-05` | Edit day city and notes |
| `DELETE` | `/api/itineraries/:id/days/:dayId` | Auth | `ITN-07` | Delete day and renumber remaining days |
| `POST` | `/api/itineraries/:id/days/:dayId/activities` | Auth | `ITN-10` | Add activity |
| `PATCH` | `/api/activities/:id` | Auth | `ITN-10` | Edit activity |
| `DELETE` | `/api/activities/:id` | Auth | `ITN-10` | Delete activity |
| `POST` | `/api/activities/:id/images` | Auth | `ITN-12`, `GEN-08` | Upload JPG/PNG image (<=5MB, magic bytes verified) |
| `DELETE` | `/api/activities/:id/images/:imageId` | Auth | `ITN-12` | Delete activity image |
| `POST` | `/api/itineraries/:id/days/:dayId/budgets` | Auth | `ITN-14` | Add daily budget entry |
| `PATCH` | `/api/budgets/:id` | Auth | `ITN-14` | Edit budget entry |
| `DELETE` | `/api/budgets/:id` | Auth | `ITN-14` | Delete budget entry |
| `POST` | `/api/itineraries/:id/transport-costs` | Auth | `ITN-16` | Add intercity transport cost |
| `PATCH` | `/api/transport-costs/:id` | Auth | `ITN-16` | Edit intercity transport cost |
| `DELETE` | `/api/transport-costs/:id` | Auth | `ITN-16` | Delete intercity transport cost |
| `GET` | `/api/itineraries/:id/budget-summary` | Auth | `ITN-14`, `ITN-18` | Convert budget totals via cached `FXRatesAPI` rates |
| `GET` | `/api/itineraries/public/search` | Public | `ITN-20`, `ITN-21` | Search public itineraries |
| `GET` | `/api/itineraries/public/:id` | Public | `ITN-21` | View public itinerary |
| `POST` | `/api/itineraries/:id/clone` | Auth | `ITN-21` | Clone public itinerary preserving attribution |
| `GET` | `/api/itineraries/:id/hotels` | Auth | `ITN-25` | Search hotels for city group dates |
| `GET` | `/api/itineraries/:id/flights` | Auth | `ITN-26` | Search flights to first-day city |
| `POST` | `/api/itineraries/:id/bookings` | Auth | `ITN-27` (Bonus) | Attach confirmed booking |
| `GET` | `/api/itineraries/:id/pdf` | Auth | `ITN-28` (Bonus) | Export itinerary PDF |
| `POST` | `/api/posts` | Auth | `BLG-01` | Create blog post (`Draft` or `Published`) |
| `GET` | `/api/posts` | Public | `BLG-02`, `BLG-09` | Browse/search published posts (sorted by `likes + comments` desc) |
| `GET` | `/api/posts/mine` | Auth | `BLG-03` | List own posts including drafts |
| `GET` | `/api/posts/:id` | Public/Auth | `BLG-02`, `BLG-05` | Get post details and chronological comments |
| `PATCH` | `/api/posts/:id` | Auth | `BLG-04`, `BLG-08` | Edit own post and tags (max 5 tags, <=30 chars) |
| `DELETE` | `/api/posts/:id` | Auth | `BLG-04` | Delete own post |
| `POST` | `/api/posts/:id/comments` | Auth | `BLG-05` | Add comment (max 500 chars) |
| `PATCH` | `/api/comments/:id` | Auth | `BLG-07` | Edit own comment |
| `DELETE` | `/api/comments/:id` | Auth | `BLG-07` | Delete own comment |
| `POST` | `/api/posts/:id/like` | Auth | `BLG-06` | Like post (at most once per user) |
| `DELETE` | `/api/posts/:id/like` | Auth | `BLG-06` | Unlike post |
| `POST` | `/api/posts/:id/images` | Auth | `BLG-10`, `GEN-08` | Upload post image (JPG/PNG <=5MB, max 5) |
| `DELETE` | `/api/posts/:id/images/:imageId` | Auth | `BLG-10` | Remove post image |
| `GET` | `/api/tags/:tag/posts` | Public | `BLG-08` | List published posts by tag |
| `GET` | `/api/authors/:id` | Public | `BLG-12` | Public author profile page |
| `PATCH` | `/api/posts/:id/itinerary` | Auth | `BLG-13` (Bonus) | Attach itinerary to post |
