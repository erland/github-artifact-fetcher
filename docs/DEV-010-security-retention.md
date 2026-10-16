# DEV-010 – Retention och säkerhetsdatagallring (utan driftsättning)

## Implementerat
- Flyway V7 skapar index för gallring av webhookleveranser, OAuth-sessioner, GitHub-inloggningsförsök och OAuth-samtycken.
- `SecurityRetention.prune(batch)` tar bort endast utgångna OAuth-grants, sessioner, GitHub OAuth-försök och samtycken samt webhook-leverans-ID som är äldre än 30 dagar.
- Varje tabell bearbetas i en avgränsad batch om högst 1000 rader, som standard 500; frågorna är parametriserade och transaktionella.
- Körbar entrépunkt `node dist/prune-security-data.js` efter `npm run build`. Kräver `DATABASE_URL`; valfri `RETENTION_BATCH` mellan 1 och 1000. Inget schemaläggs eller startas automatiskt i webbservern.
- Jobbet använder befintlig begränsad runtime-roll och kan köras separat under senare kontrollerad schemaläggning.
- Regressionstest med PostgreSQL verifierar gammal webhookpost och utgånget grant tas bort medan aktiva poster finns kvar; upprepad körning är idempotent och otillåtna batchvärden avvisas.

## Verifiering
Implementationscommit `17078be4ecc1e9aa27c0fba74b1340e57229e504`.
GitHub Actions `38900383039`: SUCCESS. Flyway migrate/validate, runtime DDL denial, TypeScript och alla tester samt Dockerbygge passerade.

## Driftsrestriktioner och återstående risker
- Underhållsjobbet har ingen aktiv schemaläggning. Vid senare driftsättning bör det köras en gång per dygn med övervakad exitstatus och endast en aktiv körning per instans.
- Vid mycket stora tabeller krävs flera batchkörningar. Batcher raderas per tabell; SQL-frågor använder inte separat applikationsdistribuerat lås och kan överlappa med annan jobbkörning.
- 30 dagars retention för webhookleverans-ID innebär att mycket sent återspelade äldre leveranser inte längre identifieras av detta register; kontrollera GitHub-händelsernas samtidighet och operativ policy.
- Kvarstående releasekrav omfattar verklig GitHub/ChatGPT-filacceptans, distribuerad kvotstyrning och arkivvalidering. Ingen driftsättning har gjorts.
