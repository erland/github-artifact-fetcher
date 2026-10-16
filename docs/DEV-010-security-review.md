# DEV-010 – Riktad säkerhetsgranskning (utan driftsättning)

## Genomförd granskning
- Tillfällig filtransport har nu även ett aggregerat minnestak på 64 MiB. Tidigare gräns om 16 filer och 20 MiB per fil kunde tillåta betydligt större resident minne. Tidsutgång och förbrukade länkar frigör bytebudget.
- Publik origin för temporära fil-URL:er måste använda HTTPS och får inte innehålla inloggningsuppgifter, fragment eller query.
- Negativa tester verifierar bytebudget och URL-policy.

## Kritiska öppna fynd – inte produktionsgodkänt
1. OAuth-samtyckets double-submit-cookie är inte kryptografiskt bunden till den ursprungliga auktoriseringsbegäran, klienten eller användarsessionen och är inte server-side single-use. Detta behöver bindas till en kortlivad serverlagrad begäran med CSRF och replay-skydd.
2. Dynamisk OAuth-klientregistrering tillåter godtyckliga HTTPS-redirects och behöver policy, kvoter och abuse-kontroller före publikt bruk.
3. GitHub App-installationers faktiska repositorybehörigheter och revokering samt OAuth-tokenåterkallelse och loggretention återstår.
4. Temporära nedladdningslänkar är bearer capabilities. Länkhämtning kontrollerar inte användaridentitet, filerna ligger i processminne och kan förbrukas av säkerhetsskannrar/förhandsvisning. Delad säker lagring och explicit leveranssemantik krävs om flera repliker ska köras.
5. ZIP-arkiv får inte packas upp utan fullständig struktur- och zip-bombvalidering. Nuvarande kontroll av ZIP-magic räcker inte som arkivacceptans.
6. ChatGPT-native filbilaga är **inte verifierad**. Ett externt HTTPS-URL eller MCP resource link uppfyller inte detta releasekrav.
7. En instanslokal IP-begränsare ersätter inte användar-/klientbaserade kvoter eller distribuerad rate limiting.

## Status
Detta är en kodgranskning och partiell förbättring inom DEV-010. DEV-010 förblir pågående och releasestatus blockerad tills ovanstående krav hanterats eller prövats i senare explicit godkänd miljö. Ingen driftsättning genomförd.
