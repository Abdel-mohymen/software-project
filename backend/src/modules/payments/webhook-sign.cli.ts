import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

function loadEnvSecret(): string {
  if (process.env.STRIPE_WEBHOOK_SECRET) {
    return process.env.STRIPE_WEBHOOK_SECRET.trim();
  }
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      if (line.startsWith('STRIPE_WEBHOOK_SECRET=')) {
        return line.slice(line.indexOf('=') + 1).trim();
      }
    }
  }
  throw new Error('STRIPE_WEBHOOK_SECRET must be set in backend/.env');
}

const paymentIntentId = process.argv[2] || 'pi_test_example';
const eventType = process.argv[3] || 'payment_intent.succeeded';
const secret = loadEnvSecret();
const timestamp = Math.floor(Date.now() / 1000);
const payload = JSON.stringify({ type: eventType, paymentIntentId });
const sig = crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');

console.log('\n=== Stripe Webhook Test Helper (Local Developer CLI) ===');
console.log('Header stripe-signature:');
console.log(`t=${timestamp},v1=${sig}`);
console.log('\nJSON Body:');
console.log(payload);
console.log('========================================================\n');
