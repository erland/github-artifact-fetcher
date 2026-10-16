# Risk och genomförbarhet

1. **Hög:** MCP-filreferens från egen server kanske inte kan fästas vid samtalet. DEV-001 måste prova riktig ChatGPT-handoff innan vidare investering.
2. **Hög:** OAuth-integration till ChatGPT + GitHub App kräver två separata auktoriseringsmodeller. Verifiera discovery, redirect, PKCE, refresh/revocation och separation.
3. **Medel:** GitHub Packages skiljer mellan REST metadata och registry protocol; rättigheter för privata paket varierar.
4. **Medel:** Actions-artifacts löper ut; acceptanstest måste använda färsk artifact.
5. **Medel:** Startmigrering kräver korrekt versionshantering, driftbackup och låsning vid samtidiga starter.
6. **Medel:** GitHub-redirects och komprimerade filer kan missbrukas; strikta mål/size/zip limits.

Ej fastställda hemligheter, produktionsdomän eller GitHub App-ID ska tillföras via driftkonfiguration, inte hårdkodas.
