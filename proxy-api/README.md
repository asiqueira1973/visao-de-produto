# api.visaodeproduto.com.br — repasse para o Supabase

Este projeto não tem código. Ele existe para manter o endereço
`api.visaodeproduto.com.br` de pé sem pagar o add-on de Custom Domain do
Supabase, que custa 10 dólares por mês.

## Por que o endereço precisa sobreviver

A chave de ingestão e o host ficam dentro do aplicativo de quem instrumenta, e
ficam lá por anos. O Agenda Psi, publicado nas duas lojas, tem
`https://api.visaodeproduto.com.br/functions/v1/ingest` compilado no binário:
trocar esse endereço exigiria uma versão nova em cada loja, e ainda assim
deixaria de fora quem não atualiza.

O proxy resolve isso: o endereço continua existindo e continua sendo nosso.
Muda só quem atende atrás dele.

## O que ele faz

Um único rewrite, que repassa qualquer caminho para
`glohvqzopiffdghwppor.supabase.co`. Método, corpo e cabeçalhos passam
intactos — inclusive o `x-api-key`, que é o que autentica a ingestão.

Medido antes de valer: a latência pelo proxy é igual à do domínio próprio do
Supabase, e a deduplicação por `id` continua funcionando.

## O endereço curto do MCP

Antes do repasse genérico há duas regras específicas, e **a ordem importa** (a Vercel
usa a primeira que casar):

- `/mcp` → `/functions/v1/mcp/mcp?endereco=curto`
- `/.well-known/oauth-protected-resource/mcp` → o documento RFC 9728 da função, com o
  mesmo marcador

O `?endereco=curto` é o que avisa a função de que o cliente entrou pelo endereço curto,
para ela anunciar esse mesmo endereço no OAuth. Sem ele, a conexão é recusada.

## O que não pode acontecer aqui

**A proteção de deploy da Vercel precisa ficar desligada.** Com ela ligada,
toda chamada recebe uma página de login da Vercel em vez da API, e a ingestão
para sem erro que explique.
