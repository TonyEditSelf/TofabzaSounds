/**
 * lib/telephony/provider.js
 *
 * Thin provider selector — controls whether Plivo or Exotel is active.
 * Set TELEPHONY_PROVIDER=plivo in env to enable Plivo.
 * Omitting the var (or setting it to "exotel") keeps existing behaviour.
 */

export function getTelephonyProvider() {
  return process.env.TELEPHONY_PROVIDER ?? "exotel";
}

export function isPlivo() {
  return getTelephonyProvider() === "plivo";
}

export function isExotel() {
  return getTelephonyProvider() === "exotel";
}
