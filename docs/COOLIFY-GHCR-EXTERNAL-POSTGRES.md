# Coolify: publicerad GHCR-image och befintlig PostgreSQL

Coolify-filen `compose.coolify.yml` **bygger inte** appen lokalt. Den hämtar `ghcr.io/erland/github-artifact-fetcher:${GHAF_IMAGE_TAG}` med `pull_policy: always`. Starta endast när versionsetiketten faktiskt publicerats i GHCR. V0.5.0 är en prerelease och publiceringen av paketet måste verifieras i GitHub Packages.

## Inställningar i Coolify
1. Skapa en Docker Compose-resurs från Git-repositoryt så att `compose.coolify.yml` och `db/migration/V*.sql` finns i checkout. Ange Compose-fil `compose.coolify.yml`. OBS: Flyway använder en relativ read-only bind mount från checkout; det går inte att köra denna Compose-fil helt utan Git-källfiler ännu.
2. Lägg till `GHAF_IMAGE_TAG=0.5.0` eller en annan publicerad version. Kontrollera att migrationsfilerna i vald Git-checkout motsvarar de migreringar som appversionen förväntar sig. Välj gärna en låst Git-commit. Förhindrar du inte versionsdrift kan Flyway annars applicera migreringar för nyare appkod.
3. Använd **redan existerande** PostgreSQL-host. Skapa endast en separat databas, exempelvis `github_artifact_fetcher_test`, samt två separata roller för Flyway och runtime (se `docs/DEV-010-coolify-test-installation.md`). Compose skapar ingen PostgreSQL-container.
4. Ställ in `FLYWAY_JDBC_URL`, `DATABASE_MIGRATION_USER`, `DATABASE_MIGRATION_PASSWORD` (Flyway) och `DATABASE_URL` (app) till samma databas via skilda konton. JDBC URL har formatet `jdbc:postgresql://HOST:5432/DB`; runtime använder `postgres://USER:PASSWORD@HOST:5432/DB`. Eventuella specialtecken i runtime-lösenord måste URL-kodas.
5. Ange också `PUBLIC_BASE_URL`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_WEBHOOK_SECRET`, `ENCRYPTION_KEY` (32 slumpmässiga bytes, base64) och `OAUTH_ALLOWED_REDIRECT_HOSTS`. Lagra hemligheter i Coolify, inte i Git.
6. Om GHCR-paketet är privat behöver Coolify registry-inloggning med rätt att hämta paketet; publika images kräver normalt inte det. Kontrollera behörigheter i GitHub Packages.
7. Exponera bara `app:3000` via Coolifys HTTPS-proxy och verifiera `GET /health` och `GET /ready` (DB-beroende). Migrationscontainern ska slutföra med exit 0 före appstart. Den har ingen publik port.

## Säkerhetsgränser
Denna Compose-fil använder två images: versionerad **applikationsimage från GHCR** och `flyway/flyway:11.18` som separat initieringstjänst. Flyway-SQL ligger fortfarande i Git-källträdet. En helt image-only installation kräver att SQL-migreringarna paketeras i en versionsmatchad migreringsimage eller i appimagen med ett separat migrationssteg, vilket är ett ytterligare releasearbete.

Automatisk deployment, releasepublicering, GitHub App-integration och externa tester ingår **inte** i denna ändring. CI validerar Compose-syntaxen och säkerställer att appservice använder GHCR utan `build` och utan databascontainer, men provar inte att Coolify verkligen drar images eller når den befintliga databasen.
