export enum UserRole {
  REGISTERED_USER = 'registered_user',
  ADMIN = 'admin',
  AIRLINE_MODERATOR = 'airline_moderator',
  HOTEL_MODERATOR = 'hotel_moderator',
}

export enum AccountStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  DEACTIVATED = 'deactivated',
}

export enum BookingLifecycleStatus {
  PENDING_PAYMENT = 'Pending Payment',
  CONFIRMED = 'Confirmed',
  COMPLETED = 'Completed',
  EXPIRED = 'Expired',
  CANCELLED = 'Cancelled',
}
