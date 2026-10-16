# Målarkitektur

## Tjänst
En liten TypeScript/Node.js-tjänst med Streamable HTTP MCP, OAuth-authorization server för MCP-klienten, GitHub App user authorization och read-only GitHub-adaptrar. Filöverlämningsadapter ger en klientanvändbar filreferens. **Kritiskt integrationsrisk:** filreferensprotokoll i installerbar ChatGPT MCP måste bevisas med PoC innan full implementation; att kunna ladda ned bytes i servern räcker inte.

## Data och drift
- PostgreSQL: **separat databas** `github_artifact_fetcher` i redan existerande PostgreSQL-instans.
- Flyway körs automatiskt som blockerande migrationsfas vid containerstart. Om fel: exit nonzero och readiness false. Aldrig automatic clean.
- Runtime använder lågprivilegierad DB-roll; migreringen kan använda separat roll. Ingen DB-container i compose.
- Tabeller föreslås för MCP-klientregistrering där det krävs, auktoriseringskoder, sessioner, refresh tokens, GitHub-kopplingar och schemahistorik. Minimera lagrade användaruppgifter.
- Kryptera GitHub-refresh tokens och andra långlivade hemligheter med separat nyckel från miljö/secret manager. Rotera refresh tokens atomärt.
- Containerimage till GHCR via GitHub Actions; Coolify/Traefik och TLS; konfiguration via miljövariabler.

## Auth och säkerhet
- MCP-servern är OAuth-resurs och använder egen auktoriseringsserver eller kompatibel betrodd auktoriseringsserver; GitHub OAuth-token skickas inte vidare som om den vore en MCP-token.
- GitHub App user-to-server tokens med konfigurerad expiration + refresh, least-privilege för repo/action metadata & innehåll.
- GitHub Packages kan kräva särskild `read:packages`-autentisering; inför separat behörighetsmodell/adapter när det behovet blir aktuellt. Användarens GitHub-inloggning ger inte automatiskt åtkomst till alla paketformat.
- Validera URL mot strikt GitHub-mönster och använd välkända API endpoints, skydda mot SSRF och skadliga redirects.
- Begränsa total bytes, svarstid, antal redirects, kompressionsförhållande och filnamn; extrahera aldrig osäkra ZIP-paths.

## ADR
- ADR-001: Separat MCP-server från zip-github-service, eftersom den senare är ZIP→GitHub granskning/PR.
- ADR-002: Egen databas på befintlig PostgreSQL-instans, inga permanenta nedladdade filer.
- ADR-003: Flyway-migreringar automatiskt vid uppstart före server readiness.
- ADR-004: Packages representeras i gränssnittsdesign från början men GHCR implementeras först efter tre grundkällor.
- ADR-005: Minimal Node.js/TypeScript-container för MCP-API.
