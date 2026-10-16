# Docker-release till GHCR

## Syfte
En publicerad GitHub-release bygger och publicerar ett verifierat Docker-manifest för `linux/amd64` och `linux/arm64` i `ghcr.io/erland/github-artifact-fetcher`. Ingen Coolify-driftsättning görs av workflowen.

## Automatisk release
Publicera en GitHub Release för en giltig tagg `vMAJOR.MINOR.PATCH` (valfritt suffix för förhandsversion). `release.yml` validerar att releasen verkligen finns och är publicerad, använder committen bakom taggen och kör Node-bygg, PostgreSQL/Flyway och alla regressionstester innan publicering.

## Publicerade etiketter
För `v0.5.0` skapas:
- `ghcr.io/erland/github-artifact-fetcher:0.5.0`
- `ghcr.io/erland/github-artifact-fetcher:v0.5.0`
- `ghcr.io/erland/github-artifact-fetcher:sha-<12 tecken av commit-SHA>`

`latest` skapas endast när GitHub-releasen är markerad som **inte prerelease**. Eftersom `v0.5.0` för närvarande är en prerelease uppdaterar en manuell publicering **inte** `latest`.

## Återpublicera befintlig v0.5.0
Efter att denna PR är mergad till `main`: öppna **Actions → Publish Docker image → Run workflow**, välj `main` som workflowgren och ange `v0.5.0` i fältet `tag`. Workflowen slår upp den befintliga publicerade releasen och bygger från **taggens originalcommit**, oavsett vad som senare lagts till på `main`. Manuell körning skapar inte en ny GitHub-release och kräver inte en ny tagg.

Verifiera därefter i **GitHub Packages** att båda plattformarna finns på samma manifest, att rätt `org.opencontainers.image.revision` anges och att Coolify kan hämta imagen. GHCR-paket kan behöva kopplas till repositoryt eller få korrekta behörigheter via GitHub Package Settings; automatisk `GITHUB_TOKEN` med `packages:write` används och inga personliga åtkomsttoken behövs.

## Säkerhet / begränsningar
- Publicering kräver både full testsuite och verifierat Dockerbygge. Behörighet `packages:write` ges endast till publish-jobbet.
- Workflowen bygger från taggens commit, men retaggning/överskrivning av redan publicerade versionsetiketter är fortfarande tekniskt möjligt. Skydda release-taggar, och undvik att köra samma version på nytt om byte-identitet måste bevaras.
- `workflow_dispatch` finns tillgänglig i GitHub Actions efter merge till default-grenen. En gammal release triggar inte retroaktivt `release.published`.
- `sha-...` och versionstaggar är namn, inte kryptografiskt låsta referenser. För produktionsdistribution rekommenderas pinning av verifierad image digest (`@sha256:...`).
- Multiarch-plattformarna byggs under GitHub Actions med QEMU + Buildx. Verklig publicering till GHCR och plattformsmanifest kontrolleras först efter manuell/automatisk körning; denna PR gör **ingen publicering**.

## Checklista för acceptans
1. YAML syntaktiskt korrekt och CI grönt på PR-grenen.
2. Manuell `v0.5.0`-körning efter merge får rätt commit via release-taggen.
3. Flyway + tester + Docker verification passerar på denna commit.
4. `amd64` och `arm64` återfinns i publicerat GHCR-manifest.
5. `0.5.0`, `v0.5.0`, `sha-...` pekar till samma manifest.
6. Ingen `latest` publiceras eftersom `v0.5.0` är prerelease.
7. Coolify-driftsättning sker separat efter godkännande.
