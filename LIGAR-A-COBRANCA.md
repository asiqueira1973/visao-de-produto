# Cobrança — ligada em 20/08/2026

Produção está cobrando de verdade. Este documento passou de roteiro a registro do que foi
feito e do que ficou faltando.

---

## O que foi ligado

| | |
|---|---|
| Conta Stripe | `acct_1SKfAnAp9lgD48tZ` — **Dab Lab**, BR/BRL, cobra e recebe repasse, zero pendências |
| Produto | `prod_V6thonXKwKR3gX` — *Visão de Produto — Plano pago* |
| Preço | `price_1U6ftoAp9lgD48tZzvc4q7lc` — R$ 50,00/mês |
| Webhook | `we_1U6ftoAp9lgD48tZFTSnhELB` → `app.visaodeproduto.com.br/api/cobranca/webhook`, 6 eventos, `enabled` |
| Vercel Production | `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` |

`GET /api/saude` agora responde `cobranca: { ligada, modo, webhook_configurado }`. Em
produção diz `modo: "producao"`; em dev, `modo: "teste"`. É a forma mais rápida de saber se
um deploy leu as variáveis.

## O que foi provado, e como

- **Sessão de checkout real** criada contra o preço de produção: R$ 50,00 em BRL,
  `livemode: true`, e expirada em seguida sem cobrar ninguém.
- **Assinatura do webhook**: um evento assinado com o segredo de produção foi aceito com
  200; o mesmo evento assinado com segredo errado foi recusado com 400. O evento de prova
  usava um cliente inexistente, então não tocou em conta nenhuma, e a linha foi apagada.
- **E-mail de pagamento recusado**, provado antes no dev com webhook assinado: a conta
  virou `atrasada` e o e-mail chegou. A retentativa da mesma fatura não gerou segundo
  e-mail.

## As duas contas Stripe

A chave de teste do `.env` pertence a `acct_1SKfAxAPksbqEmZZ`, que é um **Sandbox** — conta
separada, com id próprio. A conta real é `acct_1SKfAnAp9lgD48tZ`. Não confunda: o produto
e o preço de teste vivem no sandbox e não têm relação com os de produção.

## O que ainda não foi provado

**Ninguém pagou de verdade ainda.** O caminho completo — cartão real, dinheiro entrando,
webhook chegando pela Stripe, conta promovida — só se prova com uma assinatura de verdade.

E há um obstáculo: **a conta do dono é cortesia**, então a tela mostra *"Plano pago, por
cortesia"* e não oferece o botão de assinar. Para testar existem dois caminhos:

1. Tirar a cortesia da conta dele por alguns minutos, assinar com cartão real (R$ 50
   cobrados de verdade), conferir a promoção, cancelar e devolver a cortesia.
2. Criar uma conta nova com outro Google e assinar por ela.

O segundo é mais limpo, porque não mexe no estado da conta principal.

## O que falta para a primeira nota fiscal

Duas perguntas em [`NOTA-FISCAL.md`](NOTA-FISCAL.md) seguem marcadas como *a confirmar com
a Contabilizei*: o prazo municipal de emissão, e o código de serviço municipal com a
alíquota do ISS. Nenhuma bloqueia cobrar; as duas bloqueiam emitir.
