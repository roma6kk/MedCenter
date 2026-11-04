# B-auth-tokens progress
- be-auth-oauth-01: done a16334d (+ spec fix 1c617b0) — Redis token store and denylist (GETDEL spend), in-memory only without REDIS_URL
- be-auth-oauth-04: done be4c97f — find, resolve grant, then atomic consume
- be-auth-oauth-02: done a16334d — JwtAuthGuard falls back to a Redis revocation checker over oauth:deny:session:* (no BFF app.module edits needed, other lanes untouched)
- be-auth-oauth-08: question — Спека (§2.1.3 строка 237, ADR-008/011) прямо говорит, что ротация сессию не закрывает, и не предписывает отзыв при повторе. Закрывать ли всю сессию при повторном предъявлении погашенного refresh/кода (вариант A, RFC 9700, допуск ~10 с) или оставить отказ запроса (B)? Рекомендация: A, теперь когда хранилище в Redis.
- be-auth-oauth-07: done 79c4c53 — PEM parsed and pair matched at boot; PKCS#8/SPKI B64 accepted; README
- be-auth-oauth-12: done b9e629f — redirectUris refine
- be-auth-oauth-05: done 8ad87c2 — applyHttpEdge, duplicate trust-proxy removed
Status: done
