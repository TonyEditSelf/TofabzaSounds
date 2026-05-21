'use server';
import 'server-only';

import { Resend } from 'resend';

// =============================================================
// /lib/email/client.js
// Resend email client. Server-side only.
// =============================================================

const resend = new Resend(process.env.RESEND_API_KEY);

/** Operator email — the only recipient for all system emails */
const OPERATOR_EMAIL = process.env.OPERATOR_EMAIL;

/** From address — must be a verified domain in Resend */
const FROM_ADDRESS = process.env.RESEND_FROM_ADDRESS || 'alerts@yourdomain.com';

/**
 * Sends an email via Resend to the operator.
 * All system emails go to OPERATOR_EMAIL only.
 *
 * @param {object} params
 * @param {string} params.subject
 * @param {string} params.html - HTML body (use template functions below)
 * @param {string} [params.text] - Optional plain text fallback
 * @returns {Promise<{ id: string }|null>}
 */
export async function sendOperatorEmail({ subject, html, text }) {
  if (!OPERATOR_EMAIL) {
    console.error('[email] OPERATOR_EMAIL not set — cannot send email');
    return null;
  }

  try {
    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to: OPERATOR_EMAIL,
      subject,
      html,
      text: text || stripHtml(html),
    });
    return result;
  } catch (err) {
    console.error('[email] Failed to send email:', err.message);
    return null;
  }
}

/**
 * Minimal HTML stripper for plain text fallback.
 * @param {string} html
 * @returns {string}
 */
