# Installation dédiée client (hors Naxialis)

Instance **privée** mono-administrateur — pas d’inscription publique, pas de facturation SaaS.

## Fournir

1. Domaine + TLS (reverse proxy client)
2. PostgreSQL dédié
3. Secrets propres (`AUTH_*`, chiffrement AppSettings, etc.)
4. Agents OpenAI (IDs client)
5. WordPress et/ou Webflow (brouillons uniquement)
6. Google OAuth / propriétés **du client** (pas `sc-domain:naxialis.com`)
7. Sauvegardes + monitoring

## Interdits

- Credentials Naxialis en dur
- Imposer les propriétés GSC/GA4 Naxialis
- Multi-tenant SaaS (WS-001 NO GO)

## Intégrations facultatives

L’absence d’OpenAI/CMS/Google au boot ne doit pas empêcher le démarrage si les secrets infra critiques sont présents. Les modules se configurent ensuite via Paramètres.
