# Utvecklingsplan – ett verifierat steg per körning

- DEV-001 **PoC filöverlämning**: skapa minsta MCP-tjänst med filreferens för en publik Actions-/Release-fil. Verifiera från faktisk ChatGPT-plugininstallation att filbytes kan öppnas. Blockerande teknikrisk; ingen auth/db krävs för denna PoC.
- DEV-002 **Projektskelett**: Node/TS, testverktyg, API-kontrakt, Docker och CI. Verifiera bygg/test/container.
- DEV-003 **Databasstart**: PostgreSQL-anslutning, Flyway-autokörning, lägre runtimeprivilegier, felväg/readiness och integrationstester mot PostgreSQL.
- DEV-004 **MCP OAuth**: discovery, auth code + PKCE, sessions-/tokenlivscykel och verifierade säkerhetstester.
- DEV-005 **GitHub App-koppling**: user authorization, refresh rotation, rättighetskontroller och kryptering.
- DEV-006 **Release-hämtning**: listning, binär nedladdning, checksumma och AC-001.
- DEV-007 **Actions-hämtning**: run/artifact-listning, ZIP och AC-002 med giltig körning.
- DEV-008 **Repositoryarkiv**: explicit ref, säkra redirects och AC-003.
- DEV-009 **Hårdning**: limits, SSRF, multiuser-isolation, obs/loggning, testfall.
- DEV-010 **Drift och release**: GHCR/Coolify, konfiguration, dokumentation och verklig installation/acceptans.
- DEV-011 **Packages 1.1**: metadata och GHCR OCI manifests/config/layers.
- DEV-012 **Packages 1.2**: npm/Maven/NuGet/RubyGems-adaptrar efter separat bedömning.

Alla DEV-steg: verifierad källrevision, relevanta tester PASS, uppdaterat statusdokument; annars ej klarmarkerat.

## Extern acceptans för DEV-001 (uppskjuten på användarens begäran 2026-10-16)
Det lokalt verifierade tekniksteget är klart. Kravet på faktisk utgående filöverlämning till ChatGPT är kvar som **releaseblockerande acceptanskrav under DEV-010**, eller tidigare när säker testdrift finns. DEV-002 får påbörjas utan driftsättning. Detta är ett medvetet avsteg från den ursprungliga ordningen, inte en verifierad extern PASS.
