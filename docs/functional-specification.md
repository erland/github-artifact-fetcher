# Funktionsspecifikation – målbild

## Syfte och roller
MCP-klient (ChatGPT) anropar en fleranvändartjänst. GitHub används som resursägare och identitetsleverantör. Administratör konfigurerar GitHub App, databas och drift.

## Must – första produktversion
- FR-001 Läs GitHub Release-metadata, lista assets och hämta vald binär asset.
- FR-002 Lista Actions-artifacts från run och hämta artifact-ZIP på artifact-ID.
- FR-003 Hämta källkodsarkiv ZIP/tar.gz för repository och explicit branch/tag/commit.
- FR-004 Acceptera kanoniska GitHub-URL:er, validera ägare/repository/ID och avvisa godtyckliga URL:er.
- FR-005 Leverera bytes som faktisk användbar filreferens till ChatGPT; en URL eller base64-text är inte i sig godkänd leverans.
- FR-006 Stöd publika resurser samt privata resurser där GitHub-användaren har rättigheter.
- FR-007 Separera MCP-klientens OAuth från GitHub-användarens auktorisering; minimera läsbehörigheter.
- FR-008 Metadata för filstorlek, checksumma där tillgänglig, MIME-typ, källa och fel.
- FR-009 Hantera GitHub rate limits, utgångna Actions-artifacts, behörighetsfel och storleksgränser tydligt.
- FR-010 Automatisk versionsstyrd migrering av separat PostgreSQL-databas när tjänsten startar; MCP readiness först efter lyckad migrering.

## Should – efter grundfunktion
- FR-011 Lista GitHub Packages och paketversioner.
- FR-012 GHCR: inspektera OCI-manifest och konfiguration samt hämta utvalda lager.
- FR-013 npm/Maven/NuGet/RubyGems via respektive registerprotokoll, utan paketinstallation/exekvering.

## Icke-funktionella krav
- NFR-001 Read-only mot GitHub. Ingen PR, push, delete eller paketpublicering.
- NFR-002 Streamad hämtning med maxstorlek, timeout och kontrollerade redirect-domäner.
- NFR-003 Ingen permanent lagring av artefaktinnehåll; temporära filer raderas efter överlämning.
- NFR-004 Tokens krypteras i vila; loggar maskerar tokens och privata filnamn när relevant.
- NFR-005 Flera användare och separation av sessioner/tokenägarskap.
- NFR-006 En container i Coolify, befintlig PostgreSQL-instans men egen databas.
- NFR-007 Separata DB-roller för migrering respektive runtime när driftmiljön tillåter.
- NFR-008 Health/readiness, korrelations-ID och strukturerade loggar.

## Viktig acceptans
- AC-001 Release EPUB: https://github.com/erland/roman-det-vi-inte-visste/releases/download/v0.5.3/det-vi-inte-visste-v0.5.3.epub
- AC-002 Actions: https://github.com/erland/roman-det-vi-inte-visste/actions/runs/38775581257/artifacts/11993536684 (kan ha utgått; komplettera med färsk körning).
- AC-003 Repository: https://github.com/erland/roman-det-vi-inte-visste/archive/refs/heads/main.zip
För AC-001–003 krävs riktig filhämtning, ZIP/EPUB öppning och reproducerbart test från ChatGPT-klienten, inte endast API-200 eller returnerad URL.

## Utanför första version
Webbgränssnitt, generell GitHub-browser, dependency resolution, image-exekvering, permanent cache, filhistorik och GitHub-skrivoperationer.
