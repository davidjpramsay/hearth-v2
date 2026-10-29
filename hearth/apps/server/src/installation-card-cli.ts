import { createInstallationCard } from './installation-card.js';

try {
  await createInstallationCard(
    process.env.HEARTH_AUTH_ORIGIN ?? '',
    '/run/hearth-secrets/first-use-code',
    '/data/first-phone.png',
  );
  console.log('Private first-phone card created. Keep it private; it is for first setup only.');
} catch {
  console.error(
    'Could not create the private setup card. Check the protected input, HTTPS origin and unused output. No proof is shown.',
  );
  process.exitCode = 1;
}
