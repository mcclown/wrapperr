# Exposing Wrapperr to the internet

Wrapperr can be published through a reverse proxy or a tunnel (Cloudflare Tunnel, for example) so people can open
their wrapped from anywhere. Everything Wrapperr serves on its port is then reachable, the admin pages included,
unless you limit them. These settings are found on the admin Settings page, or set as flags or environment variables
(see the README).

## Settings

- **Plex Auth on** (`plex_auth`). Without it, anyone can type a Plex username or e-mail address and see that user's
  wrapped. Wrapperr logs a warning at startup when it is off.
- **Trusted proxies** (`trusted_proxies`). The address your proxy connects to Wrapperr from: for a Cloudflare tunnel,
  the address `cloudflared` connects from (its container's address, or the Docker network's gateway, or `127.0.0.1`
  when it runs on the same host). Wrapperr then takes the visitor's address from `CF-Connecting-IP`
  (or `X-Forwarded-For` / `X-Real-IP`), but only from those addresses, so nobody can fake their address by sending
  the header themselves. With no trusted proxies, Wrapperr trusts no header and sees every visitor through the
  tunnel as the proxy's own address. Takes effect after a restart.
- **Admin networks** (`admin_networks`), for example `192.168.1.0/24`. The admin pages, the admin login and every admin
  API then answer 404 to anyone outside those networks, so from the internet the admin side does not exist. A request
  that carries a proxy header but didn't come through a trusted proxy is always refused, so a tunnel can't pass for
  the local network before its proxy is listed. Saving a list that doesn't include your own address is refused, so
  you can't lock yourself out from the Settings page; if you do (through config.json or a flag), clear
  `admin_networks` in `config.json` and restart.
- **Admin MFA.** Turn it on from the admin page as a second line of defence for the admin login.

## What Wrapperr does for you

- Security headers on every response: a Content Security Policy, `X-Frame-Options: DENY` (and `frame-ancestors
  'none'`), `X-Content-Type-Options: nosniff` and `Referrer-Policy: same-origin`.
- Per-address rate limits: admin login and admin creation 10 per 15 minutes; Plex sign-in 20, statistics 20,
  share-link lookups 30 and share-link creation 10 per minute; poster downloads 300 per minute. Over the limit,
  Wrapperr answers 429 with `Retry-After`.
- Request bodies are limited to 1 MB, and slow clients time out (10 s for headers, 30 s for the body).

## Checking it

From outside your network (a phone off Wi-Fi, say):

- `https://<your address>/admin` should be a 404 page once `admin_networks` is set.
- The log shows the visitor's real address on requests (for example "Rate limit hit … Origin: 198.51.100.7"), not the
  proxy's. If it shows the proxy's address, `trusted_proxies` is missing or wrong.
