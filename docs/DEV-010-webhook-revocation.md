# DEV-010 – GitHub App-webhooks och nekad tokenförnyelse

## Implementerat
- Webhookendpoint `POST /webhooks/github` med HMAC-SHA256 över råa bytes enligt GitHubs `X-Hub-Signature-256`. Ogiltig signatur avvisas, payload begränsas till 64 KiB.
- Flyway V6 lagrar leverans-ID för replay-skydd och installerade GitHub App-installationers associerade användaridentiteter.
- Vid `installation.deleted`, `installation.suspend` och `installation_repositories.removed` återkallas konservativt alla lokala anslutningar som är kopplade till installationen. Det kan kräva ny autentisering även för andra repositories på samma installation.
- HTTP 400/401/403 vid GitHub refresh-tokenförnyelse behandlas som permanent nekande och rensar berörd användares GitHub-koppling, sessioner, OAuth-grants och väntande samtycken. Tillfälliga fel gör inte det.
- Negativa tester täcker ogiltig signatur, användarisolering och permanent nekad tokenförnyelse.

## Verifiering
Implementation `3af1aa0253e200f0ced12f6c07b41e987b7c38a8`.
GitHub Actions `38890957170`: samtliga tester, Flyway V6 och Docker PASS.

## Återstår
- Verkliga GitHub App-webhookleveranser, konfigurations-/sekretrotation och liveinstallation/avinstallation har inte acceptanstestats.
- Installationens rättighetsförändringar hanteras konservativt, inte genom repository-fingranulär återkallelse.
- Leveransregistret kräver retention/gallring. Full konfigurationssäkerhet, distribuerad resursbegränsning och ChatGPT-native file handoff kvarstår.
- Ingen driftsättning utförd.
