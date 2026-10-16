# DEV-010 – ZIP structural verification and zip-bomb guard

## Implementation
- Shared `validateZip` used for GitHub Actions ZIP, repository archives ZIP, and Release assets classified as ZIP by filename or MIME.
- Requires EOCD and a consistent central directory, valid local headers, supported stored/deflate methods, matching names, non-overlapping local entry ranges, CRC32 over decompressed bytes and exact uncompressed size.
- Rejects traversal/absolute/Windows paths, repeated entry names, encryption, data descriptors, multidisk, ZIP64 sentinels, unsafe Unix entry types, unsupported compression and damaged/truncated archives.
- Limits compressed download to the existing 20 MiB transport quota and decompression to 32 MiB per entry / 100 MiB total, 2,000 entries and a maximum 100:1 ratio for entries above 1 KiB. Each entry is decompressed with a bounded `maxOutputLength`.
- No archive extraction to disk and no file-system writes.
- Negative direct regression tests cover corrupt central directory, CRC mismatch, changed local filenames, traversal paths, high compression ratio, truncation and encryption. Source integration tests verify rejection from Actions Artifacts, Releases and repository archives.

## Compatibility / limitations
- ZIP64, multi-disk, data descriptors, unusual compression methods and symlink entries fail closed; these may appear in legitimate GitHub-generated or third-party archives. End-to-end acceptance with actual GitHub artifacts is required before production.
- This is strict ZIP structural validation of supported archive variants, not universal ZIP format compatibility. Resource caps intentionally reject some otherwise valid large archives.
- Implementation does not unzip contents onto disk. Live ChatGPT-native file handoff is still unverified.
- No deployment performed.
