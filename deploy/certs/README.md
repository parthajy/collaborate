# Origin certificate

Nginx (see `../nginx.conf`) expects a Cloudflare **Origin Certificate** here:

```
deploy/certs/origin.pem   # certificate
deploy/certs/origin.key   # private key
```

## Getting one

1. Cloudflare dashboard → your domain → **SSL/TLS → Origin Server →
   Create Certificate**.
2. Leave the default (RSA, 15-year). Cloudflare shows the certificate and the
   private key **once**.
3. Save them as `origin.pem` and `origin.key` in this folder.
4. Set the Cloudflare SSL/TLS mode to **Full (strict)**.

These files are git-ignored — they never get committed. Place them on the
droplet manually (e.g. `scp`) as part of first-time setup.
