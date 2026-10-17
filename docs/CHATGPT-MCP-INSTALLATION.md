# Installera GitHub Artifact Fetcher som MCP-anslutning i ChatGPT

Denna guide gäller en driftsatt GitHub Artifact Fetcher på `https://github-artifact-fetcher.apphome.one`. Byt ut adressen om den verkliga domänen är en annan. Gränssnittets exakta menynamn kan variera mellan ChatGPT-versioner och konton.

## 1. Förutsättningar

- Servern är tillgänglig via giltig HTTPS. Ett Traefik/Coolify *default certificate* duger inte.
- `GET /health` svarar med HTTP 200 och `GET /ready` med HTTP 200 (PostgreSQL och Flyway är klara).
- `GET /.well-known/oauth-authorization-server` ger JSON med bland annat `authorization_endpoint`, `token_endpoint` och `registration_endpoint`.
- `GET /.well-known/oauth-protected-resource/mcp` ger JSON med `resource` som slutar på `/mcp`.
- En GitHub App är skapad med callback `https://github-artifact-fetcher.apphome.one/auth/github/callback`, en giltig klienthemlighet och installation på de repositories som ska få läsas.
- Coolify innehåller `PUBLIC_BASE_URL=https://github-artifact-fetcher.apphome.one`, `OAUTH_ALLOWED_REDIRECT_HOSTS=chatgpt.com`, GitHub App-variablerna samt PostgreSQL-variablerna. `OAUTH_ALLOWED_REDIRECT_HOSTS` innehåller bara värdnamn, utan schema eller sökväg.

## 2. Lägg till MCP-servern i ChatGPT

Öppna ChatGPT:s inställningar för anslutningar/plugins (beroende på tillgängligt gränssnitt) och välj att skapa en egen MCP-anslutning. Ange:

| Fält | Värde |
| --- | --- |
| Namn | **GitHub Artifact Fetcher** |
| Beskrivning | Se texten nedan |
| MCP-server URL | `https://github-artifact-fetcher.apphome.one/mcp` |
| Autentisering | **OAuth** |
| OAuth Client ID / Client Secret i ChatGPT | Lämna tomma om ChatGPT erbjuder automatisk/dynamisk klientregistrering. Dessa är **inte** GitHub Appens Client ID/Secret. |
| Behörigheter/åtkomst | Begränsa till de användare som ska använda anslutningen, om ChatGPT erbjuder valet. |

**Rekommenderad beskrivning att klistra in:**

> Hämtar filer från GitHub-repositories som du har behörighet till, inklusive privata repositories. Stöder releasefiler som ZIP, PDF och EPUB, GitHub Actions-artefakter samt repositoryarkiv från grenar, taggar och commits. Använder säker GitHub-inloggning och levererar filer via tidsbegränsade nedladdningslänkar.

Beskrivningen påstår **inte** att servern kan lägga till filer som native ChatGPT-bilagor. Nuvarande överlämning sker via engångslänkar.

## 3. Anslut med OAuth

1. Starta anslutningen i ChatGPT.
2. ChatGPT läser serverns OAuth-metadata och registrerar en klient dynamiskt.
3. Webbläsaren öppnar serverns `/authorize`. Om en GitHub-session saknas ska den efter PR #5:s uppdatering automatiskt gå via GitHub-inloggning och sedan återvända till samtyckessidan.
4. Kontrollera att samtyckessidan visar **Authorize GitHub Artifact Fetcher** och att återgångsadressen hör till ChatGPT. Klicka **Approve en gång**.
5. Webbläsaren ska återvända till ChatGPT, som slutför kodutbytet med PKCE. Kontrollera att anslutningen markeras som ansluten.
6. Prova att anropa `get_capabilities` och lista releasefiler i ett repository där både ditt GitHub-konto och den installerade GitHub Appen har läsåtkomst.

Varje samtyckesbegäran gäller en kort tid och är avsedd att användas exakt en gång. Vid fel: starta ett nytt anslutningsförsök, inte upprepade klick på samma Approve-sida.

## 4. Manuell OAuth-konfiguration vid behov

Använd endast om ChatGPT erbjuder relevanta manuella OAuth-fält och automatisk discovery inte fungerar:

| Fält | Adress |
| --- | --- |
| Authorization endpoint | `https://github-artifact-fetcher.apphome.one/authorize` |
| Token endpoint | `https://github-artifact-fetcher.apphome.one/token` |
| Dynamic registration endpoint | `https://github-artifact-fetcher.apphome.one/register` |
| Scope | `mcp` |
| Protected resource | `https://github-artifact-fetcher.apphome.one/mcp` |

Github Appens OAuth-uppgifter lagras endast i **Coolify**, inte som MCP-klienthemligheter i ChatGPT. En dynamiskt registrerad MCP-klient har ett eget klient-ID.

## 5. Felsökning

| Symptom | Kontroll och åtgärd |
| --- | --- |
| ”Det gick inte att hitta OAuth-inställningarna” | Kontrollera publik HTTPS, certifikat, DNS och JSON på båda `/.well-known/`-adresserna. Kontrollera att MCP-URL slutar på `/mcp`. |
| Traefik default certificate | Kontrollera Coolify-domänkoppling för `app:3000`, router och ACME/loggar. Ändra inte andra tjänsters certifikatlager. |
| `login_required` | Äldre versioner kräver separat GitHub-inloggning i samma webbläsarkontext. Efter PR #5 ska tjänsten automatiskt starta GitHub-inloggning. |
| Approve ger `invalid_consent` | Begäran är kortlivad och engångsbaserad. Starta om anslutningen med nytt OAuth state. Kontrollera att webbläsaren accepterar cookies, samt loggkategori `oauth.consent.failed` om fel kvarstår. Logga aldrig OAuth-kod, cookie eller token. |
| ChatGPT återkommer men anslutningen misslyckas | Kontrollera token-endpoint, exakta redirect URI, PKCE och tidsinställningar; samla enbart sanerade HTTP-statuskoder och request-id. |
| `/ready` returnerar 503 | Kontrollera PostgreSQL-anslutning, rättigheter och att Flyway faktiskt migrerat schemat. |
| GitHub-repository nekas | Kontrollera både inloggat GitHub-konto och GitHub Appens installation/Contents-läsbehörighet på just repositoryt. |
| Fil hämtas men syns inte som ChatGPT-bilaga | Förväntat: verifierad leverans är en tidsbegränsad engångs-HTTPS-länk, inte native ChatGPT-bilaga. |

## 6. Acceptanskriterier

- OAuth-discovery via publik HTTPS fungerar.
- Ny användare kommer via GitHub-inloggning till samtyckessidan.
- **Approve en gång** leder till ChatGPT och lyckat tokenutbyte; förbrukad begäran kan inte återanvändas.
- `get_capabilities` fungerar efter anslutning.
- Behörig användare kan lista/hämta en tillåten releasefil; obehörig användare nekas.
- En extern live-anslutning måste verifieras efter nästa release; automatiska tester är inte bevis på att ChatGPT:s riktiga inloggningsflöde fungerar.