function stripHtml(html) {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

// =============================================================
// EMAIL TEMPLATES
// Simple HTML strings — no JSX dependency needed for Phase 0.
// Upgrade to @react-email/components in Phase 1 if desired.
// =============================================================

/**
 * Low cost alert email.
 * Sent when a client's monthly API cost exceeds the threshold.
 *
 * @param {object} params
 * @param {string} params.clientName
 * @param {number} params.costInr - Current month cost in INR
 * @param {number} params.thresholdInr - Threshold that was crossed
 * @param {string} params.dashboardUrl
 * @returns {Promise<{ id: string }|null>}
 */
export async function sendLowCostAlert({ clientName, costInr, thresholdInr, dashboardUrl }) {
  const subject = `⚠️ Cost alert: ${clientName} has exceeded ₹${thresholdInr.toLocaleString('en-IN')}`;

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #0A0B0F; margin-bottom: 8px;">Cost Alert</h2>
      <p style="color: #4A4E6B; margin-bottom: 24px;">
        Monthly API cost for <strong>${clientName}</strong> has crossed your alert threshold.
      </p>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <tr>
          <td style="padding: 12px; border: 1px solid #E2E4EF; color: #4A4E6B;">Client</td>
          <td style="padding: 12px; border: 1px solid #E2E4EF; font-weight: 600;">${clientName}</td>
        </tr>
        <tr>
          <td style="padding: 12px; border: 1px solid #E2E4EF; color: #4A4E6B;">Current cost</td>
          <td style="padding: 12px; border: 1px solid #E2E4EF; font-weight: 600; color: #E11D48;">
            ₹${costInr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </td>
        </tr>
        <tr>
          <td style="padding: 12px; border: 1px solid #E2E4EF; color: #4A4E6B;">Alert threshold</td>
          <td style="padding: 12px; border: 1px solid #E2E4EF;">₹${thresholdInr.toLocaleString('en-IN')}</td>
        </tr>
      </table>
      <a href="${dashboardUrl}/costs"
         style="display: inline-block; background: #0A0B0F; color: white;
                padding: 12px 24px; border-radius: 8px; text-decoration: none;
                font-weight: 500; font-size: 14px;">
        View Cost Dashboard
      </a>
      <p style="color: #7C82A3; font-size: 12px; margin-top: 24px;">
        Sarvam Agency Platform · Automated alert
      </p>
    </div>
  `;

  return sendOperatorEmail({ subject, html });
}

/**
 * Agent error / circuit breaker email.
 * Sent when a circuit breaker opens (Sarvam / OpenAI / Exotel down).
 *
 * @param {object} params
 * @param {string} params.service - 'Sarvam AI' | 'OpenAI' | 'Exotel'
 * @param {string} params.agentName - Agent that was affected
 * @param {string} params.errorMessage
 * @param {number} params.failureCount - Consecutive failures that triggered the breaker
 * @param {string} params.dashboardUrl
 * @returns {Promise<{ id: string }|null>}
 */
export async function sendAgentErrorAlert({
  service,
  agentName,
  errorMessage,
  failureCount,
  dashboardUrl,
}) {
  const subject = `🔴 Circuit breaker open: ${service} — ${agentName} affected`;

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #E11D48; margin-bottom: 8px;">Service Disruption</h2>
      <p style="color: #4A4E6B; margin-bottom: 24px;">
        The circuit breaker for <strong>${service}</strong> has opened after ${failureCount} consecutive failures.
        Calls are being handled with graceful fallbacks.
      </p>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <tr>
          <td style="padding: 12px; border: 1px solid #E2E4EF; color: #4A4E6B;">Service</td>
          <td style="padding: 12px; border: 1px solid #E2E4EF; font-weight: 600;">${service}</td>
        </tr>
        <tr>
          <td style="padding: 12px; border: 1px solid #E2E4EF; color: #4A4E6B;">Agent</td>
          <td style="padding: 12px; border: 1px solid #E2E4EF;">${agentName}</td>
        </tr>
        <tr>
          <td style="padding: 12px; border: 1px solid #E2E4EF; color: #4A4E6B;">Error</td>
          <td style="padding: 12px; border: 1px solid #E2E4EF; font-family: monospace; font-size: 13px; color: #E11D48;">
            ${errorMessage}
          </td>
        </tr>
        <tr>
          <td style="padding: 12px; border: 1px solid #E2E4EF; color: #4A4E6B;">Failures</td>
          <td style="padding: 12px; border: 1px solid #E2E4EF;">${failureCount} consecutive</td>
        </tr>
      </table>
      <p style="color: #4A4E6B; margin-bottom: 16px; font-size: 14px;">
        The circuit will retry in 30 seconds. If the issue persists, check ${service} status page.
      </p>
      <a href="${dashboardUrl}/analytics"
         style="display: inline-block; background: #0A0B0F; color: white;
                padding: 12px 24px; border-radius: 8px; text-decoration: none;
                font-weight: 500; font-size: 14px;">
        View Live Logs
      </a>
      <p style="color: #7C82A3; font-size: 12px; margin-top: 24px;">
        Sarvam Agency Platform · Automated alert
      </p>
    </div>
  `;

  return sendOperatorEmail({ subject, html });
}

/**
 * NDNC batch failure alert.
 * Sent when NDNC failure rate exceeds 10% of a campaign batch.
 *
 * @param {object} params
 * @param {string} params.campaignName
 * @param {number} params.failureRate - e.g. 0.15 for 15%
 * @param {number} params.failedCount
 * @param {number} params.totalCount
 * @param {string} params.dashboardUrl
 * @returns {Promise<{ id: string }|null>}
 */
export async function sendNdncFailureAlert({
  campaignName,
  failureRate,
  failedCount,
  totalCount,
  dashboardUrl,
}) {
  const subject = `⚠️ NDNC check failures: ${campaignName} — ${Math.round(failureRate * 100)}% failed`;

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #D97706; margin-bottom: 8px;">NDNC Check Alert</h2>
      <p style="color: #4A4E6B; margin-bottom: 24px;">
        NDNC API failures for campaign <strong>${campaignName}</strong> exceed the 10% threshold.
        Affected contacts have been skipped and marked <code>ndnc_check_failed</code>.
        They will be retried on the next campaign run.
      </p>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <tr>
          <td style="padding: 12px; border: 1px solid #E2E4EF; color: #4A4E6B;">Campaign</td>
          <td style="padding: 12px; border: 1px solid #E2E4EF; font-weight: 600;">${campaignName}</td>
        </tr>
        <tr>
          <td style="padding: 12px; border: 1px solid #E2E4EF; color: #4A4E6B;">Failure rate</td>
          <td style="padding: 12px; border: 1px solid #E2E4EF; color: #D97706; font-weight: 600;">
            ${Math.round(failureRate * 100)}% (${failedCount} of ${totalCount})
          </td>
        </tr>
      </table>
      <p style="color: #4A4E6B; font-size: 14px; margin-bottom: 16px;">
        TRAI compliance reminder: never dial a number whose DND status is unknown.
        Check Exotel NDNC API status before resuming.
      </p>
      <a href="${dashboardUrl}/campaigns"
         style="display: inline-block; background: #0A0B0F; color: white;
                padding: 12px 24px; border-radius: 8px; text-decoration: none;
                font-weight: 500; font-size: 14px;">
        View Campaign
      </a>
    </div>
  `;

  return sendOperatorEmail({ subject, html });
}
