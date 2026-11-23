# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, meter numbers (PRM), passwords and
  addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Sensitive data handled

- The **Conso API token** is stored by Gladys as a `secret` configuration
  field (never sent back to the browser). The integration only sends it to
  `conso.boris.sh`, never logs it, and never echoes an API response body.
- The **Linky meter number (PRM)** and the energy readings are personal
  data: they only leave the home to query the Conso API, when the cloud
  source is configured.
- The **Shelly address** is normalized to a host name or IP address with an
  optional port: the integration never requests an arbitrary URL. The local
  Shelly API is queried in plain HTTP on the LAN.
- The virtual battery ledger is stored in `/data/virtual-battery.json`
  inside the integration's volume.

## Scope

In scope: the code of this repository and the Docker image it publishes.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and the third-party services and devices the integration talks to (Urban
Solar, Enedis, the Conso API, Shelly devices).
