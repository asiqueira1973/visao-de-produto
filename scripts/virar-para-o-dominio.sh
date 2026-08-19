#!/usr/bin/env bash
#
# A virada para o domínio próprio, num comando.
#
# O que faz: aponta produção para os endereços próprios, na ordem em que a
#            ordem importa.
# Recebe:    nada; lê o .env da raiz.
# Devolve:   o que mudou, passo a passo.
# Implementa: a fase C do épico 8.9.
#
# POR QUE ISTO É UM SCRIPT, E POR QUE A ORDEM É ESTA:
#
# O passo 1 vem antes de tudo. A função do MCP anuncia o próprio endereço, e
# até ela saber o endereço novo, qualquer cliente que se conectar recebe um
# documento de OAuth apontando para o lugar errado — e a conexão é recusada sem
# mensagem que explique. Trocar o endereço do site antes disso quebraria o
# conector de quem já está conectado.
#
# Nada aqui é destrutivo, e rodar duas vezes não faz mal.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a

API="https://api.visaodeproduto.com.br"
APP="https://app.visaodeproduto.com.br"
PROD="glohvqzopiffdghwppor"

S=./node_modules/.bin/supabase
V=./node_modules/.bin/vercel
limpo() { grep -viE "update available|changelog|run .pnpm|^╭|^│|^╰|Vercel CLI|^$" || true; }

echo "1. A função do MCP passa a anunciar o endereço próprio"
$S secrets set --project-ref "$PROD" VISAO_ORIGEM_PUBLICA="$API" VISAO_SITE="$APP" >/dev/null
echo "   VISAO_ORIGEM_PUBLICA=$API"
echo "   VISAO_SITE=$APP"

echo
echo "2. Republica as duas Edge Functions, para pegarem o segredo novo"
$S functions deploy mcp    --project-ref "$PROD" --no-verify-jwt 2>&1 | tail -1
$S functions deploy ingest --project-ref "$PROD" --no-verify-jwt 2>&1 | tail -1

echo
echo "3. O site de produção passa a se conhecer pelo endereço próprio"
$V env rm NEXT_PUBLIC_SITE_URL production --yes >/dev/null 2>&1 || true
printf '%s' "$APP" | $V env add NEXT_PUBLIC_SITE_URL production >/dev/null 2>&1
echo "   NEXT_PUBLIC_SITE_URL=$APP"

$V env rm NEXT_PUBLIC_SUPABASE_URL production --yes >/dev/null 2>&1 || true
printf '%s' "$API" | $V env add NEXT_PUBLIC_SUPABASE_URL production >/dev/null 2>&1
echo "   NEXT_PUBLIC_SUPABASE_URL=$API"

echo
echo "4. Confere que o MCP anuncia o endereço certo"
sleep 5
curl -s "$API/functions/v1/mcp/.well-known/oauth-protected-resource" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('   resource:', d['resource']); print('   autorização:', d['authorization_servers'][0])" \
  || echo "   (ainda não responde; o certificado pode estar sendo emitido)"

echo
echo "Falta, e é com o dono:"
echo "  - Google Cloud Console: trocar a URI para $API/auth/v1/callback"
echo "  - Supabase Auth: Site URL e Redirect URLs para $APP"
echo "  - Stripe: endpoint de webhook em $APP/api/cobranca/webhook"
echo "  - Reconectar o Claude Desktop no endereço novo"
