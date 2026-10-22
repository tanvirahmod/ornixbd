# Order push notifications

The admin notification menu has an **Enable on this device** control. Push delivery requires applying the migration, configuring secrets, and deploying both Edge Functions.

## Configure Supabase

1. Apply `20261022030000_add_order_web_push.sql` with `supabase db push`.
2. Generate a VAPID key pair (for example, `npx web-push generate-vapid-keys`). Keep the private key secret.
3. Set the Edge Function secrets:

   ```powershell
   supabase secrets set VAPID_PUBLIC_KEY="<public-key>" VAPID_PRIVATE_KEY="<private-key>" VAPID_SUBJECT="mailto:<admin-email>" ORDER_PUSH_WEBHOOK_SECRET="<random-secret>"
   ```

   Generate the shared webhook secret locally with:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

4. Deploy the functions:

   ```powershell
   supabase functions deploy manage-push-subscription
   supabase functions deploy send-order-push --no-verify-jwt
   ```

5. In the Supabase SQL Editor, store the function URL and the same webhook secret in Vault. Replace the placeholders; do not commit the secret:

   ```sql
   select vault.create_secret(
     'https://<project-ref>.supabase.co/functions/v1/send-order-push',
     'order_push_function_url'
   );
   select vault.create_secret('<same-random-secret>', 'order_push_webhook_secret');
   ```

After setup, sign in to the admin panel on each phone and use **Notifications → Enable on this device**. Use **Send test** to verify delivery.

## Browser notes

- Android Chrome: allow notifications when prompted.
- iPhone: add the site to the Home Screen, launch the installed ORNIX app, sign in, then enable notifications. This is required by iOS Web Push; Chrome on iPhone has the same installed-web-app requirement.
- The site must use HTTPS. The current in-page alert remains available while an authenticated admin page is open.
- Push alerts are sent for every new order record, including manually recorded sales. Multiple product rows sharing an `order_code` produce one push alert.
