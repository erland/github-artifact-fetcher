# DEV-010 – Coolify testinstallation och acceptans (ingen driftsättning utförd)

## Avgränsning
Enbart förberedelse i PR #1. En enda appinstans i testmiljö rekommenderas: rate limiting och engångsfiler ligger i processminne. Konfigurationen får inte betraktas som produktionsgodkänd innan stegvis extern acceptans är genomförd.

## 1. PostgreSQL och separata roller
Använd en **separat testdatabas**, gärna på befintlig PostgreSQL-server, utan ny databascontainer i Compose.

Skapa i PostgreSQL, som administratör (byt lösenord via säker hemlighetshantering):
```sql
CREATE ROLE github_artifact_fetcher_migrator LOGIN PASSWORD '<strong-secret>';
CREATE ROLE github_artifact_fetcher_app LOGIN PASSWORD '<different-strong-secret>';
CREATE DATABASE github_artifact_fetcher_test OWNER github_artifact_fetcher_migrator;
```
Anslut till testdatabasen med migrerings-/administratörsrollen och kör:
```sql
GRANT CONNECT ON DATABASE github_artifact_fetcher_test TO github_artifact_fetcher_app;
GRANT USAGE ON SCHEMA public TO github_artifact_fetcher_app;
```
Flyway kör V1–V7 med migreringsrollen, och migrationerna ger uttryckliga DML/SELECT-rättigheter till runtime-rollen. Runtime får **inte** skapa tabeller eller utföra schemaändringar. Bekräfta i acceptanstest att både `SELECT id FROM service_metadata WHERE id=1` lyckas och `CREATE TABLE ...` nekas för runtime.

## 2. Coolify-konfiguration
- Välj Docker Compose från den avsedda PR-grenen, med `compose.coolify.yml`; **merga inte PR:n**.
- Exponera endast appens port 3000 via Coolifys TLS-terminerande proxy. Publicera **inte** port 3000 direkt.
- Föreslaget testnamn: `github-artifact-fetcher.apphome.one` (kräver uttryckligt DNS/TLS-beslut); sätt `PUBLIC_BASE_URL` till den **faktiska** externa HTTPS-originen, utan path/query.
- Compose-tjänsten `migrate` måste slutföras framgångsrikt innan `app` startas. Flyway-migreringarna ligger under `./db/migration` som read-only volume, och bygg-/deploy-källan måste därför innehålla dem. Kontrollera denna bind mount i Coolifys faktiska Git-checkout; vissa distributionssätt stöder inte relativa repo-volymer.
- App kör som icke-root i en read-only container, med tmpfs /tmp, alla Linux capabilities borttagna, pids_limit 128 och 512 MiB minnesgräns.
- Appens `/health` är en **liveness**-kontroll; `/ready` verifierar PostgreSQL, returnerar HTTP 200 först efter migreringar och används av Docker healthcheck. `/ready` returnerar 503 om DB saknas/är otillgänglig.

## 3. Miljövariabler (lägg i Coolifys sekretlagring, inte Git)
| Variabel | Användning |
|---|---|
| `FLYWAY_JDBC_URL` | jdbc:postgresql://HOST:5432/github_artifact_fetcher_test |
| `DATABASE_MIGRATION_USER` / `DATABASE_MIGRATION_PASSWORD` | Migreringskonto |
| `DATABASE_URL` | postgres://github_artifact_fetcher_app:URL_ENCODED_PASSWORD@HOST:5432/github_artifact_fetcher_test |
| `PUBLIC_BASE_URL` | Faktisk publik HTTPS-origin |
| `GITHUB_APP_CLIENT_ID` / `GITHUB_APP_CLIENT_SECRET` | Test-GitHub App |
| `GITHUB_WEBHOOK_SECRET` | Hemlig nyckel för `/webhooks/github` |
| `ENCRYPTION_KEY` | Base64-kodade 32 kryptografiskt slumpade bytes |
| `OAUTH_ALLOWED_REDIRECT_HOSTS` | Exakta godkända OAuth-callbackvärdnamn, utan wildcard |
| `PORT` | 3000, internt |

Testa DNS, TLS, GitHub App callback `https://HOST/auth/github/callback`, webhook `https://HOST/webhooks/github` och MCP `https://HOST/mcp` separat.

## 4. Verifiering före driftsättning (CI)
- `npm ci && npm run verify`, PostgreSQL 17, Flyway migrate+validate+repeat, runtime DDL-denial.
- `docker compose -f compose.coolify.yml config -q` med **enbart dummyvärden** för miljövariabler; detta verifierar Compose-syntax, **inte** Coolifys verkliga bind mounts, proxy eller secrets.
- `docker build` passerar.
- Inga live-API-anrop eller verkliga tokens behövs i CI.

## 5. Stagingacceptans efter separat tillstånd
1. Skapa isolerad testdatabas och GitHub App; lägg in hemligheter i Coolify.
2. Driftsätt testinstans och verifiera `/health`=200 och `/ready`=200. Simulera DB-avbrott; `/ready` måste ge 503 och återhämta sig.
3. Testa OAuth-discovery, PKCE och samtycke med en **verklig ChatGPT-pluginanslutning**. Kontrollera utgång och återkallelse.
4. Testa användare A mot tillåtet privat testrepo och användare B mot nekad åtkomst; testa avinstallerad/suspenderad GitHub App och signerade webhooks.
5. Hämta ZIP/PDF/EPUB och Actions-artefakter från testrepo; jämför bytes och SHA-256, kontrollera nedladdningslänkens engångsegenskap och TTL.
6. Avgör separat om en fil faktiskt blir en **native ChatGPT-bilaga**. Ett MCP-svar med URL är inte tillräckligt.
7. Kontrollera loggar (inga tokens), minnesgränser, omstart, rollback och migreringsfel. Testa att endast en instans körs.
8. Schemalägg `node dist/prune-security-data.js` separat endast efter driftgodkännande. Dokumentera backup, återställning och eventuella miljöskillnader.

## Godkännandekriterier
- **Kod/CI:** gröna jobb på exakt implementations-SHA.
- **Coolify:** verifierat i kontrollerad testmiljö, inte bara `docker compose config`.
- **GitHub:** verkliga tillåtna och nekade åtkomstfall.
- **Filtransport:** giltiga bytes/MIME/checksumma/TTL.
- **Native ChatGPT:** riktig bilaga synlig i konversationen; annars fortsatt blockerare, även om länkleverans fungerar.

**Inget av dessa externa steg är markerat PASS i detta dokument.**
