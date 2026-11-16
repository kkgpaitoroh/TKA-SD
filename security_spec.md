# Security Specification — CAT TKA SD

## 1. Data Invariants
1. **Admin Authority**: Only verified teachers (`sukronmakmun91@guru.sd.belajar.id`, `kkgpaitoroh@gmail.com`, or documents registered in `/admins/{userId}`) can create, edit, publish, or delete `examPackets` and `questions`, view all `liveSessions`, and edit admin profile details (`name`, `roleTitle`, `schoolName`, `nip`). Students cannot escalate privileges or modify `/admins`.
2. **Profile Isolation**: `/users/{userId}` stores only non-PII display attributes (`uid`, `displayName`, `className`, `schoolName`) and is readable/writable only by the owning authenticated user or an Admin.
3. **Published-Only Student Access**: Students can only read or list `examPackets` where `status == 'published'` and `questions` where `packetStatus == 'published'`. Draft exams remain hidden from non-admins.
4. **Question Referential Integrity**: A `Question` document cannot be created unless its referenced `packetId` exists in `/examPackets/{packetId}`.
5. **Attempt Ownership & Immutability**: Students can only create `attempts` with `userId == request.auth.uid` and `createdAt == request.time`, list only their own attempts (`resource.data.userId == request.auth.uid`), and cannot retroactively tamper with scores.
6. **Live Session Proctoring Isolation**: Students can only create, read, update, or delete their own `/liveSessions/{userId}` document (`userId == request.auth.uid`) with server-verified timestamps (`updatedAt == request.time`). Only Admins can `list` all `/liveSessions` for real-time monitoring.

## 2. Dirty Dozen Adversarial Payloads
1. **Self-Admin Escalation**: Student writes `{ uid: "<studentUid>", email: "evil@example.com", name: "Hacker", createdAt: serverTimestamp() }` to `/admins/<studentUid>` -> `PERMISSION_DENIED`.
2. **Email Spoofing**: Unverified token (`email_verified: false`) with admin email attempts to create an `examPacket` -> `PERMISSION_DENIED`.
3. **Shadow Field Injection**: User creates `/users/<uid>` or `/admins/<uid>` with extra ghost field `{ isAdmin: true }` -> `PERMISSION_DENIED`.
4. **ID Poisoning**: Client writes to `/examPackets/<1500-char-invalid-id>` -> `PERMISSION_DENIED`.
5. **Draft Leakage via List**: Student lists `/examPackets` without `where('status', '==', 'published')` -> `PERMISSION_DENIED`.
6. **Orphaned Question**: Admin attempts to create a `Question` referencing a non-existent `packetId` -> `PERMISSION_DENIED`.
7. **Attempt Spoofing**: Student submits an attempt with `userId: "<otherStudentUid>"` -> `PERMISSION_DENIED`.
8. **Score Tampering**: Student attempts to `update` their existing attempt in `/attempts/<id>` to raise `score` from `60` to `100` -> `PERMISSION_DENIED`.
9. **Timestamp Forgery**: Student submits `createdAt: "2020-01-01T00:00:00Z"` or forged `updatedAt` in `/liveSessions/<uid>` instead of `request.time` -> `PERMISSION_DENIED`.
10. **Payload Exhaustion**: User sends a 100KB `prompt` string in `/questions` or `/users` -> `PERMISSION_DENIED`.
11. **Array Overflow**: Question submitted with 10 options instead of bounded 2–6 options (`options.size() >= 2 && options.size() <= 6`) -> `PERMISSION_DENIED`.
12. **Live Session Cross-Student Scraping**: Student queries `list` on `/liveSessions` or writes to `/liveSessions/<otherUid>` -> `PERMISSION_DENIED`.
