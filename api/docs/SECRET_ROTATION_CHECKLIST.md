# Secret Rotation Checklist

Use this checklist before making the repository public.

## Status Legend
- [ ] not started
- [x] completed

## 1) MongoDB
- [ ] Rotate the MongoDB user password referenced by historical `MONGODB_URI` values.
- [ ] Verify old credentials can no longer connect.
- [ ] Update local/dev/test secret stores with the new value.

## 2) OpenAI
- [ ] Revoke all exposed OpenAI keys.
- [ ] Create new keys with least privilege.
- [ ] Update local/dev/test secret stores.

## 3) Nylas
- [ ] Revoke exposed Nylas API keys.
- [ ] Issue new Nylas credentials.
- [ ] Confirm all OAuth/callback flows still work with new credentials.

## 4) AWS
- [ ] Disable and remove exposed IAM access keys.
- [ ] Create replacement keys for a least-privilege IAM user/role.
- [ ] Verify S3 read/write flows in development and test.

## 5) Stripe
- [ ] Rotate test/live API keys as appropriate.
- [ ] Rotate webhook signing secrets for all endpoints.
- [ ] Re-run webhook signature verification tests.

## 6) Ngrok
- [ ] Revoke the exposed ngrok authtoken.
- [ ] Create a replacement token.
- [ ] Store the replacement token in non-committed env files only.

## 7) Aircall
- [ ] Revoke exposed Aircall API credentials.
- [ ] Create replacement sandbox/test credentials.

## 8) App Secrets
- [ ] Rotate `JWT_SECRET`.
- [ ] Rotate `SESSION_SECRET`.
- [ ] Rotate `ENCRYPTION_KEY`.
- [ ] Rotate any custom webhook secrets.

## 9) Validation
- [ ] Run end-to-end test flows against rotated test/sandbox credentials.
- [ ] Confirm old keys are no longer accepted.
- [ ] Confirm no secrets remain in tracked files.

## 10) Final Pre-Publish Gate
- [ ] Complete git history rewrite to purge sensitive files.
- [ ] Force-push rewritten history.
- [ ] Ask collaborators to re-clone.
