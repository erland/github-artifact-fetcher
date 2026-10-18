# Diagnostik för experimentell bibliotekuppladdning

MCP App-gränssnittet läser PDF/EPUB via en kortlivad HTTPS-engångslänk. Om klienten visar `Load failed` kan det bero på nätverk, webbsandboxens CSP, CORS eller en utgången engångslänk.

## Testinställningar

- `WIDGET_DOWNLOAD_CORS_ANY_ORIGIN=true`: **endast för kortvarig felsökning**. Returnerar `Access-Control-Allow-Origin: *` på `/downloads/*`. Standard är strikt tillåtet sandboxursprung. Ingen `Access-Control-Allow-Credentials` sätts. Inställningen påverkar inte andra endpoints.
- `WIDGET_DOWNLOAD_TTL_SECONDS=600`: gör engångslänkar giltiga i 10 minuter under test. Tillåtna värden 120–900, standard 120.

**Risk:** Nedladdningsadressen är en bearer-capability. Den som känner till hela URL:en kan hämta filen en gång oavsett ursprung. Wildcard-CORS gör att kod på andra webbplatser som fått URL:en också kan läsa filen; dela därför aldrig URL:en, aktivera bara tillfälligt och återställ till standard efter test.

Loggarna anger request-id samt `widget_download` och någon av `preflight_allowed`, `served`, `not_found_or_expired`. De loggar inte fil-ID, hela URL:en, token eller filinnehåll. Gränssnittet visar nu felsteg (nedladdning, mottagning, uppladdning) samt upptäcker utgången länk innan nätverksanrop. Om inget `widget_download` syns i serverloggen kan CSP, DNS eller nätverket ha blockerat anropet innan servern nåddes.

**Acceptans:** Testa först en PDF; kontrollera att knappen ger fil-ID och att filen syns i ChatGPT Library. Kontrollera samma väg för EPUB. Återställ sedan miljövariablerna och retesta med strikt CORS.
