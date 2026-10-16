# DEV-010 – Serverlagrat engångssamtycke för MCP OAuth

## Implementerat
- Flyway V5: `mcp_oauth_consent_requests` med hashad request-identifierare och CSRF-token, user subject, client-ID, redirect, PKCE challenge, state, scope, resource, TTL och consumed_at.
- GET /authorize verifierar klient och inloggad användare, skriver en kortlivad serverlagrad begäran och visar en minimal samtyckessida. Endast opak request-token samt CSRF skickas till klienten.
- POST /authorize accepterar enbart request, csrf, decision. Okända och upprepade parametrar avvisas.
- POST verifierar request-cookie, CSRF-hash och samma användarsubjekt som GET, samt TTL, under `SELECT ... FOR UPDATE`.
- Samtycke konsumeras atomärt och OAuth-kod skapas i **samma databastransaktion**. Återspelning, parallell förbrukning och förfallen begäran avvisas.
- Client-ID, redirect, PKCE, state, resource och scope hämtas exklusivt från serverlagrad begäran; inte från POST-data.
- Avslag skapar ingen kod och returnerar `access_denied` till den ursprungligen validerade redirect-adressen.

## Verifiering
Implementationsrevision `e8f53f87e8d0210c7eba1a8790e6f4ef62568168`, CI-run `38859915518`: SUCCESS.
- `npm ci`, TypeScript, samtliga tester inklusive negativa CSRF-, session swap-, manipulations- och replayfall: PASS.
- PostgreSQL 17, Flyway migrate/validate/repeat inkl. V5: PASS.
- Dockerbygge: PASS.

## Återstår inför release
- Det här steget har inte testats med en riktig GitHub App och ChatGPT OAuth-anslutning.
- Intern ChatGPT-filöverlämning är fortfarande ej verifierad; externa engångslänkar är inte likvärdiga.
- Extern säkerhets- och driftacceptans, GitHub-behörighet/revokering, klientregistreringspolicy, distribuerade kvoter, arkivsäkerhet och Coolify-start kvarstår.
- Ingen driftsättning har utförts.
