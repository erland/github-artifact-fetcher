# Manuell nedladdning via GitHub

GitHub Artifact Fetcher erbjuder webbläsarlänkar till GitHub, även för privata repositories där användaren är inloggad och har behörighet. Dessa länkar innehåller aldrig GitHub-token.

- `list_release_assets` inkluderar `githubUrl` till respektive fil under releases/download. Listning laddar inte ned filbytes.
- `list_workflow_artifacts` inkluderar `githubUrl` till workflow-körningens webbsida. Där väljer användaren aktuell artefakt. Artefaktnamn och utgångsstatus följer med listningen.
- `get_repository_archive_link` validerar repositorybehörighet och löser explicit branch/tag/commit till en fullständig commit SHA. Returnerar `githubUrl` till commit-pinnat ZIP-arkiv utan att hämta själva ZIP-filen. För annotated tags avkodas tagobjektet.

## Handhavande

1. Öppna `githubUrl` i din vanliga webbläsare. För privata repositories måste du vara inloggad på GitHub med ett konto som har läsbehörighet.
2. Hämta filen där. För Actions används körningssidan och dess sektion **Artifacts**.
3. Bifoga filen manuellt i ChatGPT om du vill att modellen ska bearbeta den.

GitHub-länkar ger inte ChatGPT:s separata exekveringsmiljö automatiserad åtkomst till privata filer. Det befintliga `fetch_*`-flödet med temporär HTTPS-länk och valfri liten MCP-resurs finns kvar för kompatibilitet samt maskin-till-maskin-överföring.

GitHub Actions-artefakter kan löpa ut och en repositorylänk blir otillgänglig om GitHub-kontot saknar behörighet. Arkivlänken använder en commit SHA för reproducerbarhet.

## Rekommenderat standardflöde för ChatGPT

**GitHub-länk och manuell bilaga är standard** för ZIP, PDF och EPUB, oavsett filstorlek. Assistenten ska i första hand använda `list_release_assets`, `list_workflow_artifacts` eller `get_repository_archive_link`, presentera en tydlig `githubUrl` och be användaren ladda ned filen i sin egen webbläsare och bifoga den i ChatGPT. Kör inte `fetch_*` enbart för att kunna visa nedladdningslänken.

För GitHub Actions går `githubUrl` till workflow-körningen, **inte direkt till ZIP-filen**. Be användaren öppna sektionen Artifacts och ladda ned rätt artefakt. Privata repositories kräver GitHub-inloggning i användarens webbläsare.

### Automatisk MCP-binäröverföring – endast undantag

`read_small_file` är kvar för bakåtkompatibilitet, men bör endast användas när användaren uttryckligen begär automatisk överföring av en fil på **högst 256 KiB**. Detta är en *rekommenderad konversationsgräns*, inte en ändring av den tekniska 5 MiB-gränsen som fortfarande gäller. För större filer ska assistenten i stället välja GitHub-länk och manuell bilaga, även om `resourceUri` finns.

Inbäddade binärdata skickas som base64 i MCP-resurssvar och kan belasta konversationens kontext. Skriv aldrig ut base64-innehåll eller kortlivade engångslänkar i chatten. `fetch_*` och HTTPS-handoff behålls för särskilda integrationer och kompatibilitet, men ska inte vara standard för vanlig ChatGPT-användning.
