# Direkt binär filöverföring via MCP-verktyg

För EPUB/PDF/ZIP på högst **5 MiB (5 242 880 byte)** kan ChatGPT försöka hämta filen direkt via ett MCP-verktyg, utan att modellen behöver anropa serverns HTTPS-domän.

## Flöde

1. Anropa ett befintligt `fetch_repository_archive`, `fetch_release_asset` eller `fetch_workflow_artifact`. Resultatet ger `resourceUri` för filer inom gränsen.
2. Anropa nya `read_small_file({resourceUri})` **omedelbart**. Verktyget returnerar `content` av typen `resource` med `blob` (base64) och korrekt MIME-typ.
3. Observera hur ChatGPT-klienten hanterar binärt innehåll. Detta är inte garanterat att bli en native ChatGPT-filbilaga.
4. För större filer: använd `githubUrl` från listningsverktygen eller `get_repository_archive_link`, ladda ned i GitHub-webbläsaren och bifoga manuellt i konversationen.

MCP-resurser och verktygsöverföring är bundna till GitHub-identiteten bakom OAuth-sessionen och upphör efter två minuter. En engångsnedladdningslänk finns kvar för externa integrationer.

**Gränsen 5 MiB är en första skyddsnivå**, inte någon av OpenAI publicerad kapacitetsgräns. Base64 ökar storleken med omkring 33 procent. Om klienten tar emot det bra kan 10 MiB övervägas efter ett verkligt acceptanstest. Större MCP-verktygssvar kan påverka prestanda och kontextbudget. Skicka inte stora base64-strängar som vanlig text.

## Acceptans

- Kontrollera att `get_capabilities` rapporterar `smallBinaryTool` och `maxToolBytes: 5242880`.
- Hämta litet PDF/EPUB/ZIP via `fetch_*` och sedan `read_small_file`.
- Kontrollera MIME, avkodad storlek och SHA-256 om ChatGPT-klienten lämnar åtkomst till binärt MCP-innehåll.
- Kontrollera att felaktig URI, annan identitet och utgångna resurser nekas.
- Kontrollera att >5 MiB inte annonserar `resourceUri`, och att GitHub-länk för manuell nedladdning fortfarande fungerar.
